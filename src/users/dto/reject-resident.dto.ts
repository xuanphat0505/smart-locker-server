import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// DTO định nghĩa lý do từ chối phê duyệt hồ sơ Cư Dân của Ban Quản Lý
export class RejectResidentDto {
  @ApiProperty({
    description: 'Lý do Ban Quản Lý từ chối hồ sơ cư dân',
    example: 'Số căn hộ không khớp với thông tin hợp đồng thuê/mua nhà',
  })
  @IsNotEmpty({ message: 'Lý do từ chối không được để trống' })
  @IsString({ message: 'Lý do từ chối phải là chuỗi ký tự' })
  reason: string;
}
