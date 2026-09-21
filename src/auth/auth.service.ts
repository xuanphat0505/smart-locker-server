import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { encryptText, decryptText } from '../common/utils/crypto.util';
import {
  JwtPayload,
  LoginResponse,
  RegisterResponse,
  TokensResponse,
  SanitizedUser,
  TwoFactorGenerateResponse,
  TwoFactorTurnOnResponse,
} from './interfaces/auth.interface';
import {
  RegisterResidentDto,
  RegisterShipperDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  TwoFactorTurnOnDto,
  TwoFactorTurnOffDto,
  TwoFactorAuthenticateDto,
} from './dto';
import { Role } from './enums/role.enum';
import { User } from '../users/schemas/user.schema';
import { ApprovalStatus } from '../users/enums/approval-status.enum';
import { BuildingsService } from '../buildings/buildings.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private buildingsService: BuildingsService,
    private mailService: MailService,
    private notificationsService: NotificationsService,
  ) {}

  // Xác thực thông tin người dùng từ email và mật khẩu rồi trả về thông tin user đã làm sạch
  async validateUser(email: string, pass: string): Promise<SanitizedUser> {
    const user = await this.usersService.findByEmail(email, {
      includePassword: true,
    });
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const sanitized = this.sanitizeUser(user);
    if (user.buildingId) {
      const building = await this.buildingsService.findById(
        user.buildingId.toString(),
      );
      if (building) {
        sanitized.buildingName = building.name;
      }
    }

    return sanitized;
  }

  // Tạo cặp mã Access Token và Refresh Token cho người dùng
  async generateTokens(
    userId: string,
    email: string,
    role: Role,
    buildingId?: string,
    approvalStatus?: ApprovalStatus,
  ): Promise<TokensResponse> {
    const payload: JwtPayload = {
      sub: userId,
      email,
      role,
      buildingId,
      approvalStatus,
    };

    const accessSecret = this.configService.get<string>(
      'JWT_ACCESS_SECRET_KEY',
    );

    const refreshSecret = this.configService.get<string>(
      'JWT_REFRESH_SECRET_KEY',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  // Cập nhật mã băm của Refresh Token vào cơ sở dữ liệu để kiểm soát bảo mật
  async updateRefreshTokenHash(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.updateRefreshTokenHash(userId, hash);
  }

  // Tạo mã token JWT và trả về thông tin đăng nhập thành công của người dùng
  async login(user: SanitizedUser): Promise<LoginResponse> {
    const userId = user._id;

    // Nếu tài khoản đã kích hoạt 2FA thì phát hành tempToken yêu cầu xác thực bước hai
    if (user.twoFactorAuth?.enabled) {
      const accessSecret = this.configService.get<string>(
        'JWT_ACCESS_SECRET_KEY',
      );
      const tempToken = await this.jwtService.signAsync(
        {
          sub: userId,
          type: '2FA_TEMP',
        },
        {
          secret: accessSecret,
          expiresIn: '5m',
        },
      );

      return {
        require2FA: true,
        tempToken,
        twoFactorMethod: 'TOTP',
      };
    }

    const tokens = await this.generateTokens(
      userId,
      user.email,
      user.role,
      user.buildingId,
      user.approvalStatus,
    );

    await this.updateRefreshTokenHash(userId, tokens.refreshToken);

    const userProfile = await this.usersService.getProfile(userId);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: userProfile,
    };
  }

  // Đăng ký tài khoản Cư Dân gắn với tòa nhà và căn hộ ở trạng thái chờ BQL xét duyệt
  async registerResident(dto: RegisterResidentDto): Promise<RegisterResponse> {
    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException(
        'Địa chỉ email này đã được đăng ký tài khoản',
      );
    }

    const existingPhone = await this.usersService.findByPhone(dto.phone);
    if (existingPhone) {
      throw new ConflictException(
        'Số điện thoại này đã được đăng ký tài khoản',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newUser = await this.usersService.create({
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      phone: dto.phone.trim(),
      password: hashedPassword,
      role: Role.RESIDENT,
      buildingId: new Types.ObjectId(dto.buildingId),
      apartment: dto.apartment.trim(),
      approvalStatus: ApprovalStatus.PENDING,
    });

    const sanitized = this.sanitizeUser(newUser);

    // 1. Phát thông báo điều phối tức thì qua NotificationsService
    void this.notificationsService.notifyNewResident(dto.buildingId, {
      id: String(newUser._id),
      name: newUser.name,
      phone: newUser.phone,
      email: newUser.email,
      apartment: newUser.apartment,
      buildingId: dto.buildingId,
      createdAt: new Date(),
    });

    // 2. Gửi email thông báo cho Ban Quản Lý (Cơ chế Fallback 3 Tầng thông minh)
    Promise.all([
      this.buildingsService.findById(dto.buildingId),
      this.usersService.findAdminsByBuilding(dto.buildingId),
    ])
      .then(([building, admins]) => {
        const buildingName = building?.name || 'Tòa Nhà Chung Cư';

        // Tầng 1: Lấy danh sách email của các tài khoản BUILDING_ADMIN đang active thuộc tòa nhà
        const activeAdminEmails = admins
          .map((admin) => admin.email)
          .filter(Boolean);

        let targetEmails: string[] = [];
        if (activeAdminEmails.length > 0) {
          targetEmails = activeAdminEmails;
        } else if (building?.managementEmail) {
          // Tầng 2: Fallback về email chính thức của Tòa Nhà (managementEmail)
          targetEmails = [building.managementEmail];
        }

        // Nếu không có cả BUILDING_ADMIN lẫn managementEmail thì bỏ qua không gửi email
        if (targetEmails.length === 0) {
          this.logger.warn(
            `Tòa nhà ${buildingName} (${dto.buildingId}) chưa có tài khoản BUILDING_ADMIN hoặc managementEmail. Bỏ qua gửi email thông báo.`,
          );
          return false;
        }

        return this.mailService.sendNewResidentNotification(
          targetEmails,
          {
            name: newUser.name,
            phone: newUser.phone,
            email: newUser.email,
            apartment: newUser.apartment,
          },
          buildingName,
        );
      })
      .catch((mailError) => {
        this.logger.error(
          `Lỗi khi gửi email thông báo Ban Quản Lý: ${mailError instanceof Error ? mailError.message : String(mailError)}`,
        );
      });

    return {
      message: 'Đăng ký tài khoản cư dân thành công',
      user: sanitized,
    };
  }

  // Đăng ký tài khoản Tài Xế Shipper gắn với đơn vị giao vận và kích hoạt ngay
  async registerShipper(dto: RegisterShipperDto): Promise<RegisterResponse> {
    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException(
        'Địa chỉ email này đã được đăng ký tài khoản',
      );
    }

    const existingPhone = await this.usersService.findByPhone(dto.phone);
    if (existingPhone) {
      throw new ConflictException(
        'Số điện thoại này đã được đăng ký tài khoản',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newUser = await this.usersService.create({
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      phone: dto.phone.trim(),
      password: hashedPassword,
      role: Role.SHIPPER,
      approvalStatus: ApprovalStatus.ACTIVE,
    });

    const sanitized = this.sanitizeUser(newUser);
    return {
      message: 'Đăng ký tài khoản shipper thành công',
      user: sanitized,
    };
  }

  // Cấp mới cặp token khi Access Token hết hạn thông qua Refresh Token hợp lệ
  async refreshTokens(dto: RefreshTokenDto): Promise<TokensResponse> {
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET_KEY') ||
      'default_refresh_secret_key';

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(
        dto.refreshToken,
        {
          secret: refreshSecret,
        },
      );
    } catch {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    const user = await this.usersService.findByIdWithRefreshToken(payload.sub);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Truy cập bị từ chối');
    }

    const isMatch = await bcrypt.compare(
      dto.refreshToken,
      user.refreshTokenHash,
    );
    if (!isMatch) {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã bị thu hồi',
      );
    }

    const tokens = await this.generateTokens(
      user._id.toString(),
      user.email,
      user.role,
      user.buildingId ? user.buildingId.toString() : undefined,
      user.approvalStatus,
    );

    await this.updateRefreshTokenHash(user._id.toString(), tokens.refreshToken);

    return tokens;
  }

  // Tiếp nhận yêu cầu quên mật khẩu, sinh mã OTP 6 chữ số băm SHA-256 và gửi email cho người dùng
  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ statusCode: number; message: string }> {
    const genericResponse = {
      statusCode: 200,
      message:
        'Nếu email tồn tại trên hệ thống, mã xác thực OTP đã được gửi đến hộp thư của bạn.',
    };

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      return genericResponse;
    }

    if (user.lastResetPasswordRequestedAt) {
      const diffSeconds = Math.floor(
        (Date.now() - new Date(user.lastResetPasswordRequestedAt).getTime()) /
          1000,
      );
      if (diffSeconds < 60) {
        throw new BadRequestException(
          `Vui lòng đợi thêm ${60 - diffSeconds} giây trước khi gửi lại yêu cầu`,
        );
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await this.usersService.setResetPasswordOtp(
      user._id.toString(),
      hashedOtp,
      expires,
    );

    this.mailService
      .sendResetPasswordOtp(user.email, user.name, otp)
      .catch((err) => {
        this.logger.error(
          `Lỗi khi gửi email mã OTP đặt lại mật khẩu: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return genericResponse;
  }

  // Xác thực mã OTP và cập nhật mật khẩu mới cho tài khoản người dùng
  async resetPassword(
    dto: ResetPasswordDto,
  ): Promise<{ statusCode: number; message: string }> {
    const user = await this.usersService.findByEmail(dto.email, {
      includeResetOtp: true,
    });
    if (!user || !user.resetPasswordOtp || !user.resetPasswordOtpExpires) {
      throw new BadRequestException(
        'Yêu cầu đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
      );
    }

    if (new Date() > new Date(user.resetPasswordOtpExpires)) {
      throw new BadRequestException(
        'Mã OTP đã hết hạn. Vui lòng gửi lại yêu cầu mới',
      );
    }

    const hashedOtp = crypto.createHash('sha256').update(dto.otp).digest('hex');

    if (hashedOtp !== user.resetPasswordOtp) {
      throw new BadRequestException(
        'Mã OTP không chính xác. Vui lòng kiểm tra lại',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.updatePasswordAndClearResetOtp(
      user._id.toString(),
      hashedPassword,
    );

    return {
      statusCode: 200,
      message:
        'Đặt lại mật khẩu thành công. Bạn đã có thể đăng nhập bằng mật khẩu mới.',
    };
  }

  // Đăng xuất và xóa mã băm Refresh Token trong cơ sở dữ liệu
  async logout(userId: string): Promise<{ message: string }> {
    await this.usersService.updateRefreshTokenHash(userId, null);
    return { message: 'Đăng xuất tài khoản thành công' };
  }

  // Khởi tạo khóa bí mật TOTP và mã QR cài đặt ứng dụng xác thực
  async generate2faSecret(userId: string): Promise<TwoFactorGenerateResponse> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('Không tìm thấy tài khoản người dùng');
    }

    if (user.twoFactorAuth?.enabled) {
      throw new BadRequestException(
        'Tài khoản đã kích hoạt xác thực hai bước trước đó',
      );
    }

    const secret = authenticator.generateSecret();
    const appName = this.configService.get<string>('APP_NAME') || 'SmartLocker';
    const otpauthUrl = authenticator.keyuri(user.email, appName, secret);
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    const encryptedTempSecret = encryptText(secret);
    await this.usersService.saveTempTwoFactorSecret(
      userId,
      encryptedTempSecret,
    );

    return {
      secret,
      qrCodeDataUrl,
    };
  }

  // Kích hoạt xác thực hai bước sau khi người dùng quét mã và nhập mã OTP xác nhận
  async turnOn2fa(
    userId: string,
    dto: TwoFactorTurnOnDto,
  ): Promise<TwoFactorTurnOnResponse> {
    const user = await this.usersService.findUserFor2FA(userId, {
      includeTempSecret: true,
    });

    if (!user || !user.twoFactorAuth?.tempSecret) {
      throw new BadRequestException(
        'Chưa tạo mã bí mật 2FA hoặc phiên thiết lập đã hết hạn. Vui lòng tạo lại mã',
      );
    }

    const plainSecret = decryptText(user.twoFactorAuth.tempSecret);
    authenticator.options = { window: 1 };
    const isValid = authenticator.check(dto.code, plainSecret);

    if (!isValid) {
      throw new BadRequestException(
        'Mã xác thực 2FA không chính xác hoặc đã hết hạn',
      );
    }

    const recoveryCodes: string[] = [];
    const hashedRecoveryCodes: string[] = [];

    for (let i = 0; i < 8; i++) {
      const rawCode = crypto.randomBytes(5).toString('hex').toUpperCase();
      recoveryCodes.push(rawCode);
      const hashed = await bcrypt.hash(rawCode, 10);
      hashedRecoveryCodes.push(hashed);
    }

    const encryptedSecret = encryptText(plainSecret);
    await this.usersService.enableTwoFactor(
      userId,
      encryptedSecret,
      hashedRecoveryCodes,
    );

    return {
      message: 'Kích hoạt xác thực hai bước thành công',
      recoveryCodes,
    };
  }

  // Tắt xác thực hai bước bằng mật khẩu tài khoản hiện tại
  async turnOff2fa(
    userId: string,
    dto: TwoFactorTurnOffDto,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findUserFor2FA(userId, {
      includePassword: true,
    });

    if (!user || !user.twoFactorAuth?.enabled) {
      throw new BadRequestException(
        'Tài khoản hiện chưa kích hoạt xác thực hai bước',
      );
    }

    const isPasswordMatch = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );
    if (!isPasswordMatch) {
      throw new BadRequestException('Mật khẩu tài khoản không chính xác');
    }

    await this.usersService.disableTwoFactor(userId);

    return {
      message: 'Hủy kích hoạt xác thực hai bước thành công',
    };
  }

  // Xác thực bước thứ hai qua mã OTP hoặc mã khôi phục dự phòng
  async authenticate2fa(dto: TwoFactorAuthenticateDto): Promise<LoginResponse> {
    let payload: { sub: string; type: string };
    try {
      payload = await this.jwtService.verifyAsync(dto.tempToken, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET_KEY'),
      });
    } catch {
      throw new UnauthorizedException(
        'Phiên xác thực 2FA không hợp lệ hoặc đã hết hạn',
      );
    }

    if (payload.type !== '2FA_TEMP') {
      throw new UnauthorizedException('Mã token xác thực 2FA không hợp lệ');
    }

    const user = await this.usersService.findUserFor2FA(payload.sub, {
      includeSecret: true,
      includeRecoveryCodes: true,
    });

    if (!user || !user.twoFactorAuth?.enabled) {
      throw new UnauthorizedException(
        'Tài khoản không tồn tại hoặc chưa kích hoạt xác thực hai bước',
      );
    }

    const isRecovery = dto.isRecoveryCode || dto.isBackupCode;
    if (isRecovery) {
      const codeInput = dto.code.trim().toUpperCase();
      let matchedIndex = -1;

      for (
        let i = 0;
        i < (user.twoFactorAuth.recoveryCodes || []).length;
        i++
      ) {
        const isMatch = await bcrypt.compare(
          codeInput,
          user.twoFactorAuth.recoveryCodes[i],
        );
        if (isMatch) {
          matchedIndex = i;
          break;
        }
      }

      if (matchedIndex === -1) {
        throw new BadRequestException(
          'Mã khôi phục không chính xác hoặc đã từng được sử dụng',
        );
      }

      const remainingRecoveryCodes = [
        ...user.twoFactorAuth.recoveryCodes.slice(0, matchedIndex),
        ...user.twoFactorAuth.recoveryCodes.slice(matchedIndex + 1),
      ];
      await this.usersService.consumeRecoveryCode(
        user._id.toString(),
        remainingRecoveryCodes,
      );
    } else {
      if (!user.twoFactorAuth.secret) {
        throw new UnauthorizedException('Khóa bí mật 2FA không tồn tại');
      }

      const plainSecret = decryptText(user.twoFactorAuth.secret);
      authenticator.options = { window: 1 };
      const isValid = authenticator.check(dto.code, plainSecret);

      if (!isValid) {
        throw new BadRequestException(
          'Mã xác thực 2FA không chính xác hoặc đã hết hạn',
        );
      }
    }

    const tokens = await this.generateTokens(
      user._id.toString(),
      user.email,
      user.role,
      user.buildingId ? user.buildingId.toString() : undefined,
      user.approvalStatus,
    );

    await this.updateRefreshTokenHash(user._id.toString(), tokens.refreshToken);

    const userProfile = await this.usersService.getProfile(user._id.toString());

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: userProfile,
    };
  }

  // Loại bỏ mật khẩu và chuẩn hóa thông tin người dùng an toàn
  private sanitizeUser(user: User): SanitizedUser {
    const userObj = user.toObject() as Record<string, unknown>;
    delete userObj.password;
    delete userObj.refreshTokenHash;
    const { _id, buildingId, ...result } = userObj;

    return {
      ...result,
      _id,
      buildingId,
    } as SanitizedUser;
  }
}
