import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  IssueCategory,
  IssuePriority,
  IssueStatus,
} from '../enums/issue.enums';

// Dữ liệu tạo phiếu báo lỗi; gửi dạng multipart nếu có ảnh đính kèm (trường files, tối đa 3 ảnh)
export class CreateIssueDto {
  @ApiProperty({ example: 'Ngăn số 4 không mở được' })
  @IsString({ message: 'Tiêu đề phải là chuỗi ký tự' })
  @MinLength(5, { message: 'Tiêu đề tối thiểu 5 ký tự' })
  @MaxLength(120, { message: 'Tiêu đề tối đa 120 ký tự' })
  title: string;

  @ApiProperty({ example: 'Nhập đúng OTP nhưng cửa không bật, đèn trên ngăn nhấp nháy đỏ' })
  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  @MinLength(10, { message: 'Mô tả tối thiểu 10 ký tự' })
  @MaxLength(2000, { message: 'Mô tả tối đa 2000 ký tự' })
  description: string;

  @ApiProperty({ enum: IssueCategory })
  @IsEnum(IssueCategory, { message: 'Nhóm vấn đề không hợp lệ' })
  category: IssueCategory;

  @ApiPropertyOptional({ enum: IssuePriority, default: IssuePriority.MEDIUM })
  @IsOptional()
  @IsEnum(IssuePriority, { message: 'Mức ưu tiên không hợp lệ' })
  priority?: IssuePriority;

  @ApiPropertyOptional({
    example: 'LK-S101-01',
    description:
      'Mã trạm tủ liên quan. Bắt buộc với tài xế vì tài khoản tài xế không thuộc tòa nhà nào',
  })
  @IsOptional()
  @IsString({ message: 'Mã trạm tủ phải là chuỗi ký tự' })
  @MaxLength(50)
  lockerCode?: string;
}

// Truy vấn danh sách phiếu báo lỗi
export class QueryIssuesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: IssueStatus })
  @IsOptional()
  @IsEnum(IssueStatus, { message: 'Trạng thái không hợp lệ' })
  status?: IssueStatus;

  @ApiPropertyOptional({ enum: IssuePriority })
  @IsOptional()
  @IsEnum(IssuePriority, { message: 'Mức ưu tiên không hợp lệ' })
  priority?: IssuePriority;

  @ApiPropertyOptional({ enum: IssueCategory })
  @IsOptional()
  @IsEnum(IssueCategory, { message: 'Nhóm vấn đề không hợp lệ' })
  category?: IssueCategory;

  @ApiPropertyOptional({ description: 'Mã trạm tủ' })
  @IsOptional()
  @IsMongoId({ message: 'Mã trạm tủ không hợp lệ' })
  lockerId?: string;

  @ApiPropertyOptional({
    description:
      'Mã tòa nhà (chỉ System Admin; Building Admin luôn bị ép về tòa của mình)',
  })
  @IsOptional()
  @IsMongoId({ message: 'Mã tòa nhà không hợp lệ' })
  buildingId?: string;

  @ApiPropertyOptional({
    description: 'Từ khóa theo mã phiếu, tiêu đề, tên hoặc SĐT người báo',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;
}

// Cập nhật trạng thái xử lý phiếu; chuyển sang ESCALATED đi qua route leo thang riêng
export class UpdateIssueStatusDto {
  @ApiProperty({
    enum: [
      IssueStatus.IN_PROGRESS,
      IssueStatus.RESOLVED,
      IssueStatus.CLOSED,
    ],
  })
  @IsEnum(IssueStatus, { message: 'Trạng thái không hợp lệ' })
  status: IssueStatus;

  @ApiPropertyOptional({
    description: 'Ghi chú xử lý. Bắt buộc khi chuyển sang RESOLVED',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}

// Ghi chú khi Ban Quản Lý chuyển phiếu lên Super Admin
export class EscalateIssueDto {
  @ApiPropertyOptional({ example: 'Cần kỹ thuật phần cứng hỗ trợ' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}
