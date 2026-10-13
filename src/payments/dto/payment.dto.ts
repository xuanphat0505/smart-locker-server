import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentType } from '../enums/payment.enums';

// DTO yêu cầu khởi tạo phiên thanh toán VietQR
export class CreatePaymentIntentDto {
  @ApiProperty({
    example: '660e8400f29b4e1234567890',
    description: 'Mã định danh MongoDB của kiện hàng cần nộp phạt hoặc gia hạn',
  })
  @IsString({ message: 'Mã kiện hàng phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mã kiện hàng không được để trống' })
  packageId: string;

  @ApiPropertyOptional({
    enum: PaymentType,
    default: PaymentType.OVERDUE_PICKUP,
    description: 'Mục đích thanh toán: Nộp phạt mở tủ hoặc Gia hạn lưu kho',
  })
  @IsOptional()
  @IsEnum(PaymentType, { message: 'Mục đích thanh toán không hợp lệ' })
  paymentType?: PaymentType;

  @ApiPropertyOptional({
    default: false,
    description: 'Đánh dấu phiên thanh toán được khởi tạo tại màn hình trạm tủ Kiosk ESP32',
  })
  @IsOptional()
  isKiosk?: boolean;
}

// DTO xác nhận thanh toán giả lập dành cho môi trường phát triển và kiểm thử
export class SandboxConfirmPaymentDto {
  @ApiProperty({
    example: 8491823912,
    description: 'Mã giao dịch số nguyên duy nhất cần xác nhận thanh toán',
  })
  @IsInt({ message: 'Mã giao dịch orderCode phải là số nguyên' })
  @Min(1, { message: 'Mã giao dịch phải lớn hơn 0' })
  @Type(() => Number)
  orderCode: number;
}

// DTO yêu cầu khởi tạo phiên thanh toán đăng ký hoặc gia hạn gói tháng 30k
export class CreateSubscriptionIntentDto {
  @ApiPropertyOptional({
    example: '660e8400f29b4e1234567890',
    description:
      'Mã định danh tòa nhà đăng ký gói dịch vụ tháng (tùy chọn nếu cư dân đã liên kết với tòa nhà)',
  })
  @IsOptional()
  @IsString({ message: 'Mã tòa nhà phải là chuỗi ký tự' })
  buildingId?: string;
}

// DTO một chặng trong bảng phí lưu kho
export class PricingTierDto {
  @ApiProperty({
    enum: ['FREE', 'TIER_1', 'TIER_2', 'RETRIEVAL'],
    example: 'TIER_1',
    description:
      'Chặng phí: FREE khi giờ lưu kho <= T1, TIER_1 khi <= T2, TIER_2 khi < T3, RETRIEVAL khi >= T3',
  })
  tier: 'FREE' | 'TIER_1' | 'TIER_2' | 'RETRIEVAL';

  @ApiProperty({ example: 12, description: 'Mốc giờ bắt đầu của chặng' })
  fromHours: number;

  @ApiProperty({
    example: 24,
    nullable: true,
    description: 'Mốc giờ kết thúc của chặng, null với chặng thu hồi',
  })
  toHours: number | null;

  @ApiProperty({ example: 10000, description: 'Tổng phí với cư dân có gói tháng (VNĐ)' })
  subscriberFee: number;

  @ApiProperty({ example: 15000, description: 'Tổng phí với khách dùng theo lượt (VNĐ)' })
  retailFee: number;
}

// DTO cấu hình biểu phí trả về cho cư dân
export class PricingPolicyResponseDto {
  @ApiProperty({ example: 30000 })
  monthlySubscriptionFee: number;

  @ApiProperty({ example: 5000 })
  perUseFee: number;

  @ApiProperty({ example: 12 })
  t1Hours: number;

  @ApiProperty({ example: 24 })
  t2Hours: number;

  @ApiProperty({ example: 48 })
  t3Hours: number;

  @ApiProperty({ example: 10000 })
  feeX1: number;

  @ApiProperty({ example: 15000 })
  feeX2: number;

  @ApiProperty({ example: 25000 })
  maxOverdueFeeCap: number;
}

// DTO phản hồi biểu phí của tòa nhà dành cho cư dân
export class ResidentPricingResponseDto {
  @ApiProperty({ example: '6a95091f1e23b42475f441d3' })
  buildingId: string;

  @ApiProperty({ example: 'Tecco Tower Linh Đông' })
  buildingName: string;

  @ApiProperty({ type: () => PricingPolicyResponseDto })
  policy: PricingPolicyResponseDto;

  @ApiProperty({ type: () => PricingTierDto, isArray: true })
  tiers: PricingTierDto[];
}
