import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

// Cắt khoảng trắng đầu cuối trước khi kiểm tra để chuỗi toàn dấu cách không lọt qua giới hạn độ dài
export const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

// Dữ liệu người dùng được tự sửa trực tiếp trên hồ sơ: chỉ họ tên, số điện thoại phải đổi qua xác thực OTP riêng
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trimString)
  @IsString({ message: 'Họ và tên phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Họ và tên tối thiểu 2 ký tự' })
  @MaxLength(100, { message: 'Họ và tên tối đa 100 ký tự' })
  name?: string;
}
