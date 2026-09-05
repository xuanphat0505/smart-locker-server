import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import {
  NotificationCategory,
  NotificationPriority,
} from '../enums/notification.enums';

// Tài liệu Swagger cho endpoint lấy danh sách thông báo của người dùng
export function ApiGetMyNotificationsDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy danh sách thông báo của tôi (Hộp thư)',
      description:
        'Yêu cầu Bearer Token. Trả về danh sách thông báo phân trang, có thể lọc theo nhóm lĩnh vực (category), mức độ nghiêm trọng (priority) và trạng thái đã đọc (isRead).',
    }),
    ApiQuery({
      name: 'page',
      required: false,
      example: 1,
      description: 'Số trang cần xem',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      example: 20,
      description: 'Số thông báo mỗi trang',
    }),
    ApiQuery({
      name: 'category',
      required: false,
      enum: NotificationCategory,
      description: 'Lọc theo lĩnh vực thông báo',
    }),
    ApiQuery({
      name: 'priority',
      required: false,
      enum: NotificationPriority,
      description: 'Lọc theo mức độ ưu tiên',
    }),
    ApiQuery({
      name: 'isRead',
      required: false,
      type: Boolean,
      description: 'Lọc theo trạng thái đã đọc',
    }),
    ApiResponse({
      status: 200,
      description:
        'Lấy danh sách thông báo thành công kèm thông tin phân trang và số chưa đọc',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa xác thực hoặc token hết hạn',
    }),
  );
}

// Tài liệu Swagger cho endpoint đếm số thông báo chưa đọc
export function ApiGetUnreadCountDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy số lượng thông báo chưa đọc',
      description:
        'Yêu cầu Bearer Token. Phục vụ hiển thị huy hiệu badge số đỏ trên biểu tượng chuông thông báo ở Header.',
    }),
    ApiResponse({
      status: 200,
      description: 'Đếm số lượng chưa đọc thành công',
      schema: {
        example: {
          unreadCount: 3,
        },
      },
    }),
  );
}

// Tài liệu Swagger cho endpoint đánh dấu 1 thông báo là đã đọc
export function ApiMarkAsReadDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Đánh dấu một thông báo là đã đọc',
      description:
        'Yêu cầu Bearer Token của chính chủ sở hữu thông báo. Cập nhật isRead: true và readAt: Date.',
    }),
    ApiParam({
      name: 'id',
      required: true,
      example: '66d01234567890abcdef1234',
      description: 'Mã định danh của thông báo',
    }),
    ApiResponse({
      status: 200,
      description: 'Đánh dấu đã đọc thành công',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy thông báo hoặc bạn không có quyền thao tác',
    }),
  );
}

// Tài liệu Swagger cho endpoint đánh dấu tất cả thông báo là đã đọc
export function ApiMarkAllAsReadDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Đánh dấu tất cả thông báo là đã đọc',
      description:
        'Yêu cầu Bearer Token. Cập nhật toàn bộ thông báo chưa đọc của người dùng thành đã đọc.',
    }),
    ApiResponse({
      status: 200,
      description: 'Đánh dấu tất cả đã đọc thành công',
      schema: {
        example: {
          modifiedCount: 5,
        },
      },
    }),
  );
}

// Tài liệu Swagger cho endpoint xóa 1 thông báo
export function ApiDeleteNotificationDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Xóa một thông báo khỏi hộp thư',
      description:
        'Yêu cầu Bearer Token của chính chủ sở hữu thông báo. Xóa vĩnh viễn bản ghi khỏi database.',
    }),
    ApiParam({
      name: 'id',
      required: true,
      example: '66d01234567890abcdef1234',
      description: 'Mã định danh của thông báo cần xóa',
    }),
    ApiResponse({
      status: 200,
      description: 'Xóa thông báo thành công',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy thông báo hoặc bạn không có quyền xóa',
    }),
  );
}

// Tài liệu Swagger cho endpoint Ban Quản Lý phát sóng thông báo toàn tòa nhà
export function ApiBroadcastNotificationDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Ban Quản Lý phát sóng thông báo toàn bộ cư dân trong tòa nhà',
      description:
        'Chỉ dành cho BUILDING_ADMIN hoặc SYSTEM_ADMIN. Tạo thông báo hàng loạt cho toàn bộ cư dân thuộc tòa nhà và phát sự kiện realtime qua Socket.IO.',
    }),
    ApiResponse({
      status: 201,
      description: 'Phát sóng thông báo tòa nhà thành công',
      schema: {
        example: {
          message: 'Đã gửi thông báo thành công tới 48 cư dân trong tòa nhà',
          sentCount: 48,
        },
      },
    }),
    ApiResponse({
      status: 403,
      description: 'Không có quyền thực hiện chức năng này',
    }),
  );
}
