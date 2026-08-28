import { Controller, Request, Post, UseGuards, Get } from '@nestjs/common';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Role } from './enums/role.enum';
import { AuthService } from './auth.service';
import type {
  AuthenticatedUser,
  LoginResponse,
  SanitizedUser,
} from './interfaces/auth.interface';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Đăng nhập tài khoản bằng email và mật khẩu
  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Request() req: { user: SanitizedUser }): LoginResponse {
    return this.authService.login(req.user);
  }

  // Lấy thông tin tài khoản người dùng hiện tại
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN, Role.SHIPPER, Role.RESIDENT)
  @Get('profile')
  getProfile(@Request() req: { user: AuthenticatedUser }): AuthenticatedUser {
    return req.user;
  }
}
