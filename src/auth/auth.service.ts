import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import {
  JwtPayload,
  LoginResponse,
  RegisterResponse,
  TokensResponse,
  SanitizedUser,
} from './interfaces/auth.interface';
import {
  RegisterResidentDto,
  RegisterShipperDto,
  RefreshTokenDto,
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
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    return this.sanitizeUser(user);
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
    const tokens = await this.generateTokens(
      userId,
      user.email,
      user.role,
      user.buildingId,
      user.approvalStatus,
    );

    await this.updateRefreshTokenHash(userId, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: userId,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        buildingId: user.buildingId,
        apartment: user.apartment,
        approvalStatus: user.approvalStatus,
      },
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
    this.notificationsService.notifyNewResident(dto.buildingId, {
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

  // Đăng xuất và xóa mã băm Refresh Token trong cơ sở dữ liệu
  async logout(userId: string): Promise<{ message: string }> {
    await this.usersService.updateRefreshTokenHash(userId, null);
    return { message: 'Đăng xuất tài khoản thành công' };
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
