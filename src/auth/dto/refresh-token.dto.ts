import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// DTO định nghĩa dữ liệu gửi lên khi yêu cầu cấp lại mã truy cập mới từ Refresh Token
export class RefreshTokenDto {
  @ApiProperty({
    description:
      'Mã Refresh Token hợp lệ đã được cấp khi đăng nhập hoặc đăng ký',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsNotEmpty({ message: 'Refresh Token không được để trống' })
  @IsString({ message: 'Refresh Token phải là chuỗi ký tự hợp lệ' })
  refreshToken: string;
}
