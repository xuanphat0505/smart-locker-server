import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  JwtPayload,
  LoginResponse,
  SanitizedUser,
} from './interfaces/auth.interface';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
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

    // Loại bỏ password trước khi trả về
    const userObj = user.toObject() as Record<string, unknown>;
    delete userObj.password;
    const { _id, ...result } = userObj;
    return {
      ...result,
      _id: String(_id),
    } as SanitizedUser;
  }

  // Tạo mã token JWT và trả về thông tin đăng nhập thành công của người dùng
  login(user: SanitizedUser): LoginResponse {
    const userId = user._id;
    const payload: JwtPayload = {
      email: user.email,
      sub: userId,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: userId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}
