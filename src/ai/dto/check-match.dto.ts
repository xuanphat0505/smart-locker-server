import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// DTO du lieu yeu cau kiem tra so khop khuon mat doc lap phuc vu thu nghiem
export class CheckFaceMatchDto {
  @ApiPropertyOptional({
    description:
      'Ma dinh danh duy nhat cua tram tu thong minh (vi du: LK-01 hoac LK-TECCO-01)',
    example: 'LK-TECCO-01',
  })
  @IsOptional()
  @IsString({ message: 'Ma tram tu phai la chuoi ky tu' })
  lockerCode?: string;

  @ApiPropertyOptional({
    description:
      'Chuoi Base64 cua anh chup khuon mat (tuy chon neu gui file truc tiep qua multipart)',
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
  })
  @IsOptional()
  @IsString({ message: 'Chuoi Base64 phai la van ban hop le' })
  imageBase64?: string;

  @ApiPropertyOptional({
    description:
      'Tra ve chuoi Base64 cua vung khuon mat da duoc UltraFace tu dong phat hien va cat (phuc vu kiem thu debug tren Postman)',
    example: false,
  })
  @IsOptional()
  includeCroppedFace?: boolean;
}
