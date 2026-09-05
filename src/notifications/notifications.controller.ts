import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { QueryNotificationDto, BroadcastNotificationDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import type { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  ApiGetMyNotificationsDoc,
  ApiGetUnreadCountDoc,
  ApiMarkAsReadDoc,
  ApiMarkAllAsReadDoc,
  ApiDeleteNotificationDoc,
  ApiBroadcastNotificationDoc,
} from './swagger/notification.swagger';

// Controller xử lý toàn bộ các API hộp thư thông báo của cư dân và quản trị viên
@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // Lấy danh sách thông báo của người dùng hiện tại kèm phân trang và bộ lọc
  @Get()
  @ApiGetMyNotificationsDoc()
  async getMyNotifications(
    @Request() req: { user: AuthenticatedUser },
    @Query() query: QueryNotificationDto,
  ) {
    return this.notificationsService.getMyNotifications(req.user.userId, query);
  }

  // Lấy số lượng thông báo chưa đọc phục vụ hiển thị chấm đỏ trên Header
  @Get('unread-count')
  @ApiGetUnreadCountDoc()
  async getUnreadCount(@Request() req: { user: AuthenticatedUser }) {
    return this.notificationsService.getUnreadCount(req.user.userId);
  }

  // Đánh dấu một thông báo cụ thể là đã đọc
  @Patch(':id/read')
  @ApiMarkAsReadDoc()
  async markAsRead(
    @Request() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(req.user.userId, id);
  }

  // Đánh dấu tất cả thông báo của người dùng là đã đọc
  @Patch('read-all')
  @ApiMarkAllAsReadDoc()
  async markAllAsRead(@Request() req: { user: AuthenticatedUser }) {
    return this.notificationsService.markAllAsRead(req.user.userId);
  }

  // Xóa một thông báo khỏi hộp thư
  @Delete(':id')
  @ApiDeleteNotificationDoc()
  async deleteNotification(
    @Request() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.notificationsService.deleteNotification(req.user.userId, id);
  }

  // Ban Quản Lý phát sóng thông báo toàn bộ cư dân trong tòa nhà
  @Post('broadcast')
  @Roles(Role.BUILDING_ADMIN, Role.SYSTEM_ADMIN)
  @ApiBroadcastNotificationDoc()
  async broadcastToBuilding(
    @Request() req: { user: AuthenticatedUser },
    @Body() dto: BroadcastNotificationDto,
  ) {
    return this.notificationsService.broadcastToBuilding(req.user.userId, dto);
  }
}
