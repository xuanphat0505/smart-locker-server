import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Length,
  IsOptional,
  IsBoolean,
} from 'class-validator';

// DTO kích hoạt xác thực hai bước TOTP bằng mã xác nhận 6 số lần đầu
export class TwoFactorTurnOnDto {
  @ApiProperty({
    example: '123456',
    description: 'Mã xác thực 6 chữ số từ ứng dụng Authenticator',
  })
  @IsString({ message: 'Mã xác thực phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mã xác thực không được để trống' })
  @Length(6, 6, { message: 'Mã xác thực phải có đúng 6 chữ số' })
  code: string;
}

// DTO hủy kích hoạt xác thực hai bước yêu cầu mật khẩu hiện tại
export class TwoFactorTurnOffDto {
  @ApiProperty({
    example: 'MyPassword@123',
    description: 'Mật khẩu hiện tại của tài khoản để xác nhận tắt 2FA',
  })
  @IsString({ message: 'Mật khẩu hiện tại phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu hiện tại không được để trống' })
  currentPassword: string;
}

// DTO xác thực mã 2FA hoặc mã dự phòng trong bước đăng nhập
export class TwoFactorAuthenticateDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description:
      'Token tạm thời được cấp ở bước đăng nhập mật khẩu (hạn 5 phút)',
  })
  @IsString({ message: 'Token tạm thời phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Token tạm thời không được để trống' })
  tempToken: string;

  @ApiProperty({
    example: '123456',
    description: 'Mã TOTP 6 số hoặc mã khôi phục dự phòng',
  })
  @IsString({ message: 'Mã xác thực phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mã xác thực không được để trống' })
  code: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Đánh dấu nếu người dùng sử dụng mã khôi phục dự phòng thay vì TOTP',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'Trạng thái mã dự phòng phải là kiểu boolean' })
  isBackupCode?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Đánh dấu nếu người dùng sử dụng mã khôi phục (recovery code)',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'Trạng thái mã khôi phục phải là kiểu boolean' })
  isRecoveryCode?: boolean;
}
