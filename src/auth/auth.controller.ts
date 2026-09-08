import {
  Controller,
  Request,
  Post,
  UseGuards,
  Body,
} from '@nestjs/common';
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
} from './dto';
import type {
  LoginResponse,
  RegisterResponse,
  TokensResponse,
  SanitizedUser,
  AuthenticatedUser,
} from './interfaces/auth.interface';
import {
  ApiRegisterResidentDoc,
  ApiRegisterShipperDoc,
  ApiLoginDoc,
  ApiRefreshTokenDoc,
  ApiLogoutDoc,
  ApiForgotPasswordDoc,
  ApiResetPasswordDoc,
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
}
