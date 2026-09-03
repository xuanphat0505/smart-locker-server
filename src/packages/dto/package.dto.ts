import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsEnum,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BoxSize } from '../../lockers/enums/locker.enums';

// DTO tài xế gửi kiện hàng vào ngăn tủ không cần tài khoản (Guest Shipper)
export class DropOffPackageDto {
  @ApiProperty({
    example: 'LK-S101-01',
    description: 'Mã trạm tủ tài xế đang thao tác gửi hàng',
  })
  @IsString()
  @IsNotEmpty()
  lockerCode: string;

  @ApiProperty({
    example: '0912345678',
    description: 'Số điện thoại của cư dân nhận hàng',
  })
  @IsString()
  @IsNotEmpty()
  receiverPhone: string;

  @ApiProperty({
    example: '0987654321',
    description: 'Số điện thoại của tài xế giao hàng',
  })
  @IsString()
  @IsNotEmpty()
  shipperPhone: string;

  @ApiPropertyOptional({
    example: 'Trần Giao Hàng',
    description: 'Tên tài xế giao hàng',
  })
  @IsString()
  @IsOptional()
  shipperName?: string;

  @ApiProperty({
    example: 'Shopee Xpress',
    description: 'Tên hãng giao vận vận chuyển bưu phẩm',
  })
  @IsString()
  @IsNotEmpty()
  carrierName: string;

  @ApiProperty({
    example: 4,
    description: 'Số thứ tự ngăn tủ tài xế đã chọn',
  })
  @IsNumber()
  @Min(1)
  boxNumber: number;

  @ApiProperty({
    enum: BoxSize,
    example: BoxSize.MEDIUM,
    description: 'Kích cỡ ngăn tủ đã chọn',
  })
  @IsEnum(BoxSize)
  boxSize: BoxSize;

  @ApiProperty({
    example: 'SPX839201948',
    description: 'Mã vận đơn của đơn vị vận chuyển',
  })
  @IsString()
  @IsNotEmpty()
  trackingNumber: string;

  @ApiPropertyOptional({
    example: 'Hàng dễ vỡ đóng hộp',
    description: 'Ghi chú thêm về kiện hàng',
  })
  @IsString()
  @IsOptional()
  note?: string;
}

// DTO nhận bưu kiện bằng mã OTP 6 số tại màn hình Kiosk trạm tủ
export class PickupOtpDto {
  @ApiProperty({
    example: 'LK-S101-01',
    description: 'Mã trạm tủ cư dân đang đứng lấy hàng',
  })
  @IsString()
  @IsNotEmpty()
  lockerCode: string;

  @ApiProperty({
    example: '384920',
    description: 'Mã OTP 6 chữ số nhận được trong thông báo',
  })
  @IsString()
  @Length(6, 6, { message: 'Mã OTP phải bao gồm đúng 6 chữ số' })
  @IsNotEmpty()
  pinCode: string;
}

// DTO nhận bưu kiện bằng quét mã QR Token trước camera trạm tủ
export class PickupQrDto {
  @ApiProperty({
    example: 'LK-S101-01',
    description: 'Mã trạm tủ cư dân đang quét mã QR',
  })
  @IsString()
  @IsNotEmpty()
  lockerCode: string;

  @ApiProperty({
    example: 'f8a7b9c0d1e2f3a4b5c6d7e8',
    description: 'Mã token bí mật từ mã QR trên ứng dụng cư dân',
  })
  @IsString()
  @IsNotEmpty()
  qrCodeToken: string;
}
