import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsMongoId,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NotificationCategory,
  NotificationPriority,
} from '../enums/notification.enums';

// DTO dành cho Ban Quản Lý phát sóng thông báo toàn bộ cư dân thuộc một tòa nhà
export class BroadcastNotificationDto {
  @ApiProperty({
    example: '6a978676c4f29c7ea2913b13',
    description: 'Mã định danh tòa nhà cần gửi thông báo',
  })
  @IsMongoId()
  @IsNotEmpty()
  buildingId: string;

  @ApiProperty({
    example: 'Bảo trì trạm tủ thông minh sảnh A',
    description: 'Tiêu đề thông báo gửi đến cư dân',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiProperty({
    example:
      'Trạm tủ thông minh sảnh A sẽ tạm dừng hoạt động từ 13h đến 15h chiều nay để nâng cấp firmware.',
    description: 'Nội dung chi tiết thông báo phát sóng',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message: string;

  @ApiPropertyOptional({
    enum: NotificationCategory,
    default: NotificationCategory.SYSTEM,
    description: 'Nhóm lĩnh vực thông báo phát sóng',
  })
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory = NotificationCategory.SYSTEM;

  @ApiPropertyOptional({
    enum: NotificationPriority,
    default: NotificationPriority.NORMAL,
    description: 'Mức độ ưu tiên của thông báo',
  })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority = NotificationPriority.NORMAL;

  @ApiPropertyOptional({
    example: '/announcements/maintenance-schedule',
    description: 'Đường dẫn liên kết chi tiết hoặc hướng dẫn bổ sung',
  })
  @IsOptional()
  @IsString()
  actionUrl?: string;
}
