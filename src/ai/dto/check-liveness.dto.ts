import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

// DTO chua du lieu dau vao cho yeu cau kiem tra do chan thuc khuon mat
export class CheckLivenessDto {
  @ApiPropertyOptional({
    description: 'Chuoi ma hoa Base64 cua anh khuon mat can kiem tra',
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
  })
  @IsOptional()
  @IsString({ message: 'Chuoi Base64 phai la dinh dang van ban hop le' })
  imageBase64?: string;

  @ApiPropertyOptional({
    description: 'Nguong xac suat de danh gia khuon mat that (mac dinh 0.75)',
    example: 0.75,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Nguong kiem tra phai la so thuc' })
  @Min(0, { message: 'Nguong kiem tra toi thieu la 0' })
  @Max(1, { message: 'Nguong kiem tra toi da la 1' })
  threshold?: number;
}
