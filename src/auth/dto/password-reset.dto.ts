import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// DTO yêu cầu gửi mã OTP đặt lại mật khẩu qua email
export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Địa chỉ email đã đăng ký tài khoản cần khôi phục',
    example: 'cudan.a1204@vinhomes.vn',
  })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Địa chỉ email không đúng định dạng' })
  email: string;
}

// DTO yêu cầu đặt lại mật khẩu mới thông qua mã OTP xác thực
export class ResetPasswordDto {
  @ApiProperty({
    description: 'Địa chỉ email của tài khoản cần đặt lại mật khẩu',
    example: 'cudan.a1204@vinhomes.vn',
  })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Địa chỉ email không đúng định dạng' })
  email: string;

  @ApiProperty({
    description: 'Mã số OTP 6 chữ số nhận qua email',
    example: '849201',
    minLength: 6,
    maxLength: 6,
  })
  @IsNotEmpty({ message: 'Mã OTP không được để trống' })
  @IsString({ message: 'Mã OTP phải là chuỗi ký tự số' })
  @Length(6, 6, { message: 'Mã OTP phải có đúng 6 chữ số' })
  otp: string;

  @ApiProperty({
    description: 'Mật khẩu mới thay thế, tối thiểu 8 ký tự',
    example: 'NewSecurePassword@123',
    minLength: 8,
  })
  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  @IsString({ message: 'Mật khẩu mới phải là chuỗi ký tự' })
  @MinLength(8, { message: 'Mật khẩu mới phải có tối thiểu 8 ký tự' })
  newPassword: string;
}
