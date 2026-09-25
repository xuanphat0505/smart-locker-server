import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// DTO du lieu yeu cau xac thuc khuon mat mo tu gui tu camera ESP32-CAM cua tram tu
export class VerifyFaceHardwareDto {
  @ApiProperty({
    description: 'Ma dinh danh duy nhat cua tram tu thong minh (vi du: LK-01)',
    example: 'LK-01',
  })
  @IsNotEmpty({ message: 'Ma tram tu khong duoc de trong' })
  @IsString({ message: 'Ma tram tu phai la chuoi ky tu' })
  lockerCode: string;

  @ApiPropertyOptional({
    description:
      'Chuoi Base64 cua anh chup tu camera (tuy chon neu gui qua multipart)',
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
  })
  @IsOptional()
  @IsString({ message: 'Chuoi Base64 phai la van ban hop le' })
  imageBase64?: string;
}
