import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray } from 'class-validator';

// DTO dữ liệu yêu cầu đăng ký Face ID của cư dân
export class EnrollFaceDto {
  @ApiPropertyOptional({
    description:
      'Chuỗi Base64 của ảnh chân dung selfie đăng ký Face ID (ảnh chính diện đơn lẻ)',
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
  })
  @IsOptional()
  @IsString({ message: 'Chuỗi Base64 phải là văn bản hợp lệ' })
  faceImageBase64?: string;

  @ApiPropertyOptional({
    description:
      'Chuỗi Base64 của ảnh chân dung selfie đăng ký Face ID (alias của faceImageBase64)',
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
  })
  @IsOptional()
  @IsString({ message: 'Chuỗi Base64 phải là văn bản hợp lệ' })
  imageBase64?: string;

  @ApiPropertyOptional({
    description:
      'Mảng chuỗi Base64 của 3 góc mặt: chính diện, nghiêng trái, nghiêng phải',
    example: [
      'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
      'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
      'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
    ],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'Danh sách ảnh phải là một mảng' })
  @IsString({
    each: true,
    message: 'Từng ảnh Base64 phải là chuỗi văn bản hợp lệ',
  })
  imagesBase64?: string[];
}
