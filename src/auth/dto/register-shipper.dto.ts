import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// DTO định nghĩa dữ liệu đầu vào cho yêu cầu đăng ký tài khoản Tài Xế Giao Hàng
export class RegisterShipperDto {
  @ApiProperty({
    description: 'Họ và tên của Tài xế giao hàng',
    example: 'Trần Văn B',
  })
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  @IsString({ message: 'Họ và tên phải là chuỗi ký tự' })
  name: string;

  @ApiProperty({
    description: 'Địa chỉ email đăng ký',
    example: 'tranvanb.shipper@gmail.com',
  })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Địa chỉ email không đúng định dạng' })
  email: string;

  @ApiProperty({
    description: 'Số điện thoại liên hệ tại Việt Nam',
    example: '0987654321',
  })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @Matches(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/, {
    message: 'Số điện thoại không đúng định dạng Việt Nam',
  })
  phone: string;

  @ApiProperty({
    description: 'Mật khẩu đăng nhập tối thiểu 6 ký tự',
    example: 'ShipperPass123@',
    minLength: 6,
  })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;

  @ApiProperty({
    description: 'Tên đơn vị vận chuyển mà tài xế đại diện',
    example: 'Shopee Xpress',
  })
  @IsNotEmpty({ message: 'Tên đơn vị vận chuyển không được để trống' })
  @IsString({
    message:
      'Tên đơn vị vận chuyển phải là chuỗi ký tự (ví dụ: Shopee Xpress, GHTK)',
  })
  carrierName: string;
}
