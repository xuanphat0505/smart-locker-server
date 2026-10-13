import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  ACTIVITY_ACTOR_ROLES,
  ActivityCategory,
  ActivityStatus,
} from '../enums/activity-log.enums';
import type { ActivityActorRole } from '../enums/activity-log.enums';

// Truy vấn danh sách nhật ký thao tác có phân trang
export class QueryActivityLogDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ActivityCategory })
  @IsOptional()
  @IsEnum(ActivityCategory, { message: 'Nhóm nhật ký không hợp lệ' })
  category?: ActivityCategory;

  @ApiPropertyOptional({ enum: ActivityStatus })
  @IsOptional()
  @IsEnum(ActivityStatus, { message: 'Trạng thái nhật ký không hợp lệ' })
  status?: ActivityStatus;

  @ApiPropertyOptional({ enum: ACTIVITY_ACTOR_ROLES })
  @IsOptional()
  @IsIn(ACTIVITY_ACTOR_ROLES, {
    message: 'Vai trò người thực hiện không hợp lệ',
  })
  actorRole?: ActivityActorRole;

  @ApiPropertyOptional({ description: 'Mã người thực hiện' })
  @IsOptional()
  @IsMongoId({ message: 'Mã người thực hiện không hợp lệ' })
  actorId?: string;

  @ApiPropertyOptional({
    description:
      'Mã tòa nhà (chỉ System Admin; Building Admin luôn bị ép về tòa của mình)',
  })
  @IsOptional()
  @IsMongoId({ message: 'Mã tòa nhà không hợp lệ' })
  buildingId?: string;

  @ApiPropertyOptional({
    description: 'Từ khóa theo tên, SĐT người thực hiện, tiêu đề hoặc đối tượng',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'from phải là thời gian ISO hợp lệ' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString({}, { message: 'to phải là thời gian ISO hợp lệ' })
  to?: string;
}

// Truy vấn thống kê nhật ký dùng cùng bộ lọc nhưng không phân trang
export class ActivityLogStatsQueryDto extends OmitType(QueryActivityLogDto, [
  'page',
  'limit',
] as const) {}
