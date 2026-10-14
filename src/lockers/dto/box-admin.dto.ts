import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { BoxStatus, LockerAction } from '../enums';

// Lý do bắt buộc khi quản trị viên can thiệp vào một ngăn tủ để có thể truy vết sau này
export class UnlockBoxDto {
  @ApiProperty({
    example: 'Cư dân báo kẹt cửa, BQL mở hỗ trợ',
    description: 'Lý do mở khóa từ xa (5 đến 200 ký tự)',
  })
  @IsString({ message: 'Lý do phải là chuỗi ký tự' })
  @MinLength(5, { message: 'Lý do tối thiểu 5 ký tự' })
  @MaxLength(200, { message: 'Lý do tối đa 200 ký tự' })
  reason: string;
}

// Đổi trạng thái ngăn tủ giữa sẵn sàng và bảo trì
export class UpdateBoxStatusDto {
  @ApiProperty({ enum: [BoxStatus.AVAILABLE, BoxStatus.MAINTENANCE] })
  @IsIn([BoxStatus.AVAILABLE, BoxStatus.MAINTENANCE], {
    message: 'Trạng thái chỉ được là AVAILABLE hoặc MAINTENANCE',
  })
  status: BoxStatus.AVAILABLE | BoxStatus.MAINTENANCE;

  @ApiProperty({
    example: 'Chốt khóa kẹt, chờ kỹ thuật',
    description: 'Lý do đổi trạng thái (5 đến 200 ký tự)',
  })
  @IsString({ message: 'Lý do phải là chuỗi ký tự' })
  @MinLength(5, { message: 'Lý do tối thiểu 5 ký tự' })
  @MaxLength(200, { message: 'Lý do tối đa 200 ký tự' })
  reason: string;
}

// Truy vấn lịch sử thao tác của một trạm tủ
export class QueryLockerLogDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Chỉ lấy thao tác của một ngăn' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'boxNumber phải là số nguyên' })
  @Min(1, { message: 'boxNumber tối thiểu là 1' })
  boxNumber?: number;

  @ApiPropertyOptional({ enum: LockerAction })
  @IsOptional()
  @IsEnum(LockerAction, { message: 'Loại thao tác không hợp lệ' })
  action?: LockerAction;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'from phải là thời gian ISO hợp lệ' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString({}, { message: 'to phải là thời gian ISO hợp lệ' })
  to?: string;
}
