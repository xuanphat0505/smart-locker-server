import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
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

  @ApiPropertyOptional({
    example: 10.84231,
    description: 'Vĩ độ địa lý (Latitude)',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Vĩ độ latitude phải là số' })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    example: 106.84025,
    description: 'Kinh độ địa lý (Longitude)',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Kinh độ longitude phải là số' })
  @Min(-180)
  @Max(180)
  longitude?: number;
  @ApiPropertyOptional({
    example: 'bql.s101@smartlocker.vn',
    description: 'Email chính thức của Ban Quản Lý tòa nhà',
  })
  @IsOptional()
  @IsString({ message: 'Email quản lý phải là chuỗi ký tự' })
  managementEmail?: string;
}

// DTO thông tin tài khoản ngân hàng thụ hưởng của Ban Quản Lý
export class BankAccountDto {
  @ApiPropertyOptional({
    example: '970422',
    description: 'Mã BIN ngân hàng thụ hưởng chuẩn NAPAS (vd: 970422 - MBBank)',
  })
  @IsOptional()
  @IsString({ message: 'Mã BIN ngân hàng phải là chuỗi ký tự' })
  bankBin?: string;

  @ApiPropertyOptional({
    example: 'MBBank',
    description: 'Tên ngân hàng thụ hưởng',
  })
  @IsOptional()
  @IsString({ message: 'Tên ngân hàng phải là chuỗi ký tự' })
  bankName?: string;

  @ApiPropertyOptional({
    example: '0123456789',
    description: 'Số tài khoản ngân hàng thụ hưởng của Ban Quản Lý',
  })
  @IsOptional()
  @IsString({ message: 'Số tài khoản phải là chuỗi ký tự' })
  accountNumber?: string;

  @ApiPropertyOptional({
    example: 'BQL CHUNG CU TECCO TOWER',
    description: 'Tên chủ tài khoản thụ hưởng',
  })
  @IsOptional()
  @IsString({ message: 'Tên chủ tài khoản phải là chuỗi ký tự' })
  accountName?: string;
}

// DTO cấu hình biểu phí 4 chặng của tòa nhà
export class PricingPolicyDto {
  @ApiPropertyOptional({
    example: 30000,
    description: 'Mức phí gói tháng VIP (VNĐ / 30 ngày)',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Phí gói tháng phải là số' })
  @Min(0, { message: 'Phí gói tháng không được âm' })
  monthlySubscriptionFee?: number;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Phí lượt nhận hàng lẻ dành cho khách chưa mua gói tháng (VNĐ / lượt)',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Phí lượt lẻ phải là số' })
  @Min(0, { message: 'Phí lượt lẻ không được âm' })
  perUseFee?: number;

  @ApiPropertyOptional({
    example: 12,
    description: 'Mốc thời lượng T1 tính từ thời điểm gửi hàng (giờ)',
    minimum: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Mốc T1 phải là số nguyên giờ' })
  @Min(1, { message: 'Mốc T1 tối thiểu 1 giờ' })
  t1Hours?: number;

  @ApiPropertyOptional({
    example: 24,
    description: 'Mốc thời lượng T2 tính từ thời điểm gửi hàng (giờ)',
    minimum: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Mốc T2 phải là số nguyên giờ' })
  @Min(1, { message: 'Mốc T2 tối thiểu 1 giờ' })
  t2Hours?: number;

  @ApiPropertyOptional({
    example: 48,
    description: 'Mốc thời lượng T3 tính từ thời điểm gửi hàng trước khi thu hồi (giờ)',
    minimum: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Mốc T3 phải là số nguyên giờ' })
  @Min(1, { message: 'Mốc T3 tối thiểu 1 giờ' })
  t3Hours?: number;

  @ApiPropertyOptional({
    example: 10000,
    description: 'Phụ thu chặng T1 đến T2 (VNĐ)',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Phụ thu X1 phải là số' })
  @Min(0, { message: 'Phụ thu X1 không được âm' })
  feeX1?: number;

  @ApiPropertyOptional({
    example: 15000,
    description: 'Phụ thu chặng T2 đến T3 (VNĐ)',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Phụ thu X2 phải là số' })
  @Min(0, { message: 'Phụ thu X2 không được âm' })
  feeX2?: number;

  @ApiPropertyOptional({
    example: 25000,
    description: 'Mức trần phụ thu quá hạn tối đa (VNĐ)',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Mức trần phụ thu phải là số' })
  @Min(0, { message: 'Mức trần phụ thu không được âm' })
  maxOverdueFeeCap?: number;
}

// DTO cập nhật thông tin Tòa Nhà
export class UpdateBuildingDto extends PartialType(CreateBuildingDto) {
  @ApiPropertyOptional({
    type: () => BankAccountDto,
    description: 'Thông tin tài khoản ngân hàng thụ hưởng của Ban Quản Lý',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BankAccountDto)
  bankAccount?: BankAccountDto;

  @ApiPropertyOptional({
    type: () => PricingPolicyDto,
    description: 'Cấu hình biểu phí 4 chặng của tòa nhà',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PricingPolicyDto)
  pricingPolicy?: PricingPolicyDto;

  @ApiPropertyOptional({
    enum: BuildingStatus,
    example: BuildingStatus.ACTIVE,
    description: 'Trạng thái hoạt động của Tòa Nhà (Chỉ System Admin có quyền sửa)',
  })
  @IsOptional()
  @IsEnum(BuildingStatus, { message: 'Trạng thái tòa nhà không hợp lệ' })
  status?: BuildingStatus;
}

// DTO tham số truy vấn tìm kiếm Tòa Nhà gần vị trí GPS hiện tại
export class FindNearbyBuildingsDto {
  @ApiProperty({
    example: 10.84231,
    description: 'Vĩ độ GPS hiện tại của thiết bị (Latitude)',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Vĩ độ lat phải là số' })
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({
    example: 106.84025,
    description: 'Kinh độ GPS hiện tại của thiết bị (Longitude)',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Kinh độ lng phải là số' })
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiPropertyOptional({
    example: 5000,
    description:
      'Bán kính tìm kiếm tối đa tính bằng mét (mặc định: 5000m = 5km)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Bán kính radius phải là số' })
  @Min(100)
  @Max(100000)
  radius?: number;
}
