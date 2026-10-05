import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// DTO chi tiết đơn hàng gửi từ webhook IPN của cổng thanh toán SePay PG
export class SepayPgOrderDto {
  @ApiPropertyOptional({ example: 'PAY46736AC32011B54BB' })
  @IsOptional()
  @IsString({ message: 'Mã order_id phải là chuỗi ký tự' })
  order_id?: string;

  @ApiPropertyOptional({ example: '6247846282' })
  @IsOptional()
  order_invoice_number?: string | number;

  @ApiPropertyOptional({ example: 'CAPTURED' })
  @IsOptional()
  @IsString({ message: 'Trạng thái đơn hàng phải là chuỗi ký tự' })
  order_status?: string;

  @ApiPropertyOptional({ example: 30000 })
  @IsOptional()
  order_amount?: number | string;

  @ApiPropertyOptional({ example: 'SUB6247846282' })
  @IsOptional()
  @IsString({ message: 'Mô tả đơn hàng phải là chuỗi ký tự' })
  order_description?: string;

  @ApiPropertyOptional({ example: 'FT261003890123' })
  @IsOptional()
  @IsString({ message: 'Mã tham chiếu ngân hàng phải là chuỗi ký tự' })
  transaction_id?: string;
}

// DTO tiếp nhận và xác thực dữ liệu webhook từ cổng thanh toán SePay
export class SepayWebhookDto {
  // Mã định danh phiên giao dịch trên hệ thống SePay
  @ApiPropertyOptional({
    example: 92704,
    description: 'Mã định danh giao dịch trên hệ thống SePay',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Mã id giao dịch SePay phải là số' })
  @Type(() => Number)
  id?: number;

  // Tên cổng thanh toán hoặc ngân hàng xử lý giao dịch
  @ApiPropertyOptional({
    example: 'MBBank',
    description: 'Tên ngân hàng hoặc cổng thanh toán xử lý giao dịch',
  })
  @IsOptional()
  @IsString({ message: 'Tên ngân hàng phải là chuỗi ký tự' })
  gateway?: string;

  // Thời điểm phát sinh giao dịch phía ngân hàng
  @ApiPropertyOptional({
    example: '2026-10-03 14:02:37',
    description: 'Thời điểm phát sinh biến động số dư phía ngân hàng',
  })
  @IsOptional()
  @IsString({ message: 'Thời gian giao dịch phải là chuỗi ký tự' })
  transactionDate?: string;

  // Số tài khoản ngân hàng nhận tiền
  @ApiPropertyOptional({
    example: '0379986388',
    description: 'Số tài khoản ngân hàng nhận tiền thụ hưởng',
  })
  @IsOptional()
  @IsString({ message: 'Số tài khoản phải là chuỗi ký tự' })
  accountNumber?: string;

  // Số tài khoản ngân hàng phụ
  @ApiPropertyOptional({
    example: null,
    description: 'Số tài khoản phụ nếu có',
  })
  @IsOptional()
  @IsString({ message: 'Số tài khoản phụ phải là chuỗi ký tự' })
  subAccount?: string;

  // Phân loại luồng tiền chuyển vào hoặc rút ra
  @ApiPropertyOptional({
    example: 'in',
    description: 'Loại luồng tiền chuyển khoản',
  })
  @IsOptional()
  @IsString({ message: 'Loại giao dịch phải là chuỗi ký tự' })
  transferType?: string;

  // Số tiền chuyển khoản thực tế ghi nhận vào tài khoản
  @ApiPropertyOptional({
    example: 10000,
    description: 'Số tiền cư dân chuyển khoản thành công',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Số tiền chuyển khoản phải là số' })
  @Type(() => Number)
  transferAmount?: number;

  // Số dư tài khoản lũy kế sau biến động
  @ApiPropertyOptional({
    example: 100000,
    description: 'Số dư tài khoản lũy kế sau biến động',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Số dư lũy kế phải là số' })
  @Type(() => Number)
  accumulated?: number;

  // Mã nhận diện giao dịch SePay
  @ApiPropertyOptional({
    example: null,
    description: 'Mã nhận diện do SePay tạo',
  })
  @IsOptional()
  @IsString({ message: 'Mã nhận diện code phải là chuỗi ký tự' })
  code?: string;

  // Nội dung chuyển khoản ngân hàng chứa mã orderCode
  @ApiPropertyOptional({
    example: 'LOCKER890123',
    description: 'Nội dung chuyển khoản chứa mã đơn hàng nộp phạt hoặc gia hạn',
  })
  @IsOptional()
  @IsString({ message: 'Nội dung chuyển khoản phải là chuỗi ký tự' })
  content?: string;

  // Mã tham chiếu đối soát giao dịch ngân hàng
  @ApiPropertyOptional({
    example: 'FT261003890123',
    description: 'Mã tham chiếu đối soát giao dịch phía ngân hàng',
  })
  @IsOptional()
  @IsString({ message: 'Mã tham chiếu ngân hàng phải là chuỗi ký tự' })
  referenceCode?: string;

  // Mô tả bổ sung chi tiết giao dịch
  @ApiPropertyOptional({
    example: '',
    description: 'Mô tả chi tiết giao dịch từ ngân hàng',
  })
  @IsOptional()
  @IsString({ message: 'Mô tả giao dịch phải là chuỗi ký tự' })
  description?: string;

  // Loại thông báo IPN từ SePay Payment Gateway
  @ApiPropertyOptional({
    example: 'ORDER_PAID',
    description: 'Loại sự kiện IPN gửi từ cổng thanh toán SePay PG',
  })
  @IsOptional()
  @IsString({ message: 'Loại thông báo phải là chuỗi ký tự' })
  notification_type?: string;

  // Dữ liệu đơn hàng chi tiết từ sự kiện IPN
  @ApiPropertyOptional({
    description: 'Chi tiết đơn hàng gửi từ webhook IPN của SePay PG',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SepayPgOrderDto)
  order?: SepayPgOrderDto;
}
