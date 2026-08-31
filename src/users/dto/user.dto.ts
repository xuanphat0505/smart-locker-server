import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsMongoId,
} from 'class-validator';

// DTO cơ sở chứa các thuộc tính tài khoản cơ bản dùng chung
export class BaseUserDto {
  @ApiProperty({
    example: 'Nguyễn Văn A',
    description: 'Họ và tên của người dùng',
  })
  @IsString({ message: 'Họ và tên phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  name: string;

  @ApiProperty({
    example: 'user@smartlocker.vn',
    description: 'Địa chỉ email đăng nhập',
  })
  @IsEmail({}, { message: 'Địa chỉ email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @ApiProperty({
    example: '0912345678',
    description: 'Số điện thoại liên hệ',
  })
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  phone: string;

  @ApiProperty({
    example: 'MatKhau@123456',
    description: 'Mật khẩu khởi tạo tài khoản',
    minLength: 8,
  })
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @MinLength(8, { message: 'Mật khẩu phải có tối thiểu 8 ký tự' })
  password: string;
}

// DTO khởi tạo tài khoản Ban Quản Lý Tòa Nhà do System Admin thực hiện
export class CreateBuildingAdminDto extends BaseUserDto {
  @ApiProperty({
    example: '6543210fedcba98765432101',
    description: 'Mã định danh ObjectId của Tòa nhà được phân công quản lý',
  })
  @IsMongoId({ message: 'Mã tòa nhà buildingId không đúng định dạng ObjectId' })
  @IsNotEmpty({ message: 'Mã tòa nhà không được để trống' })
  buildingId: string;
}

// DTO khởi tạo tài khoản Cư Dân trong chung cư do Ban Quản Lý Tòa Nhà thực hiện
export class CreateResidentDto extends BaseUserDto {
  @ApiProperty({
    example: 'A1204',
    description: 'Số phòng hoặc số căn hộ của cư dân trong tòa nhà',
  })
  @IsString({ message: 'Số căn hộ phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Số căn hộ không được để trống' })
  apartment: string;
}

// DTO cập nhật thông tin người dùng
export class UpdateUserDto extends PartialType(BaseUserDto) {}

// DTO từ chối phê duyệt hồ sơ cư dân kèm theo lý do
export class RejectResidentDto {
  @ApiProperty({
    example: 'Số căn hộ không khớp với danh sách cư dân của tòa nhà',
    description: 'Lý do Ban Quản Lý từ chối phê duyệt hồ sơ cư dân',
  })
  @IsString({ message: 'Lý do từ chối phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Lý do từ chối không được để trống' })
  reason: string;
}
