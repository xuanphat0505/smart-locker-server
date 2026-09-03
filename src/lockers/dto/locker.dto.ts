import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BoxSize } from '../enums';

// Cấu hình kích cỡ cho từng ngăn tủ cụ thể khi khởi tạo trạm tủ
export class BoxConfigDto {
  @ApiProperty({ example: 1, description: 'Số thứ tự ngăn tủ' })
  @IsNumber()
  @Min(1)
  boxNumber: number;

  @ApiProperty({
    enum: BoxSize,
    example: BoxSize.MEDIUM,
    description: 'Kích cỡ ngăn tủ',
  })
  @IsEnum(BoxSize)
  size: BoxSize;
}

// Tọa độ địa lý GPS của trạm tủ thông minh
export class CoordinatesDto {
  @ApiProperty({ example: 10.84231, description: 'Vĩ độ GPS' })
  @IsNumber()
  latitude: number;

  @ApiProperty({ example: 106.84025, description: 'Kinh độ GPS' })
  @IsNumber()
  longitude: number;
}

// DTO khởi tạo trạm tủ thông minh mới do System Admin thực hiện
export class CreateLockerDto {
  @ApiProperty({
    example: 'Trạm Tủ Sảnh Chính Tòa S1.01',
    description: 'Tên hiển thị của trạm tủ',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'LK-S101-01',
    description: 'Mã định danh duy nhất của trạm tủ',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: '66d01234567890abcdef1234',
    description: 'Mã ID tòa nhà đặt trạm tủ',
  })
  @IsString()
  @IsNotEmpty()
  buildingId: string;

  @ApiProperty({
    example: 16,
    description: 'Tổng số lượng ngăn tủ cần khởi tạo tự động',
  })
  @IsNumber()
  @Min(1)
  totalBoxes: number;

  @ApiProperty({
    example: 'AA:BB:CC:11:22:33',
    description: 'Địa chỉ MAC phần cứng bộ điều khiển IoT',
  })
  @IsString()
  @IsNotEmpty()
  macAddress: string;

  @ApiPropertyOptional({
    example: 'Cạnh quầy lễ tân sảnh A tầng 1',
    description: 'Vị trí đặt tủ chi tiết',
  })
  @IsString()
  @IsOptional()
  locationDescription?: string;

  @ApiPropertyOptional({
    type: CoordinatesDto,
    description: 'Tọa độ GPS trạm tủ',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates?: CoordinatesDto;

  @ApiPropertyOptional({
    type: [BoxConfigDto],
    description: 'Cấu hình chi tiết kích thước từng ngăn (nếu có)',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => BoxConfigDto)
  boxesConfig?: BoxConfigDto[];
}

// DTO tra cứu cư dân theo số điện thoại và mã trạm tủ trước khi bỏ hàng
export class LookupReceiverDto {
  @ApiProperty({
    example: '0912345678',
    description: 'Số điện thoại của cư dân cần tra cứu',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({
    example: 'LK-S101-01',
    description: 'Mã trạm tủ nơi tài xế đang thao tác',
  })
  @IsString()
  @IsNotEmpty()
  lockerCode: string;
}
