import {
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  NotificationCategory,
  NotificationPriority,
} from '../enums/notification.enums';

// DTO tham số truy vấn hộp thư thông báo kèm phân trang và bộ lọc
export class QueryNotificationDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Số trang cần lấy dữ liệu',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    description: 'Số lượng thông báo tối đa trên mỗi trang',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: NotificationCategory,
    description: 'Lọc thông báo theo nhóm lĩnh vực',
  })
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiPropertyOptional({
    enum: NotificationPriority,
    description: 'Lọc thông báo theo mức độ nghiêm trọng',
  })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({
    example: false,
    description: 'Lọc theo trạng thái đã đọc hoặc chưa đọc',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1')
      return true;
    if (value === 'false' || value === false || value === 0 || value === '0')
      return false;
    return undefined;
  })
  @IsBoolean()
  isRead?: boolean;
}
