import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';
import { UsersService } from './users.service';
import { SmsService } from '../sms/sms.service';
import { toE164Vn } from '../common/utils/text.util';
import {
  OTP_MAX_SENDS_PER_HOUR,
  OTP_RESEND_INTERVAL_MS,
  OTP_SEND_WINDOW_MS,
  OTP_TTL_MS,
  buildOtpMessage,
  generateOtp,
  hashOtp,
  verifyOtp,
} from '../packages/utils/shipper-verification.util';
import { assertActiveAccount } from './utils/active-account.util';
import { ApprovalStatus } from './enums/approval-status.enum';
import {
  RequestPhoneChangeDto,
  UserProfileResponseDto,
  VerifyPhoneChangeDto,
} from './dto';

const MAX_VERIFY_ATTEMPTS = 5;

// Dịch vụ đổi số điện thoại cá nhân: gửi OTP SMS tới số mới và chỉ lưu số mới sau khi OTP được xác nhận
@Injectable()
export class UserPhoneChangeService {
  private readonly logger = new Logger(UserPhoneChangeService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly usersService: UsersService,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
  ) {}

  // Khóa bí mật dùng để băm mã OTP, ưu tiên khóa riêng và dự phòng bằng khóa JWT
  private getOtpSecret(): string {
    return (
      this.configService.get<string>('OTP_HASH_SECRET') ||
      this.configService.get<string>('JWT_ACCESS_SECRET_KEY') ||
      ''
    );
  }

  // Gắn mã OTP với cả tài khoản lẫn số mới để mã của người này không dùng được cho tài khoản hoặc số khác
  private buildHashKey(userId: string, phone: string): string {
    return `${userId}:${phone}`;
  }

  // Gửi mã OTP 6 số tới số điện thoại mới, giới hạn tần suất theo tài khoản để tránh tốn cước SMS và dò số
  async requestOtp(userId: string, dto: RequestPhoneChangeDto) {
    const user = await this.userModel.findById(userId).lean().exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }
    assertActiveAccount(user.approvalStatus);

    const newPhone = dto.phone;
    if (newPhone === user.phone) {
      throw new BadRequestException(
        'Số điện thoại mới trùng với số hiện tại của bạn',
      );
    }

    const owner = await this.userModel
      .findOne({ phone: newPhone, _id: { $ne: userId } })
      .select('_id')
      .lean()
      .exec();
    if (owner) {
      throw new ConflictException('Số điện thoại này đã được sử dụng');
    }

    const previousLastSentAt = user.phoneChange?.lastSentAt;
    await this.claimSendSlot(userId);

    // Gửi SMS khi đã giữ được lượt: nếu cổng SMS lỗi thì hoàn lại lượt và không có mã nào còn hiệu lực
    const otp = generateOtp();
    try {
      await this.smsService.send(toE164Vn(newPhone), buildOtpMessage(otp));
    } catch (error) {
      await this.releaseSendSlot(userId, previousLastSentAt);
      throw error;
    }

    await this.userModel
      .updateOne(
        { _id: userId },
        {
          $set: {
            'phoneChange.phone': newPhone,
            'phoneChange.otp': hashOtp(
              this.buildHashKey(userId, newPhone),
              otp,
              this.getOtpSecret(),
            ),
            'phoneChange.expiresAt': new Date(Date.now() + OTP_TTL_MS),
            'phoneChange.failedAttempts': 0,
          },
        },
      )
      .exec();

    this.logger.log(`[PHONE_CHANGE] Đã gửi OTP đổi số cho tài khoản ${userId}`);

    return {
      success: true,
      message: 'Đã gửi mã xác thực 6 số qua SMS tới số điện thoại mới',
      expiresInSeconds: OTP_TTL_MS / 1000,
      // Chỉ trả mã về khi bật chế độ thử nghiệm để phục vụ demo
      ...(this.smsService.devMode ? { devOtp: otp } : {}),
    };
  }

  // Giữ một lượt gửi SMS bằng cập nhật nguyên tử có điều kiện, nên các request song song không thể cùng vượt thời gian chờ và hạn mức
  private async claimSendSlot(userId: string): Promise<void> {
    const now = Date.now();

    // Mở cửa sổ đếm mới khi chưa có hoặc đã quá một giờ; chỉ một request thắng vì điều kiện lọc loại các request sau
    await this.userModel
      .updateOne(
        {
          _id: userId,
          $or: [
            { 'phoneChange.sendWindowStartedAt': { $exists: false } },
            {
              'phoneChange.sendWindowStartedAt': {
                $lte: new Date(now - OTP_SEND_WINDOW_MS),
              },
            },
          ],
        },
        {
          $set: {
            'phoneChange.sendWindowStartedAt': new Date(now),
            'phoneChange.sendCount': 0,
          },
        },
      )
      .exec();

    const claimed = await this.userModel
      .findOneAndUpdate(
        {
          _id: userId,
          approvalStatus: ApprovalStatus.ACTIVE,
          'phoneChange.sendCount': { $lt: OTP_MAX_SENDS_PER_HOUR },
          $or: [
            { 'phoneChange.lastSentAt': { $exists: false } },
            {
              'phoneChange.lastSentAt': {
                $lte: new Date(now - OTP_RESEND_INTERVAL_MS),
              },
            },
          ],
        },
        {
          $set: { 'phoneChange.lastSentAt': new Date(now) },
          $inc: { 'phoneChange.sendCount': 1 },
        },
      )
      .select('_id')
      .lean()
      .exec();
    if (claimed) return;

    const current = await this.userModel
      .findById(userId)
      .lean()
      .exec();
    const lastSentAt = current?.phoneChange?.lastSentAt;
    if (lastSentAt && now - lastSentAt.getTime() < OTP_RESEND_INTERVAL_MS) {
      const waitSeconds = Math.ceil(
        (OTP_RESEND_INTERVAL_MS - (now - lastSentAt.getTime())) / 1000,
      );
      throw new BadRequestException(
        `Vui lòng đợi ${waitSeconds} giây trước khi yêu cầu gửi lại mã OTP`,
      );
    }
    throw new BadRequestException(
      'Bạn đã yêu cầu mã OTP quá nhiều lần, vui lòng thử lại sau 1 giờ',
    );
  }

  // Hoàn lại lượt gửi đã giữ khi cổng SMS báo lỗi để người dùng không mất lượt oan
  private async releaseSendSlot(
    userId: string,
    previousLastSentAt?: Date,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        {
          $inc: { 'phoneChange.sendCount': -1 },
          $set: { 'phoneChange.lastSentAt': previousLastSentAt ?? new Date(0) },
        },
      )
      .exec();
  }

  // Kiểm tra OTP rồi mới lưu số điện thoại mới và xóa yêu cầu đang chờ
  async verifyOtp(
    userId: string,
    dto: VerifyPhoneChangeDto,
  ): Promise<UserProfileResponseDto> {
    // Trừ một lượt thử trước khi so mã bằng cập nhật nguyên tử, nên request song song không vượt được giới hạn số lần nhập
    const claimed = await this.userModel
      .findOneAndUpdate(
        {
          _id: userId,
          approvalStatus: ApprovalStatus.ACTIVE,
          'phoneChange.phone': dto.phone,
          'phoneChange.otp': { $exists: true },
          'phoneChange.expiresAt': { $gt: new Date() },
          'phoneChange.failedAttempts': { $lt: MAX_VERIFY_ATTEMPTS },
        },
        { $inc: { 'phoneChange.failedAttempts': 1 } },
        { returnDocument: 'after' },
      )
      .select('+phoneChange.otp')
      .lean()
      .exec();

    if (!claimed?.phoneChange?.otp) {
      return this.rejectVerify(userId, dto.phone);
    }

    const storedHash = claimed.phoneChange.otp;
    const isMatch = verifyOtp(
      this.buildHashKey(userId, dto.phone),
      dto.otp,
      storedHash,
      this.getOtpSecret(),
    );
    if (!isMatch) {
      const remaining = MAX_VERIFY_ATTEMPTS - claimed.phoneChange.failedAttempts;
      if (remaining <= 0) await this.clearPendingOtp(userId);
      throw new BadRequestException(
        remaining > 0
          ? `Mã OTP không chính xác. Bạn còn ${remaining} lần thử`
          : 'Bạn đã nhập sai OTP quá 5 lần. Vui lòng yêu cầu mã xác thực mới',
      );
    }

    await this.savePhone(userId, dto.phone, storedHash);
    return this.usersService.getProfile(userId);
  }

  // Giải thích vì sao không giữ được lượt thử OTP để trả đúng thông báo cho người dùng
  private async rejectVerify(userId: string, phone: string): Promise<never> {
    const user = await this.userModel.findById(userId).lean().exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }
    assertActiveAccount(user.approvalStatus);

    const pending = user.phoneChange;
    if (!pending?.phone || pending.phone !== phone || !pending.expiresAt) {
      throw new BadRequestException(
        'Chưa có yêu cầu đổi sang số này hoặc mã OTP đã hết hiệu lực',
      );
    }
    if (pending.failedAttempts >= MAX_VERIFY_ATTEMPTS) {
      await this.clearPendingOtp(userId);
      throw new BadRequestException(
        'Bạn đã nhập sai OTP quá 5 lần. Vui lòng yêu cầu mã xác thực mới',
      );
    }
    throw new BadRequestException(
      'Mã OTP đã hết hạn sử dụng. Vui lòng yêu cầu gửi lại mã mới',
    );
  }

  // Hủy mã OTP đang chờ nhưng giữ bộ đếm gửi để giới hạn tần suất vẫn còn hiệu lực
  private async clearPendingOtp(userId: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        { $unset: { 'phoneChange.otp': 1, 'phoneChange.expiresAt': 1 } },
      )
      .exec();
  }

  // Lưu số mới và bỏ mã OTP; điều kiện khớp mã băm khiến mỗi mã chỉ dùng được một lần, chỉ mục unique chặn số vừa bị tài khoản khác lấy mất
  private async savePhone(
    userId: string,
    phone: string,
    storedHash: string,
  ): Promise<void> {
    let matchedCount = 0;
    try {
      const result = await this.userModel
        .updateOne(
          {
            _id: userId,
            approvalStatus: ApprovalStatus.ACTIVE,
            'phoneChange.otp': storedHash,
          },
          {
            $set: { phone, 'phoneChange.failedAttempts': 0 },
            $unset: {
              'phoneChange.phone': 1,
              'phoneChange.otp': 1,
              'phoneChange.expiresAt': 1,
            },
          },
        )
        .exec();
      matchedCount = result.matchedCount;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException('Số điện thoại này đã được sử dụng');
      }
      throw error;
    }

    if (matchedCount === 0) {
      throw new BadRequestException(
        'Mã OTP đã được sử dụng hoặc không còn hiệu lực. Vui lòng yêu cầu mã mới',
      );
    }
  }
}
