import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApprovalStatus } from '../enums/approval-status.enum';

// Dữ liệu quản trị viên được phép sửa trên tài khoản người dùng: không gồm vai trò, tòa nhà, email hay mật khẩu
export class UpdateUserByAdminDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString({ message: 'Họ và tên phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Họ và tên tối thiểu 2 ký tự' })
  @MaxLength(100, { message: 'Họ và tên tối đa 100 ký tự' })
  name?: string;

  @ApiPropertyOptional({ example: 'A1204' })
  @IsOptional()
  @IsString({ message: 'Căn hộ phải là chuỗi ký tự' })
  @MaxLength(50, { message: 'Căn hộ tối đa 50 ký tự' })
  apartment?: string;

  @ApiPropertyOptional({
    example: 'Cư dân thuê ngắn hạn',
    description: 'Ghi chú nội bộ, gửi chuỗi rỗng để xóa ghi chú',
  })
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;

  @ApiPropertyOptional({
    enum: [ApprovalStatus.ACTIVE, ApprovalStatus.SUSPENDED],
    description:
      'SUSPENDED để khóa tài khoản, ACTIVE để mở khóa. Duyệt hoặc từ chối hồ sơ vẫn dùng chức năng riêng',
  })
  @IsOptional()
  @IsIn([ApprovalStatus.ACTIVE, ApprovalStatus.SUSPENDED], {
    message: 'Trạng thái chỉ được là ACTIVE hoặc SUSPENDED',
  })
  approvalStatus?: ApprovalStatus.ACTIVE | ApprovalStatus.SUSPENDED;
}

// Tham số tùy chọn khi lấy danh sách người dùng
export class ListUsersQueryDto {
  @ApiPropertyOptional({
    enum: ['packageCount'],
    description: 'Kèm tổng số bưu kiện của từng người dùng',
  })
  @IsOptional()
  @IsIn(['packageCount'], { message: 'include chỉ nhận giá trị packageCount' })
  include?: 'packageCount';
}
