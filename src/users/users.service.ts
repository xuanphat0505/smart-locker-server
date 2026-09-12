import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, DEFAULT_AVATAR_URL } from './schemas/user.schema';
import { Locker } from '../lockers/schemas/locker.schema';
import { Role } from '../auth/enums/role.enum';
import { ApprovalStatus } from '../users/enums/approval-status.enum';
import {
  CreateBuildingAdminDto,
  CreateResidentDto,
  UserProfileResponseDto,
  ChangePasswordDto,
} from './dto';
import type { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { BuildingsService } from '../buildings/buildings.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Locker.name) private lockerModel: Model<Locker>,
    private buildingsService: BuildingsService,
    private mailService: MailService,
    private notificationsService: NotificationsService,
    private uploadService: UploadService,
  ) {}

  // Tạo mới một tài khoản người dùng vào cơ sở dữ liệu
  async create(userData: Partial<User>): Promise<User> {
    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  // Khởi tạo tài khoản Ban Quản Lý Tòa Nhà mới do System Admin thực hiện
  async createBuildingAdmin(
    dto: CreateBuildingAdminDto,
    createdByAdminId: string,
  ): Promise<User> {
    const existingEmail = await this.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('Địa chỉ email này đã được sử dụng');
    }

    const existingPhone = await this.findByPhone(dto.phone);
    if (existingPhone) {
      throw new ConflictException('Số điện thoại này đã được sử dụng');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newAdmin = await this.create({
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      phone: dto.phone.trim(),
      password: hashedPassword,
      role: Role.BUILDING_ADMIN,
      buildingId: new Types.ObjectId(dto.buildingId),
      approvalStatus: ApprovalStatus.ACTIVE,
      approvedBy: new Types.ObjectId(createdByAdminId),
      approvedAt: new Date(),
    });

    const sanitized = await this.findById(newAdmin._id.toString());
    return sanitized as User;
  }

  // Khởi tạo tài khoản Cư Dân trực tiếp do Ban Quản Lý Tòa Nhà thực hiện
  async createResidentByAdmin(
    dto: CreateResidentDto,
    creator: AuthenticatedUser,
  ): Promise<User> {
    if (!creator.buildingId) {
      throw new BadRequestException(
        'Tài khoản quản trị chưa được liên kết với Tòa nhà nào',
      );
    }

    const existingEmail = await this.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('Địa chỉ email này đã được sử dụng');
    }

    const existingPhone = await this.findByPhone(dto.phone);
    if (existingPhone) {
      throw new ConflictException('Số điện thoại này đã được sử dụng');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newResident = await this.create({
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      phone: dto.phone.trim(),
      password: hashedPassword,
      role: Role.RESIDENT,
      buildingId: new Types.ObjectId(creator.buildingId),
      apartment: dto.apartment.trim(),
      approvalStatus: ApprovalStatus.ACTIVE,
      approvedBy: new Types.ObjectId(creator.userId),
      approvedAt: new Date(),
    });

    const sanitized = await this.findById(newResident._id.toString());
    return sanitized as User;
  }

  // Tìm kiếm người dùng theo địa chỉ email kèm các trường bảo mật tùy chọn
  async findByEmail(
    email: string,
    options?: { includePassword?: boolean; includeResetOtp?: boolean },
  ): Promise<User | null> {
    const query = this.userModel.findOne({ email: email.toLowerCase().trim() });
    if (options?.includePassword) {
      query.select('+password');
    }
    if (options?.includeResetOtp) {
      query.select('+resetPasswordOtp');
    }
    return query.exec();
  }

  // Tìm kiếm người dùng theo số điện thoại duy nhất
  async findByPhone(phone: string): Promise<User | null> {
    return this.userModel.findOne({ phone: phone.trim() }).exec();
  }

  // Tìm kiếm thông tin người dùng theo mã định danh id
  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).select('-password').exec();
  }

  // Lấy thông tin hồ sơ tài khoản cá nhân kèm chi tiết tên tòa nhà, trạm tủ và hotline liên hệ
  async getProfile(userId: string): Promise<UserProfileResponseDto> {
    const user = await this.userModel
      .findById(userId)
      .select('-password -refreshTokenHash')
      .populate<{
        buildingId?: {
          _id: Types.ObjectId;
          name: string;
          code: string;
          address: string;
          hotline?: string;
          managementEmail?: string;
        };
      }>('buildingId', 'name code address hotline managementEmail')
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    const populatedBuilding = user.buildingId as
      | {
          _id?: Types.ObjectId;
          name?: string;
          hotline?: string;
          managementEmail?: string;
        }
      | undefined;

    let assignedLocker: UserProfileResponseDto['assignedLocker'];
    if (populatedBuilding?._id) {
      const locker = await this.lockerModel
        .findOne({ buildingId: populatedBuilding._id })
        .lean()
        .exec();

      if (locker) {
        assignedLocker = {
          id: locker._id.toString(),
          name: locker.name,
          code: locker.code,
          status: locker.status,
          locationDescription: locker.locationDescription,
          totalBoxes: locker.totalBoxes,
        };
      }
    }

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      buildingId: populatedBuilding?._id
        ? populatedBuilding._id.toString()
        : undefined,
      buildingName: populatedBuilding?.name,
      apartment: user.apartment,
      approvalStatus: user.approvalStatus,
      avatar: user.avatar,
      assignedLocker,
      buildingHotline: populatedBuilding?.hotline,
      buildingEmail: populatedBuilding?.managementEmail,
      twoFactorEnabled: user.twoFactorAuth?.enabled ?? false,
    };
  }

  // Lấy danh sách cư dân đang ở trạng thái chờ xét duyệt của một tòa nhà cụ thể
  async findPendingResidentsByBuilding(buildingId: string): Promise<User[]> {
    return this.userModel
      .find({
        buildingId: new Types.ObjectId(buildingId),
        role: Role.RESIDENT,
        approvalStatus: ApprovalStatus.PENDING,
      })
      .select('-password')
      .sort({ createdAt: -1 })
      .exec();
  }

  // Lấy danh sách các tài khoản Ban Quản Lý (BUILDING_ADMIN) đang hoạt động của một tòa nhà
  async findAdminsByBuilding(buildingId: string): Promise<User[]> {
    return this.userModel
      .find({
        buildingId: new Types.ObjectId(buildingId),
        role: Role.BUILDING_ADMIN,
        approvalStatus: ApprovalStatus.ACTIVE,
      })
      .select('email name')
      .exec();
  }

  // Cập nhật trạng thái phê duyệt tài khoản cư dân của Ban Quản Lý
  async updateApprovalStatus(
    id: string,
    status: ApprovalStatus,
    approvedBy?: string,
    rejectedReason?: string,
  ): Promise<User | null> {
    const updated = await this.userModel
      .findByIdAndUpdate(
        id,
        {
          approvalStatus: status,
          ...(approvedBy
            ? {
                approvedBy: new Types.ObjectId(approvedBy),
                approvedAt: new Date(),
              }
            : {}),
          ...(rejectedReason ? { rejectedReason } : {}),
        },
        { new: true },
      )
      .select('-password')
      .exec();

    if (updated && updated.buildingId) {
      const buildingIdStr = String(updated.buildingId);
      const isApproved = status === ApprovalStatus.ACTIVE;

      // 1. Phát sự kiện thông báo kết quả phê duyệt qua NotificationsService
      this.notificationsService
        .notifyResidentApprovalResult(buildingIdStr, String(updated._id), {
          status: isApproved ? 'ACTIVE' : 'REJECTED',
          apartment: updated.apartment,
          reason: rejectedReason,
          devicePushToken: updated.devicePushToken,
        })
        .catch((err) => {
          this.logger.error(
            `Lỗi khi phát thông báo duyệt cư dân: ${err instanceof Error ? err.message : String(err)}`,
          );
        });

      // 2. Gửi Email thông báo kết quả chính thức cho Cư Dân
      if (updated.email) {
        this.buildingsService
          .findById(buildingIdStr)
          .then((building) => {
            const buildingName = building?.name || 'Tòa Nhà Chung Cư';
            return this.mailService.sendResidentApprovalResult(
              updated.email,
              updated.name,
              isApproved,
              updated.apartment || '',
              buildingName,
              rejectedReason,
            );
          })
          .catch((mailErr) => {
            this.logger.error(
              `Lỗi khi gửi email kết quả duyệt cho cư dân: ${mailErr instanceof Error ? mailErr.message : String(mailErr)}`,
            );
          });
      }
    }

    return updated;
  }

  // Lấy danh sách người dùng theo phạm vi quyền hạn của người gọi
  async findAllScoped(creator: AuthenticatedUser): Promise<User[]> {
    if (creator.role === Role.SYSTEM_ADMIN) {
      return this.userModel
        .find()
        .select('-password')
        .sort({ createdAt: -1 })
        .exec();
    }

    if (creator.role === Role.BUILDING_ADMIN) {
      if (!creator.buildingId) {
        throw new BadRequestException(
          'Tài khoản quản trị chưa được liên kết với Tòa nhà nào',
        );
      }
      return this.userModel
        .find({
          buildingId: new Types.ObjectId(creator.buildingId),
          role: Role.RESIDENT,
        })
        .select('-password')
        .sort({ createdAt: -1 })
        .exec();
    }

    throw new ForbiddenException(
      'Không có quyền truy cập danh sách người dùng',
    );
  }

  // Lấy chi tiết thông tin một người dùng theo phạm vi phân quyền
  async findOneScoped(
    id: string,
    creator: AuthenticatedUser,
  ): Promise<User | null> {
    const user = await this.userModel.findById(id).select('-password').exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy thông tin người dùng');
    }

    if (creator.role === Role.SYSTEM_ADMIN) {
      return user;
    }

    if (creator.role === Role.BUILDING_ADMIN) {
      const isSameBuilding =
        user.buildingId?.toString() === creator.buildingId?.toString();
      const isResident = user.role === Role.RESIDENT;

      if (!isResident || !isSameBuilding) {
        throw new ForbiddenException(
          'Bạn không có quyền xem thông tin người dùng này',
        );
      }
      return user;
    }

    throw new ForbiddenException('Không có quyền truy cập');
  }

  // Xóa tài khoản người dùng theo phạm vi phân quyền
  async removeScoped(
    id: string,
    creator: AuthenticatedUser,
  ): Promise<User | null> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng để xóa');
    }

    if (creator.role === Role.SYSTEM_ADMIN) {
      await this.userModel.findByIdAndDelete(id).exec();
      return user;
    }

    if (creator.role === Role.BUILDING_ADMIN) {
      const isSameBuilding =
        user.buildingId?.toString() === creator.buildingId?.toString();
      const isResident = user.role === Role.RESIDENT;

      if (!isResident || !isSameBuilding) {
        throw new ForbiddenException(
          'Bạn chỉ có quyền xóa tài khoản cư dân thuộc tòa nhà do mình quản lý',
        );
      }

      await this.userModel.findByIdAndDelete(id).exec();
      return user;
    }

    throw new ForbiddenException('Không có quyền thực hiện thao tác này');
  }

  // Thực hiện đổi mật khẩu cá nhân cho người dùng đang đăng nhập và hủy các phiên refresh token cũ
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userModel
      .findById(userId)
      .select('+password')
      .exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'Mật khẩu mới không được trùng với mật khẩu cũ',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.userModel
      .findByIdAndUpdate(userId, {
        password: hashedPassword,
        refreshTokenHash: null,
      })
      .exec();
  }

  // Cập nhật mã băm Refresh Token của người dùng vào cơ sở dữ liệu
  async updateRefreshTokenHash(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { refreshTokenHash }).exec();
  }

  // Tìm kiếm thông tin người dùng bao gồm cả mã băm Refresh Token để xác thực
  async findByIdWithRefreshToken(id: string): Promise<User | null> {
    return this.userModel
      .findById(id)
      .select('+refreshTokenHash -password')
      .exec();
  }

  // Cập nhật ảnh đại diện người dùng lên máy chủ lưu trữ và dọn dẹp ảnh cũ
  async updateAvatar(userId: string, file: Express.Multer.File): Promise<User> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    const uploadResult = await this.uploadService.uploadAvatar(file);

    // Xóa ảnh đại diện cũ trên máy chủ đám mây nếu trước đó người dùng đã có và không phải ảnh mặc định
    if (user.avatar && user.avatar !== DEFAULT_AVATAR_URL) {
      await this.uploadService.deleteFile(user.avatar);
    }

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { avatar: uploadResult.url }, { new: true })
      .select('-password')
      .exec();

    return updated as User;
  }

  // Xóa ảnh đại diện hiện tại của người dùng và phục hồi trạng thái mặc định
  async removeAvatar(userId: string): Promise<User> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    // Xóa tệp ảnh đại diện khỏi máy chủ đám mây nếu không phải là ảnh mặc định
    if (user.avatar && user.avatar !== DEFAULT_AVATAR_URL) {
      await this.uploadService.deleteFile(user.avatar);
    }

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { avatar: DEFAULT_AVATAR_URL }, { new: true })
      .select('-password')
      .exec();

    return updated as User;
  }

  // Lưu mã băm OTP đặt lại mật khẩu và thời gian hết hạn vào cơ sở dữ liệu
  async setResetPasswordOtp(
    userId: string,
    hashedOtp: string,
    expires: Date,
  ): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, {
        resetPasswordOtp: hashedOtp,
        resetPasswordOtpExpires: expires,
        lastResetPasswordRequestedAt: new Date(),
      })
      .exec();
  }

  // Cập nhật mật khẩu mới và dọn dẹp các trường OTP đặt lại mật khẩu
  async updatePasswordAndClearResetOtp(
    userId: string,
    newPasswordHash: string,
  ): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, {
        password: newPasswordHash,
        refreshTokenHash: null,
        $unset: {
          resetPasswordOtp: 1,
          resetPasswordOtpExpires: 1,
        },
      })
      .exec();
  }

  // Lưu khóa bí mật 2FA tạm thời đã mã hóa vào cơ sở dữ liệu khi bắt đầu tạo mới
  async saveTempTwoFactorSecret(
    userId: string,
    encryptedTempSecret: string,
  ): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, {
        'twoFactorAuth.tempSecret': encryptedTempSecret,
      })
      .exec();
  }

  // Kích hoạt xác thực hai bước và lưu khóa bí mật chính thức cùng mã khôi phục đã băm
  async enableTwoFactor(
    userId: string,
    encryptedSecret: string,
    hashedRecoveryCodes: string[],
  ): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, {
        'twoFactorAuth.enabled': true,
        'twoFactorAuth.secret': encryptedSecret,
        'twoFactorAuth.recoveryCodes': hashedRecoveryCodes,
        $unset: { 'twoFactorAuth.tempSecret': 1 },
      })
      .exec();
  }

  // Vô hiệu hóa xác thực hai bước và xóa bỏ toàn bộ khóa bí mật cùng mã khôi phục
  async disableTwoFactor(userId: string): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, {
        'twoFactorAuth.enabled': false,
        'twoFactorAuth.recoveryCodes': [],
        $unset: {
          'twoFactorAuth.secret': 1,
          'twoFactorAuth.tempSecret': 1,
        },
      })
      .exec();
  }

  // Tìm kiếm thông tin người dùng phục vụ quy trình xác thực hai bước TOTP
  async findUserFor2FA(
    userId: string,
    options?: {
      includeTempSecret?: boolean;
      includeSecret?: boolean;
      includeRecoveryCodes?: boolean;
      includePassword?: boolean;
    },
  ): Promise<User | null> {
    const query = this.userModel.findById(userId);
    if (options?.includeTempSecret) {
      query.select('+twoFactorAuth.tempSecret');
    }
    if (options?.includeSecret) {
      query.select('+twoFactorAuth.secret');
    }
    if (options?.includeRecoveryCodes) {
      query.select('+twoFactorAuth.recoveryCodes');
    }
    if (options?.includePassword) {
      query.select('+password');
    }
    return query.exec();
  }

  // Cập nhật danh sách mã khôi phục sau khi người dùng đã tiêu thụ một mã khôi phục
  async consumeRecoveryCode(
    userId: string,
    remainingRecoveryCodes: string[],
  ): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, {
        'twoFactorAuth.recoveryCodes': remainingRecoveryCodes,
      })
      .exec();
  }

  // Đăng ký hoặc cập nhật mã push token nhận thông báo trên thiết bị di động
  async updatePushToken(
    userId: string,
    pushToken: string,
  ): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(userId, { devicePushToken: pushToken }, { new: true })
      .select('-password')
      .exec();
  }
}
