import { Controller, Request, Post, UseGuards, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
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
import type {
  LoginResponse,
  RegisterResponse,
  TokensResponse,
  SanitizedUser,
  AuthenticatedUser,
  TwoFactorGenerateResponse,
  TwoFactorTurnOnResponse,
} from './interfaces/auth.interface';
import {
  ApiRegisterResidentDoc,
  ApiRegisterShipperDoc,
  ApiLoginDoc,
  ApiRefreshTokenDoc,
  ApiLogoutDoc,
  ApiForgotPasswordDoc,
  ApiResetPasswordDoc,
  Api2faGenerateDoc,
  Api2faTurnOnDoc,
  Api2faTurnOffDoc,
  Api2faAuthenticateDoc,
} from './swagger/auth.swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Đăng ký tài khoản Cư Dân gắn với tòa nhà và căn hộ ở trạng thái chờ BQL xét duyệt
  @Post('register/resident')
  @ApiRegisterResidentDoc()
  async registerResident(
    @Body() dto: RegisterResidentDto,
  ): Promise<RegisterResponse> {
    return this.authService.registerResident(dto);
  }

  // Đăng ký tài khoản Tài Xế Shipper gắn với đơn vị giao vận
  @Post('register/shipper')
  @ApiRegisterShipperDoc()
  async registerShipper(
    @Body() dto: RegisterShipperDto,
  ): Promise<RegisterResponse> {
    return this.authService.registerShipper(dto);
  }

  // Đăng nhập tài khoản bằng email và mật khẩu
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiLoginDoc()
  async login(@Request() req: { user: SanitizedUser }): Promise<LoginResponse> {
    return this.authService.login(req.user);
  }

  // Cấp mới cặp mã Access Token và Refresh Token khi Access Token hết hạn
  @Post('refresh-token')
  @ApiRefreshTokenDoc()
  async refreshToken(@Body() dto: RefreshTokenDto): Promise<TokensResponse> {
    return this.authService.refreshTokens(dto);
  }

  // Đăng xuất và thu hồi Refresh Token của người dùng
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiLogoutDoc()
  async logout(
    @Request() req: { user: AuthenticatedUser },
  ): Promise<{ message: string }> {
    return this.authService.logout(req.user.userId);
  }

  // Tiếp nhận yêu cầu quên mật khẩu và gửi email chứa mã OTP
  @Post('forgot-password')
  @ApiForgotPasswordDoc()
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ statusCode: number; message: string }> {
    return this.authService.forgotPassword(dto);
  }

  // Đặt lại mật khẩu mới cho tài khoản thông qua mã OTP xác thực
  @Post('reset-password')
  @ApiResetPasswordDoc()
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ statusCode: number; message: string }> {
    return this.authService.resetPassword(dto);
  }

  // Khởi tạo khóa bí mật 2FA và sinh mã QR cài đặt Authenticator
  @UseGuards(JwtAuthGuard)
  @Post('2fa/generate')
  @Api2faGenerateDoc()
  async generate2faSecret(
    @Request() req: { user: AuthenticatedUser },
  ): Promise<TwoFactorGenerateResponse> {
    return this.authService.generate2faSecret(req.user.userId);
  }

  // Kích hoạt xác thực hai bước TOTP sau khi xác minh mã OTP ban đầu
  @UseGuards(JwtAuthGuard)
  @Post('2fa/turn-on')
  @Api2faTurnOnDoc()
  async turnOn2fa(
    @Request() req: { user: AuthenticatedUser },
    @Body() dto: TwoFactorTurnOnDto,
  ): Promise<TwoFactorTurnOnResponse> {
    return this.authService.turnOn2fa(req.user.userId, dto);
  }

  // Hủy kích hoạt xác thực hai bước TOTP kèm mật khẩu và mã OTP xác nhận
  @UseGuards(JwtAuthGuard)
  @Post('2fa/turn-off')
  @Api2faTurnOffDoc()
  async turnOff2fa(
    @Request() req: { user: AuthenticatedUser },
    @Body() dto: TwoFactorTurnOffDto,
  ): Promise<{ message: string }> {
    return this.authService.turnOff2fa(req.user.userId, dto);
  }

  // Xác thực bước thứ hai khi đăng nhập bằng mã TOTP hoặc mã khôi phục
  @Post('2fa/authenticate')
  @Api2faAuthenticateDoc()
  async authenticate2fa(
    @Body() dto: TwoFactorAuthenticateDto,
  ): Promise<LoginResponse> {
    return this.authService.authenticate2fa(dto);
  }
}
