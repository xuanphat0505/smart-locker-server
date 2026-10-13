import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

// Tài liệu Swagger cho endpoint liệt kê nhật ký thao tác
export function ApiListActivityLogsDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Danh sách nhật ký thao tác',
      description:
        'System Admin xem toàn hệ thống (có thể lọc theo buildingId); Building Admin chỉ xem nhật ký của tòa nhà mình. Sắp xếp mới nhất trước, có phân trang',
    }),
    ApiResponse({
      status: 200,
      description: 'Trả về { data, total, page, limit }',
    }),
    ApiResponse({ status: 400, description: 'Tham số lọc không hợp lệ' }),
    ApiResponse({ status: 401, description: 'Chưa đăng nhập' }),
    ApiResponse({ status: 403, description: 'Không có quyền truy cập' }),
  );
}

// Tài liệu Swagger cho endpoint thống kê nhật ký thao tác
export function ApiActivityLogStatsDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Thống kê nhật ký thao tác',
      description:
        'Tổng số bản ghi, số lượng theo trạng thái, theo nhóm nghiệp vụ và theo ngày (múi giờ Asia/Ho_Chi_Minh). Mặc định 30 ngày gần nhất, tối đa 366 ngày',
    }),
    ApiResponse({ status: 200, description: 'Thống kê thành công' }),
    ApiResponse({ status: 400, description: 'Khoảng thời gian không hợp lệ' }),
    ApiResponse({ status: 401, description: 'Chưa đăng nhập' }),
    ApiResponse({ status: 403, description: 'Không có quyền truy cập' }),
  );
}
