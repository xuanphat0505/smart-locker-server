import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Package, ShipperSession } from './schemas';
import { Locker } from '../lockers/schemas/locker.schema';
import { Box } from '../lockers/schemas/box.schema';
import { User } from '../users/schemas/user.schema';
import {
  DropOffPackageDto,
  PickupOtpDto,
  PickupQrDto,
  PickupFaceDto,
  SendShipperOtpDto,
  VerifyShipperOtpDto,
  VerifyFirebaseTokenDto,
} from './dto';
import { PackageStatus } from './enums';
import { BoxSize, BoxStatus, DoorStatus, LockerAction } from '../lockers/enums';
import { Role } from '../auth/enums/role.enum';
import { ApprovalStatus } from '../users/enums/approval-status.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { MqttService } from '../mqtt/mqtt.service';
import { FaceVerificationService } from '../ai/services/face-verification.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentType } from '../payments/enums/payment.enums';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { generateUniquePinCode } from './utils/pin-code.util';
import { normalizeShipperName, resolveSessionName } from './utils/shipper-name.util';
import {
  buildOverdueFilter,
  computeExpiredAt,
  resolveStorageLimitHours,
} from './utils/package-expiry.util';
import { assertTrackingNumberNotInUse, normalizeTrackingNumber } from './utils/tracking-code.util';
import {
  DEPOSIT_TTL_MS,
  DROP_OFF_UNLOCK_MS,
  isSensorReportingItem,
} from './utils/deposit-decision.util';
import {
  DEPOSIT_RESULT_WINDOW_MS,
  generateDepositToken,
  hashDepositToken,
  verifyDepositToken,
} from './utils/deposit-token.util';
import { getFirebaseAuth } from '../config/firebase-admin.config';
import { SmsService } from '../sms/sms.service';
import { toE164Vn } from '../sms/utils/phone.util';
import {
  OTP_MAX_SENDS_PER_HOUR,
  OTP_RESEND_INTERVAL_MS,
  OTP_SEND_WINDOW_MS,
  OTP_TTL_MS,
  buildOtpMessage,
  generateOtp,
  hashOtp,
  verifyOtp,
} from './utils/otp.util';

@Injectable()
export class PackagesService {
  private readonly logger = new Logger(PackagesService.name);

  constructor(
    @InjectModel(Package.name) private readonly packageModel: Model<Package>,
    @InjectModel(ShipperSession.name)
    private readonly shipperSessionModel: Model<ShipperSession>,
    @InjectModel(Locker.name) private readonly lockerModel: Model<Locker>,
    @InjectModel(Box.name) private readonly boxModel: Model<Box>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly notificationsService: NotificationsService,
    private readonly mqttService: MqttService,
    private readonly faceVerificationService: FaceVerificationService,
    private readonly paymentsService: PaymentsService,
    private readonly activityLogsService: ActivityLogsService,
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

  // Tài xế bắt đầu gửi hàng: giữ chỗ ngăn tủ, mở khóa và tạo kiện ở trạng thái chờ đặt hàng; kiện chỉ được ghi nhận và báo cho cư dân khi cảm biến xác nhận hàng đã nằm trong ngăn
  async dropOff(dto: DropOffPackageDto) {
    const formattedLockerCode = dto.lockerCode.trim().toUpperCase();
    const locker = await this.lockerModel
      .findOne({ code: formattedLockerCode })
      .populate('buildingId', 'name code pricingPolicy');

    if (!locker) {
      throw new NotFoundException(`Trạm tủ với mã ${dto.lockerCode} không tồn tại`);
    }

    const building = locker.buildingId as unknown as {
      _id: Types.ObjectId;
      name?: string;
      pricingPolicy?: { t3Hours?: number };
    };
    const targetBuildingId = building?._id || locker.buildingId;

    const resident = await this.userModel.findOne({
      phone: dto.receiverPhone.trim(),
      buildingId: targetBuildingId,
      role: Role.RESIDENT,
      approvalStatus: ApprovalStatus.ACTIVE,
    });

    if (!resident) {
      throw new NotFoundException(
        'Số điện thoại người nhận chưa đăng ký làm cư dân hoặc chưa được duyệt',
      );
    }

    const box = await this.boxModel.findOne({
      lockerId: locker._id,
      boxNumber: dto.boxNumber,
    });

    if (!box) {
      throw new NotFoundException(`Ngăn tủ số ${dto.boxNumber} không tồn tại trên trạm này`);
    }

    if (box.status !== BoxStatus.AVAILABLE) {
      throw new BadRequestException(
        `Ngăn tủ số ${dto.boxNumber} hiện không khả dụng (đang chứa hàng hoặc bảo trì)`,
      );
    }

    // Kiểm tra cấp bậc kích thước ngăn tủ có đủ chứa kiện hàng không
    const sizeRank: Record<BoxSize, number> = {
      [BoxSize.SMALL]: 1,
      [BoxSize.MEDIUM]: 2,
      [BoxSize.LARGE]: 3,
    };

    if (sizeRank[box.size] < sizeRank[dto.boxSize]) {
      throw new BadRequestException(
        `Ngăn tủ số #${dto.boxNumber} (Cỡ ${box.size}) không đủ chứa kiện hàng (Cỡ ${dto.boxSize}). Vui lòng chọn ngăn lớn hơn hoặc bằng.`,
      );
    }

    // Ngăn được ghi nhận trống nhưng cảm biến vừa báo có vật thì không cho gửi chồng, cần người vận hành kiểm tra
    if (
      isSensorReportingItem(
        box.lastSensor
          ? {
              doorStatus: box.lastSensor.doorStatus,
              hasItem: box.lastSensor.hasItem,
              at: new Date(box.lastSensor.at).getTime(),
            }
          : null,
        Date.now(),
      )
    ) {
      throw new ConflictException(
        `Cảm biến báo ngăn số ${dto.boxNumber} đang có vật bên trong, vui lòng chọn ngăn khác hoặc báo Ban Quản Lý kiểm tra`,
      );
    }

    const trackingNumber = normalizeTrackingNumber(dto.trackingNumber);
    await assertTrackingNumberNotInUse(this.packageModel, trackingNumber, targetBuildingId);

    const pinCode = await generateUniquePinCode(this.packageModel, locker._id);

    const qrCodeToken = crypto.randomBytes(16).toString('hex');
    const droppedOffAt = new Date();
    const expiredAt = computeExpiredAt(
      droppedOffAt,
      resolveStorageLimitHours(building?.pricingPolicy),
    );

    const normalizedShipperPhone = dto.shipperPhone.trim().replace(/^(\+84)/, '0');

    // Kiểm tra trạng thái xác thực số điện thoại của tài xế và tự động gia hạn phiên (Sliding Expiration)
    let isShipperVerified = false;
    let verifiedShipperName: string | undefined;
    const rollingExpiresAt = new Date(
      Date.now() + 60 * 24 * 60 * 60 * 1000, // Gia hạn thêm 60 ngày kể từ lần gửi này
    );

    if (dto.sessionToken) {
      const validSession = await this.shipperSessionModel.findOne({
        phone: normalizedShipperPhone,
        sessionToken: dto.sessionToken.trim(),
        sessionExpiresAt: { $gt: new Date() },
      });
      if (validSession) {
        isShipperVerified = true;
        verifiedShipperName = validSession.name;
        validSession.sessionExpiresAt = rollingExpiresAt;
        await validSession.save();
      }
    }

    // Giữ chỗ ngăn bằng cập nhật có điều kiện để hai tài xế chọn cùng một ngăn thì chỉ một người giữ được
    const claimedBox = await this.boxModel.findOneAndUpdate(
      { _id: box._id, status: BoxStatus.AVAILABLE },
      {
        $set: {
          status: BoxStatus.OCCUPIED,
          doorStatus: DoorStatus.OPEN,
          hasItem: false,
        },
      },
      { returnDocument: 'after' },
    );
    if (!claimedBox) {
      throw new ConflictException(
        `Ngăn tủ số ${dto.boxNumber} vừa được người khác sử dụng, vui lòng chọn ngăn khác`,
      );
    }

    const depositToken = generateDepositToken();
    const depositExpiresAt = new Date(droppedOffAt.getTime() + DEPOSIT_TTL_MS);

    let newPackage;
    try {
      newPackage = await this.packageModel.create({
        trackingNumber,
        lockerId: locker._id,
        boxId: box._id,
        boxNumber: dto.boxNumber,
        boxSize: dto.boxSize,
        buildingId: targetBuildingId,
        residentId: resident._id,
        receiverPhone: resident.phone,
        receiverName: resident.name,
        apartment: resident.apartment || '',
        shipperPhone: normalizedShipperPhone,
        // Tài xế đã xác thực thì dùng tên gắn với phiên, không tin tên do client gửi theo từng đơn
        shipperName:
          verifiedShipperName ||
          (dto.shipperName ? normalizeShipperName(dto.shipperName) : undefined),
        isShipperVerified,
        carrierName: dto.carrierName.trim(),
        pinCode,
        qrCodeToken,
        status: PackageStatus.PENDING_DEPOSIT,
        droppedOffAt,
        expiredAt,
        depositTokenHash: hashDepositToken(depositToken),
        depositUnlockedAt: droppedOffAt,
        depositExpiresAt,
        note: dto.note?.trim(),
      });
    } catch (error) {
      // Tạo kiện thất bại thì trả ngăn về trống để không giữ chỗ vô ích
      await this.boxModel.updateOne(
        { _id: box._id },
        { $set: { status: BoxStatus.AVAILABLE, hasItem: false } },
      );
      throw error;
    }

    await this.boxModel.updateOne(
      { _id: box._id },
      { $set: { currentPackageId: newPackage._id } },
    );

    // Phát lệnh mở khóa Solenoid tới phần cứng ESP32 qua MQTT; thời gian mở dài hơn lúc nhận hàng để tài xế kịp kéo cửa
    this.mqttService
      .publishDoorUnlock(locker.code, box.boxNumber, DROP_OFF_UNLOCK_MS)
      .catch((err) => {
        this.logger.error(
          `Lỗi khi phát lệnh mở cửa MQTT cho trạm ${locker.code} ngăn #${box.boxNumber}: ${err}`,
        );
      });

    return {
      message:
        'Đã mở ngăn tủ, vui lòng đặt hàng vào và đóng cửa để hoàn tất. Kiện chỉ được ghi nhận khi cảm biến xác nhận',
      package: {
        _id: String(newPackage._id),
        trackingNumber: newPackage.trackingNumber,
        receiverName: newPackage.receiverName,
        receiverPhone: newPackage.receiverPhone,
        apartment: newPackage.apartment,
        boxNumber: newPackage.boxNumber,
        boxSize: newPackage.boxSize,
        status: newPackage.status,
        isShipperVerified: newPackage.isShipperVerified,
        droppedOffAt: newPackage.droppedOffAt,
        expiredAt: newPackage.expiredAt,
      },
      depositToken,
      depositExpiresAt,
      action: {
        command: 'OPEN_DOOR',
        boxNumber: newPackage.boxNumber,
      },
    };
  }

  // Tra cứu kết quả lượt gửi bằng mã xác nhận của tài xế; chỉ trả OTP sau khi đã được cảm biến xác nhận và trong thời gian ngắn
  async getDepositStatus(id: string, depositToken?: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Mã kiện hàng không hợp lệ');
    }

    const pkg = await this.packageModel
      .findById(id)
      .select('+depositTokenHash');
    if (!pkg) {
      throw new NotFoundException('Kiện hàng không tồn tại trong hệ thống');
    }
    if (!verifyDepositToken(depositToken, pkg.depositTokenHash)) {
      throw new ForbiddenException('Mã xác nhận lượt gửi không hợp lệ');
    }

    const confirmedRecently =
      pkg.status === PackageStatus.WAITING_FOR_PICKUP &&
      pkg.depositConfirmedAt &&
      Date.now() - pkg.depositConfirmedAt.getTime() <= DEPOSIT_RESULT_WINDOW_MS;

    return {
      packageId: String(pkg._id),
      status: pkg.status,
      doorOpened: Boolean(pkg.depositDoorOpenedAt),
      depositExpiresAt: pkg.depositExpiresAt,
      cancelReason: pkg.depositCancelReason,
      package: confirmedRecently
        ? {
            _id: String(pkg._id),
            trackingNumber: pkg.trackingNumber,
            receiverName: pkg.receiverName,
            receiverPhone: pkg.receiverPhone,
            apartment: pkg.apartment,
            boxNumber: pkg.boxNumber,
            boxSize: pkg.boxSize,
            pinCode: pkg.pinCode,
            shipperName: pkg.shipperName,
            status: pkg.status,
            droppedOffAt: pkg.droppedOffAt,
            expiredAt: pkg.expiredAt,
          }
        : undefined,
    };
  }

  // Gửi mã xác thực OTP 6 số tới số điện thoại của tài xế giao hàng
  async sendShipperOtp(dto: SendShipperOtpDto) {
    const normalizedPhone = dto.phone.trim().replace(/^(\+84)/, '0');

    const existingSession = await this.shipperSessionModel.findOne({
      phone: normalizedPhone,
    });
    const now = Date.now();

    // Giới hạn tần suất gửi lại mã OTP tối thiểu 60 giây
    if (
      existingSession?.lastResendAt &&
      now - existingSession.lastResendAt.getTime() < OTP_RESEND_INTERVAL_MS
    ) {
      const waitSeconds = Math.ceil(
        (OTP_RESEND_INTERVAL_MS - (now - existingSession.lastResendAt.getTime())) / 1000,
      );
      throw new BadRequestException(
        `Vui lòng đợi ${waitSeconds} giây trước khi yêu cầu gửi lại mã OTP`,
      );
    }

    // Giới hạn số tin nhắn gửi tới mỗi số trong một giờ để tránh bị lợi dụng làm tốn cước SMS
    const windowStartedAt = existingSession?.sendWindowStartedAt;
    const isWindowActive =
      !!windowStartedAt && now - windowStartedAt.getTime() < OTP_SEND_WINDOW_MS;
    const sendCount = isWindowActive ? (existingSession?.sendCount ?? 0) : 0;
    if (sendCount >= OTP_MAX_SENDS_PER_HOUR) {
      throw new BadRequestException(
        'Bạn đã yêu cầu mã OTP quá nhiều lần, vui lòng thử lại sau 1 giờ',
      );
    }

    // Gửi SMS trước khi lưu: nếu cổng SMS lỗi thì không có mã nào còn hiệu lực
    const otp = generateOtp();
    await this.smsService.send(toE164Vn(normalizedPhone), buildOtpMessage(otp));

    await this.shipperSessionModel.findOneAndUpdate(
      { phone: normalizedPhone },
      {
        phone: normalizedPhone,
        otp: hashOtp(normalizedPhone, otp, this.getOtpSecret()),
        otpExpiresAt: new Date(now + OTP_TTL_MS),
        failedAttempts: 0,
        lastResendAt: new Date(now),
        sendCount: sendCount + 1,
        sendWindowStartedAt: isWindowActive ? windowStartedAt : new Date(now),
      },
      { upsert: true, returnDocument: 'after' },
    );

    this.logger.log(`[SMS_OTP] Đã gửi mã xác thực tới tài xế ${normalizedPhone}`);

    return {
      success: true,
      message: `Đã gửi mã xác thực 6 số qua SMS tới ${normalizedPhone}`,
      expiresInSeconds: OTP_TTL_MS / 1000,
      // Chỉ trả mã về khi bật chế độ thử nghiệm để phục vụ demo
      ...(this.smsService.devMode ? { devOtp: otp } : {}),
    };
  }

  // Xác minh mã OTP 6 số và cấp token phiên tin cậy 60 ngày cho tài xế
  async verifyShipperOtp(dto: VerifyShipperOtpDto) {
    const normalizedPhone = dto.phone.trim().replace(/^(\+84)/, '0');
    const inputOtp = dto.otp.trim();

    const session = await this.shipperSessionModel.findOne({
      phone: normalizedPhone,
    });

    if (!session || !session.otp || !session.otpExpiresAt) {
      throw new BadRequestException('Số điện thoại chưa yêu cầu gửi mã OTP hoặc phiên đã kết thúc');
    }

    // Chống vét cạn: Quá 5 lần sai thì hủy mã OTP
    if (session.failedAttempts >= 5) {
      await this.shipperSessionModel.updateOne(
        { phone: normalizedPhone },
        { $unset: { otp: 1, otpExpiresAt: 1 } },
      );
      throw new BadRequestException(
        'Bạn đã nhập sai OTP quá 5 lần. Vui lòng yêu cầu mã xác thực mới',
      );
    }

    // Kiểm tra thời hạn hiệu lực của OTP
    if (new Date() > session.otpExpiresAt) {
      throw new BadRequestException('Mã OTP đã hết hạn sử dụng. Vui lòng yêu cầu gửi lại mã mới');
    }

    // So khớp mã OTP
    if (!verifyOtp(normalizedPhone, inputOtp, session.otp, this.getOtpSecret())) {
      await this.shipperSessionModel.updateOne(
        { phone: normalizedPhone },
        { $inc: { failedAttempts: 1 } },
      );
      const remaining = 5 - (session.failedAttempts + 1);
      throw new BadRequestException(`Mã OTP không chính xác. Bạn còn ${remaining} lần thử`);
    }

    // Cấp token phiên giao hàng tin cậy 60 ngày
    const sessionToken = `shp_sess_${crypto.randomBytes(24).toString('hex')}`;
    const sessionExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    const resolvedName = resolveSessionName(session, dto.name);
    session.name = resolvedName.name;
    session.nameStatus = resolvedName.nameStatus;
    session.isVerified = true;
    session.verifiedAt = new Date();
    session.sessionToken = sessionToken;
    session.sessionExpiresAt = sessionExpiresAt;
    session.otp = undefined;
    session.otpExpiresAt = undefined;
    session.failedAttempts = 0;
    await session.save();

    this.logger.log(
      `[SHIPPER_VERIFIED] Tài xế ${normalizedPhone} đã xác thực thành công (Token: ${sessionToken.substring(0, 16)}...)`,
    );

    return {
      success: true,
      message: 'Xác thực số điện thoại tài xế thành công',
      sessionToken,
      phone: normalizedPhone,
      name: resolvedName.name,
      nameStatus: resolvedName.nameStatus,
      expiresAt: sessionExpiresAt,
    };
  }

  // Xác minh mã idToken từ Google Firebase và cấp token phiên giao hàng tin cậy cho tài xế
  async verifyFirebaseToken(dto: VerifyFirebaseTokenDto) {
    const auth = getFirebaseAuth();

    try {
      const decodedToken = await auth.verifyIdToken(dto.idToken.trim());
      const rawPhone = decodedToken.phone_number;

      if (!rawPhone) {
        throw new BadRequestException('Token Firebase không chứa thông tin số điện thoại hợp lệ');
      }

      // Chuẩn hóa định dạng số điện thoại về 10 chữ số nội địa
      const normalizedPhone = rawPhone.replace(/^(\+84)/, '0').trim();

      // Sinh token phiên giao hàng tin cậy ngẫu nhiên an toàn
      const sessionToken = `shp_sess_${crypto.randomBytes(24).toString('hex')}`;
      const sessionExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

      const existingSession = await this.shipperSessionModel.findOne({
        phone: normalizedPhone,
      });
      const resolvedName = resolveSessionName(existingSession ?? {}, dto.name);

      await this.shipperSessionModel.findOneAndUpdate(
        { phone: normalizedPhone },
        {
          phone: normalizedPhone,
          name: resolvedName.name,
          nameStatus: resolvedName.nameStatus,
          isVerified: true,
          verifiedAt: new Date(),
          sessionToken,
          sessionExpiresAt,
          otp: undefined,
          otpExpiresAt: undefined,
          failedAttempts: 0,
        },
        { upsert: true, returnDocument: 'after' },
      );

      this.logger.log(
        `[FIREBASE_AUTH] Tài xế ${normalizedPhone} đã xác thực thành công qua Firebase (Token: ${sessionToken.substring(0, 16)}...)`,
      );

      return {
        success: true,
        message: 'Xác thực số điện thoại tài xế thành công qua Firebase',
        sessionToken,
        phone: normalizedPhone,
        name: resolvedName.name,
        nameStatus: resolvedName.nameStatus,
        expiresAt: sessionExpiresAt,
      };
    } catch (error) {
      this.logger.error('Lỗi khi đối soát Firebase ID Token:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('Mã Firebase idToken không hợp lệ hoặc đã hết hạn');
    }
  }

  // Lấy danh sách các bưu kiện của cư dân đang đăng nhập
  async getMyPackages(residentId: string) {
    if (!Types.ObjectId.isValid(residentId)) {
      throw new BadRequestException('Mã cư dân không hợp lệ');
    }

    const packages = await this.packageModel
      .find({
        residentId: new Types.ObjectId(residentId),
        status: {
          $nin: [PackageStatus.PENDING_DEPOSIT, PackageStatus.DEPOSIT_CANCELLED],
        },
      })
      .sort({ createdAt: -1 })
      .populate('lockerId', 'name code locationDescription');

    return packages.map((pkg) => {
      const locker = pkg.lockerId as unknown as {
        name?: string;
        code?: string;
        locationDescription?: string;
      };

      return {
        _id: String(pkg._id),
        trackingNumber: pkg.trackingNumber,
        lockerName: locker?.name || 'Trạm Tủ Thông Minh',
        lockerCode: locker?.code || '',
        locationDescription: locker?.locationDescription || '',
        boxNumber: pkg.boxNumber,
        boxSize: pkg.boxSize,
        pinCode: pkg.pinCode,
        qrCodeToken: pkg.qrCodeToken,
        status: pkg.status,
        carrierName: pkg.carrierName,
        shipperName: pkg.shipperName,
        shipperPhone: pkg.shipperPhone,
        droppedOffAt: pkg.droppedOffAt,
        expiredAt: pkg.expiredAt,
        pickedUpAt: pkg.pickedUpAt,
        note: pkg.note,
      };
    });
  }

  // Lấy thông tin chi tiết một bưu kiện cụ thể
  async getPackageById(id: string, residentId: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Mã bưu kiện không hợp lệ');
    }

    const pkg = await this.packageModel
      .findById(id)
      .populate('lockerId', 'name code locationDescription')
      .populate('buildingId', 'name code address');

    if (!pkg) {
      throw new NotFoundException('Kiện hàng không tồn tại trong hệ thống');
    }

    if (String(pkg.residentId) !== residentId) {
      throw new ForbiddenException('Bạn không có quyền xem kiện hàng của người khác');
    }

    return pkg;
  }

  // Lấy mã QR Token động dùng để quét mở cửa tủ
  async getQrToken(id: string, residentId: string) {
    const pkg = await this.getPackageById(id, residentId);
    return {
      qrCodeToken: pkg.qrCodeToken,
      expiredAt: pkg.expiredAt,
      status: pkg.status,
    };
  }

  // Thẩm định tính hợp lệ của mã QR Token động sinh từ màn hình LCD trạm tủ
  verifyDynamicQrToken(apiKey: string, stationCode: string, token: string): boolean {
    if (!apiKey || !stationCode || !token) {
      return false;
    }

    const cleanToken = token.trim().toUpperCase();
    const currentWindow = Math.floor(Date.now() / 1000 / 60);
    const windowsToCheck = [currentWindow, currentWindow - 1];

    return windowsToCheck.some((window) => {
      const payload = `${apiKey}${stationCode.trim().toUpperCase()}${window}`;
      const expectedToken = crypto
        .createHash('sha256')
        .update(payload)
        .digest('hex')
        .substring(0, 6)
        .toUpperCase();
      return expectedToken === cleanToken;
    });
  }

  // Xác thực mã OTP 6 số tại màn hình trạm tủ hoặc ứng dụng di động để mở khóa lấy đồ
  async pickupWithOtp(dto: PickupOtpDto, authSource?: string) {
    const isKiosk = authSource === 'DEVICE';

    const locker = await this.lockerModel
      .findOne({
        code: dto.lockerCode.trim().toUpperCase(),
      })
      .select('+apiKey');

    if (!locker) {
      throw new NotFoundException(`Trạm tủ với mã ${dto.lockerCode} không tồn tại`);
    }

    // Kiểm tra tính hợp lệ của mã QR Token động nếu được gửi kèm để chứng minh cự ly gần
    if (dto.qrProofToken) {
      const isTokenValid = this.verifyDynamicQrToken(locker.apiKey, locker.code, dto.qrProofToken);

      if (!isTokenValid) {
        throw new BadRequestException(
          'Mã QR trạm tủ đã hết hạn hoặc không hợp lệ. Vui lòng chạm vào màn hình trạm tủ để làm mới mã QR.',
        );
      }
    }

    const pkg = await this.packageModel.findOne({
      lockerId: locker._id,
      pinCode: dto.pinCode.trim(),
      status: {
        $in: [PackageStatus.WAITING_FOR_PICKUP, PackageStatus.OVERDUE],
      },
    });

    if (!pkg) {
      throw new BadRequestException('Mã OTP không chính xác hoặc bưu kiện đã được lấy trước đó');
    }

    if (pkg.lockedUntil && pkg.lockedUntil > new Date()) {
      throw new BadRequestException(
        'Ngăn tủ này đang bị tạm khóa do nhập sai nhiều lần. Vui lòng thử lại sau',
      );
    }

    // Kiểm tra phí dịch vụ và tính hợp lệ của thời hạn nhận hàng
    const feeInfo = await this.paymentsService.checkFee(String(pkg._id));
    if (feeInfo.feeDue > 0) {
      const intent = await this.paymentsService.createPaymentIntent(
        {
          packageId: String(pkg._id),
          paymentType: PaymentType.OVERDUE_PICKUP,
        },
        undefined,
        { isKiosk },
      );

      const paymentMessage = feeInfo.isOverdue
        ? 'Bưu kiện đã quá hạn lưu kho. Vui lòng nộp phí để mở tủ.'
        : 'Vui lòng thanh toán phí lượt nhận hàng để mở tủ.';

      // Chỉ phát bản tin MQTT yêu cầu trạm tủ hiển thị mã QR trên màn hình LCD khi thao tác trực tiếp tại Kiosk
      if (isKiosk) {
        await this.mqttService.publishPaymentRequired(locker.code, pkg.boxNumber, {
          orderCode: intent.orderCode,
          feeAmount: intent.amount,
          qrPayload: intent.qrPayload,
          paymentUrl: intent.paymentUrl,
          residentName: pkg.receiverName,
          message: paymentMessage,
        });
      } else {
        this.logger.log(
          `[MOBILE_PICKUP] Cư dân thao tác nhận hàng qua Mobile App (Kiện #${String(pkg._id)}) - Bỏ qua lệnh hiển thị QR trên màn hình LCD`,
        );
      }

      return {
        requiresPayment: true,
        action: 'PAYMENT_REQUIRED',
        message: paymentMessage,
        packageId: String(pkg._id),
        boxNumber: pkg.boxNumber,
        feeAmount: intent.amount,
        orderCode: intent.orderCode,
        paymentUrl: intent.paymentUrl,
        qrPayload: intent.qrPayload,
        qrCodeUrl: intent.qrCodeUrl,
        recipientAccount: intent.recipientAccount,
        description: intent.description,
        expiresAt: intent.expiresAt,
      };
    }

    const box = await this.boxModel.findById(pkg.boxId);
    if (box) {
      box.status = BoxStatus.AVAILABLE;
      box.currentPackageId = undefined;
      box.doorStatus = DoorStatus.OPEN;
      box.hasItem = false;
      await box.save();
    }

    pkg.status = PackageStatus.PICKED_UP;
    pkg.pickedUpAt = new Date();
    await pkg.save();

    await this.activityLogsService.recordLockerAction({
      locker,
      boxNumber: pkg.boxNumber,
      packageId: pkg._id,
      action: dto.qrProofToken ? LockerAction.PICKUP_QR : LockerAction.PICKUP_OTP,
      performedBy: pkg.receiverPhone,
      status: 'SUCCESS',
      actor: {
        userId: pkg.residentId,
        name: pkg.receiverName,
        phone: pkg.receiverPhone,
        role: Role.RESIDENT,
      },
      metadata: dto.qrProofToken ? { verificationMethod: 'DYNAMIC_QR' } : undefined,
    });

    // Phát lệnh mở khóa Solenoid tới phần cứng ESP32 qua MQTT
    this.mqttService.publishDoorUnlock(locker.code, pkg.boxNumber).catch((err) => {
      this.logger.error(
        `Lỗi khi phát lệnh mở cửa MQTT cho trạm ${locker.code} ngăn #${pkg.boxNumber}: ${err}`,
      );
    });

    return {
      message: `Xác thực mã OTP thành công. Cửa ngăn tủ số ${pkg.boxNumber} đã mở!`,
      package: {
        _id: String(pkg._id),
        trackingNumber: pkg.trackingNumber,
        status: pkg.status,
        pickedUpAt: pkg.pickedUpAt,
      },
      boxNumber: pkg.boxNumber,
      action: 'OPEN_DOOR',
    };
  }

  // Quét mã QR token trước camera của trạm tủ hoặc ứng dụng di động để mở khóa lấy đồ
  async pickupWithQr(dto: PickupQrDto, authSource?: string) {
    const isKiosk = authSource === 'DEVICE';

    const locker = await this.lockerModel.findOne({
      code: dto.lockerCode.trim().toUpperCase(),
    });

    if (!locker) {
      throw new NotFoundException(`Trạm tủ với mã ${dto.lockerCode} không tồn tại`);
    }

    const pkg = await this.packageModel.findOne({
      lockerId: locker._id,
      qrCodeToken: dto.qrCodeToken.trim(),
      status: {
        $in: [PackageStatus.WAITING_FOR_PICKUP, PackageStatus.OVERDUE],
      },
    });

    if (!pkg) {
      throw new BadRequestException('Mã QR không hợp lệ hoặc bưu kiện đã được lấy trước đó');
    }

    // Kiểm tra phí dịch vụ và tính hợp lệ của thời hạn nhận hàng
    const feeInfo = await this.paymentsService.checkFee(String(pkg._id));
    if (feeInfo.feeDue > 0) {
      const intent = await this.paymentsService.createPaymentIntent(
        {
          packageId: String(pkg._id),
          paymentType: PaymentType.OVERDUE_PICKUP,
        },
        undefined,
        { isKiosk },
      );

      const paymentMessage = feeInfo.isOverdue
        ? 'Bưu kiện đã quá hạn lưu kho. Vui lòng nộp phí để mở tủ.'
        : 'Vui lòng thanh toán phí lượt nhận hàng để mở tủ.';

      // Chỉ phát bản tin MQTT yêu cầu trạm tủ hiển thị mã QR trên màn hình LCD khi thao tác trực tiếp tại Kiosk
      if (isKiosk) {
        await this.mqttService.publishPaymentRequired(locker.code, pkg.boxNumber, {
          orderCode: intent.orderCode,
          feeAmount: intent.amount,
          qrPayload: intent.qrPayload,
          paymentUrl: intent.paymentUrl,
          residentName: pkg.receiverName,
          message: paymentMessage,
        });
      } else {
        this.logger.log(
          `[MOBILE_PICKUP_QR] Cư dân thao tác nhận hàng qua Mobile App (Kiện #${String(pkg._id)}) - Bỏ qua lệnh hiển thị QR trên màn hình LCD`,
        );
      }

      return {
        requiresPayment: true,
        action: 'PAYMENT_REQUIRED',
        message: paymentMessage,
        packageId: String(pkg._id),
        boxNumber: pkg.boxNumber,
        feeAmount: intent.amount,
        orderCode: intent.orderCode,
        paymentUrl: intent.paymentUrl,
        qrPayload: intent.qrPayload,
        qrCodeUrl: intent.qrCodeUrl,
        recipientAccount: intent.recipientAccount,
        description: intent.description,
        expiresAt: intent.expiresAt,
      };
    }

    const box = await this.boxModel.findById(pkg.boxId);
    if (box) {
      box.status = BoxStatus.AVAILABLE;
      box.currentPackageId = undefined;
      box.doorStatus = DoorStatus.OPEN;
      box.hasItem = false;
      await box.save();
    }

    pkg.status = PackageStatus.PICKED_UP;
    pkg.pickedUpAt = new Date();
    await pkg.save();

    await this.activityLogsService.recordLockerAction({
      locker,
      boxNumber: pkg.boxNumber,
      packageId: pkg._id,
      action: LockerAction.PICKUP_QR,
      performedBy: pkg.receiverPhone,
      status: 'SUCCESS',
      actor: {
        userId: pkg.residentId,
        name: pkg.receiverName,
        phone: pkg.receiverPhone,
        role: Role.RESIDENT,
      },
    });

    // Phát lệnh mở khóa Solenoid tới phần cứng ESP32 qua MQTT
    this.mqttService.publishDoorUnlock(locker.code, pkg.boxNumber).catch((err) => {
      this.logger.error(
        `Lỗi khi phát lệnh mở cửa MQTT cho trạm ${locker.code} ngăn #${pkg.boxNumber}: ${err}`,
      );
    });

    return {
      message: `Quét mã QR thành công. Cửa ngăn tủ số ${pkg.boxNumber} đã mở!`,
      package: {
        _id: String(pkg._id),
        trackingNumber: pkg.trackingNumber,
        status: pkg.status,
        pickedUpAt: pkg.pickedUpAt,
      },
      boxNumber: pkg.boxNumber,
      action: 'OPEN_DOOR',
    };
  }

  // Nhận diện khuôn mặt cư dân trước camera trạm tủ để mở khóa lấy bưu kiện
  async pickupWithFace(dto?: PickupFaceDto, file?: Express.Multer.File) {
    if (!dto?.lockerCode) {
      throw new BadRequestException('Vui lòng cung cấp mã trạm tủ (lockerCode)');
    }

    let imageBuffer: Buffer | null = null;

    if (file?.buffer) {
      imageBuffer = file.buffer;
    } else if (dto.imageBase64) {
      const cleanBase64 = dto.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(cleanBase64, 'base64');
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      throw new BadRequestException(
        'Vui lòng tải lên file ảnh hoặc cung cấp chuỗi imageBase64 từ camera',
      );
    }

    const result = await this.faceVerificationService.verifyAndUnlock(dto.lockerCode, imageBuffer);

    if (result.requiresPayment) {
      return {
        requiresPayment: true,
        action: 'PAYMENT_REQUIRED',
        message:
          result.message ||
          `Bưu kiện tại ngăn số ${result.boxNumber} cần thanh toán phí trước khi nhận tủ.`,
        boxNumber: result.boxNumber,
        feeAmount: result.feeAmount,
        orderCode: result.orderCode,
        qrPayload: result.qrPayload,
        paymentUrl: result.paymentUrl,
        package: {
          trackingNumber: result.trackingNumber,
          receiverName: result.residentName,
          receiverPhone: result.residentPhone,
          apartment: result.apartment,
        },
        matchScore: result.matchScore,
        livenessScore: result.livenessScore,
        inferenceTimeMs: result.inferenceTimeMs,
      };
    }

    return {
      message: `Xác thực khuôn mặt thành công. Cửa ngăn tủ số ${result.boxNumber} đã mở!`,
      package: {
        trackingNumber: result.trackingNumber,
        receiverName: result.residentName,
        receiverPhone: result.residentPhone,
        apartment: result.apartment,
      },
      boxNumber: result.boxNumber,
      action: 'OPEN_DOOR',
      matchScore: result.matchScore,
      livenessScore: result.livenessScore,
      inferenceTimeMs: result.inferenceTimeMs,
    };
  }

  // Tác vụ nền tự động chuyển các đơn hàng quá hạn lưu kho của tòa nhà (mốc T3) sang trạng thái quá hạn
  @Cron(CronExpression.EVERY_HOUR)
  async handleOverduePackagesCron(): Promise<void> {
    const result = await this.packageModel.updateMany(
      buildOverdueFilter(new Date()),
      {
        $set: { status: PackageStatus.OVERDUE },
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.warn(
        `Đã tự động chuyển ${result.modifiedCount} bưu kiện quá hạn lưu kho sang trạng thái OVERDUE`,
      );
    }
  }
}
