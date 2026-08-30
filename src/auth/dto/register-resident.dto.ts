import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// DTO định nghĩa dữ liệu đầu vào cho yêu cầu đăng ký tài khoản Cư Dân
export class RegisterResidentDto {
  @ApiProperty({
    description: 'Họ và tên của Cư dân',
    example: 'Nguyễn Văn A',
  })
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  @IsString({ message: 'Họ và tên phải là chuỗi ký tự' })
  name: string;

  @ApiProperty({
    description: 'Địa chỉ email đăng ký',
    example: 'nguyenvana@gmail.com',
  })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Địa chỉ email không đúng định dạng' })
  email: string;

  @ApiProperty({
    description: 'Số điện thoại liên hệ tại Việt Nam',
    example: '0912345678',
  })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @Matches(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/, {
    message: 'Số điện thoại không đúng định dạng Việt Nam',
  })
  phone: string;

  @ApiProperty({
    description: 'Mật khẩu đăng nhập tối thiểu 6 ký tự',
    example: 'MatKhau123@',
    minLength: 6,
  })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;

  @ApiProperty({
    description: 'Mã định danh ObjectId của Tòa nhà cư trú',
    example: '6543210fedcba9876543210f',
  })
  @IsNotEmpty({ message: 'Mã tòa nhà không được để trống' })
  @IsString({ message: 'Mã tòa nhà phải là chuỗi hợp lệ' })
  buildingId: string;

  @ApiProperty({
    description: 'Mã căn hộ cư trú của cư dân',
    example: 'A1204',
  })
  @IsNotEmpty({ message: 'Số căn hộ không được để trống' })
  @IsString({ message: 'Số căn hộ phải là chuỗi ký tự (ví dụ: 12B, A402)' })
  apartment: string;
}
