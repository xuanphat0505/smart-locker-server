import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// DTO định nghĩa thông tin đăng nhập tài khoản bằng email và mật khẩu
export class LoginDto {
  @ApiProperty({
    description: 'Địa chỉ email đăng nhập',
    example: 'nguyenvana@gmail.com',
  })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Địa chỉ email không đúng định dạng' })
  email: string;

  @ApiProperty({
    description: 'Mật khẩu đăng nhập',
    example: 'MatKhau123@',
    minLength: 6,
  })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;
}
