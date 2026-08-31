import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { BuildingStatus } from '../enums/building-status.enum';

// DTO khởi tạo Tòa Nhà mới do System Admin thực hiện
export class CreateBuildingDto {
  @ApiProperty({
    example: 'Tòa S1.01',
    description: 'Tên hiển thị của Tòa Nhà',
  })
  @IsString({ message: 'Tên tòa nhà phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên tòa nhà không được để trống' })
  name: string;

  @ApiProperty({
    example: 'S1.01',
    description: 'Mã viết tắt duy nhất của Tòa Nhà',
  })
  @IsString({ message: 'Mã tòa nhà phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mã tòa nhà không được để trống' })
  code: string;

  @ApiProperty({
    example:
      'Khu đô thị Vinhomes Grand Park, Phường Long Bình, TP. Thủ Đức, TP. Hồ Chí Minh',
    description: 'Địa chỉ chi tiết của Tòa Nhà',
  })
  @IsString({ message: 'Địa chỉ tòa nhà phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Địa chỉ tòa nhà không được để trống' })
  address: string;

  @ApiProperty({
    example: 25,
    description: 'Tổng số tầng của Tòa Nhà',
    minimum: 1,
  })
  @IsInt({ message: 'Tổng số tầng phải là số nguyên' })
  @Min(1, { message: 'Tổng số tầng phải lớn hơn hoặc bằng 1' })
  totalFloors: number;

  @ApiProperty({
    example: 500,
    description: 'Ước tính tổng số căn hộ trong Tòa Nhà',
    minimum: 1,
  })
  @IsInt({ message: 'Tổng số căn hộ phải là số nguyên' })
  @Min(1, { message: 'Tổng số căn hộ phải lớn hơn hoặc bằng 1' })
  totalApartments: number;

  @ApiPropertyOptional({
    example: '02812345678',
    description: 'Số điện thoại hotline lễ tân / Ban Quản Lý tòa nhà',
  })
  @IsOptional()
  @IsString({ message: 'Số hotline phải là chuỗi ký tự' })
  hotline?: string;

  @ApiPropertyOptional({
    example: 'Sảnh chính tầng 1 gần thang máy tháp A',
    description: 'Mô tả vị trí hoặc ghi chú về tòa nhà',
  })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  description?: string;
}

// DTO cập nhật thông tin Tòa Nhà
export class UpdateBuildingDto extends PartialType(CreateBuildingDto) {
  @ApiPropertyOptional({
    enum: BuildingStatus,
    example: BuildingStatus.ACTIVE,
    description: 'Trạng thái hoạt động của Tòa Nhà',
  })
  @IsOptional()
  @IsEnum(BuildingStatus, { message: 'Trạng thái tòa nhà không hợp lệ' })
  status?: BuildingStatus;
}
