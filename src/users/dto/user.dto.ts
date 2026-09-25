import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsMongoId,
} from 'class-validator';
import { LockerStatus } from '../../lockers/enums';

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

  @ApiProperty({
    example:
      'https://res.cloudinary.com/demo/image/upload/v1/smart-locker/avatars/user.jpg',
    description: 'Đường dẫn ảnh đại diện cá nhân',
    required: false,
  })
  avatar?: string;
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

// DTO phản hồi kết quả sau khi cập nhật ảnh đại diện người dùng
export class UploadAvatarResponseDto {
  @ApiProperty({
    example:
      'https://res.cloudinary.com/demo/image/upload/v1/smart-locker/avatars/user.jpg',
    description: 'Đường dẫn ảnh đại diện mới sau khi tải lên thành công',
  })
  avatar: string;

  @ApiProperty({
    example: 'Cập nhật ảnh đại diện thành công',
    description: 'Thông báo kết quả thực hiện',
  })
  message: string;
}

// DTO thông tin trạm tủ được chỉ định cho cư dân tại tòa nhà
export class AssignedLockerDto {
  @ApiProperty({ example: '6a95091f1e23b42475f441d3' })
  id: string;

  @ApiProperty({ example: 'Trạm Tủ Sảnh Chính Tòa S1.01' })
  name: string;

  @ApiProperty({ example: 'LK-S101-01' })
  code: string;

  @ApiProperty({
    example: LockerStatus.ONLINE,
    enum: LockerStatus,
  })
  status: LockerStatus;

  @ApiProperty({ example: 'Cạnh quầy lễ tân sảnh A tầng 1', required: false })
  locationDescription?: string;

  @ApiProperty({ example: 16, required: false })
  totalBoxes?: number;
}

// DTO phản hồi thông tin hồ sơ tài khoản cá nhân kèm tên tòa nhà
export class UserProfileResponseDto {
  @ApiProperty({ example: '6543210fedcba9876543210f' })
  id: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  name: string;

  @ApiProperty({ example: 'user@smartlocker.vn' })
  email: string;

  @ApiProperty({ example: '0912345678' })
  phone: string;

  @ApiProperty({ example: 'RESIDENT' })
  role: string;

  @ApiProperty({ example: '6543210fedcba98765432101', required: false })
  buildingId?: string;

  @ApiProperty({ example: 'Chung cư Green Park (Tòa A)', required: false })
  buildingName?: string;

  @ApiProperty({ example: 'A1204', required: false })
  apartment?: string;

  @ApiProperty({ example: 'ACTIVE' })
  approvalStatus: string;

  @ApiProperty({
    example:
      'https://res.cloudinary.com/demo/image/upload/v1/smart-locker/avatars/user.jpg',
    required: false,
  })
  avatar?: string;

  @ApiProperty({ type: AssignedLockerDto, required: false })
  assignedLocker?: AssignedLockerDto;

  @ApiProperty({ example: '028 3822 6868', required: false })
  buildingHotline?: string;

  @ApiProperty({ example: 'bql.s101@smartlocker.vn', required: false })
  buildingEmail?: string;

  @ApiProperty({ example: false, required: false })
  twoFactorEnabled?: boolean;

  @ApiProperty({
    type: Object,
    example: { enabled: true, enrolledAt: '2026-09-24T12:00:00.000Z' },
    required: false,
  })
  faceAuth?: {
    enabled: boolean;
    enrolledAt?: Date;
  };

  @ApiProperty({ required: false })
  createdAt?: Date;

  @ApiProperty({ required: false })
  updatedAt?: Date;
}

// DTO yêu cầu thay đổi mật khẩu tài khoản cá nhân của người dùng đang đăng nhập
export class ChangePasswordDto {
  @ApiProperty({
    example: 'OldPassword@123',
    description: 'Mật khẩu hiện tại của tài khoản',
  })
  @IsString({ message: 'Mật khẩu hiện tại phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu hiện tại không được để trống' })
  currentPassword: string;

  @ApiProperty({
    example: 'NewSecurePassword@456',
    description: 'Mật khẩu mới thay thế, tối thiểu 8 ký tự',
    minLength: 8,
  })
  @IsString({ message: 'Mật khẩu mới phải là chuỗi ký tự' })
  @MinLength(8, { message: 'Mật khẩu mới phải có tối thiểu 8 ký tự' })
  newPassword: string;
}

// DTO đăng ký hoặc cập nhật mã push token nhận thông báo trên thiết bị di động
export class UpdatePushTokenDto {
  @ApiProperty({
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    description: 'Mã push token của thiết bị di động do Expo cấp',
  })
  @IsString({ message: 'Push token phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Push token không được để trống' })
  pushToken: string;
}
