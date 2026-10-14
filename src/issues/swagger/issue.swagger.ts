import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';

// Tài liệu Swagger cho endpoint tạo phiếu báo lỗi
export function ApiCreateIssueDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Tạo phiếu báo lỗi',
      description:
        'Cư dân, tài xế (có tài khoản) và Ban Quản Lý gửi phiếu. Cư dân và Ban Quản Lý báo trong tòa nhà của mình; tài xế phải truyền lockerCode. Đính kèm tối đa 3 ảnh JPEG/PNG/WebP, mỗi ảnh tối đa 5 MB (trường files). Ban Quản Lý của tòa được thông báo',
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['title', 'description', 'category'],
        properties: {
          title: { type: 'string', example: 'Ngăn số 4 không mở được' },
          description: { type: 'string' },
          category: { type: 'string', enum: ['LOCKER', 'OTP', 'PARCEL', 'APP'] },
          priority: {
            type: 'string',
            enum: ['URGENT', 'HIGH', 'MEDIUM', 'LOW'],
          },
          lockerCode: { type: 'string', example: 'LK-S101-01' },
          files: { type: 'array', items: { type: 'string', format: 'binary' } },
        },
      },
    }),
    ApiResponse({ status: 201, description: 'Tạo phiếu thành công' }),
    ApiResponse({ status: 400, description: 'Dữ liệu hoặc ảnh không hợp lệ' }),
    ApiResponse({ status: 403, description: 'Trạm tủ thuộc tòa nhà khác' }),
    ApiResponse({ status: 404, description: 'Trạm tủ không tồn tại' }),
  );
}

// Tài liệu Swagger cho endpoint liệt kê phiếu báo lỗi
export function ApiListIssuesDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Danh sách phiếu báo lỗi',
      description:
        'System Admin xem toàn hệ thống (lọc theo buildingId); Building Admin chỉ xem phiếu của tòa mình. Mới nhất trước, có phân trang, trả về { data, total, page, limit }',
    }),
    ApiResponse({ status: 200, description: 'Lấy danh sách thành công' }),
    ApiResponse({ status: 403, description: 'Không có quyền truy cập' }),
  );
}

// Tài liệu Swagger cho endpoint xem chi tiết phiếu
export function ApiGetIssueDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Chi tiết phiếu báo lỗi',
      description: 'Kèm ảnh đính kèm và dòng thời gian xử lý',
    }),
    ApiParam({ name: 'id', description: 'Mã phiếu' }),
    ApiResponse({ status: 200, description: 'Lấy chi tiết thành công' }),
    ApiResponse({ status: 403, description: 'Phiếu thuộc tòa nhà khác' }),
    ApiResponse({ status: 404, description: 'Không tìm thấy phiếu' }),
  );
}

// Tài liệu Swagger cho endpoint chuyển trạng thái phiếu
export function ApiUpdateIssueStatusDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Chuyển trạng thái xử lý phiếu',
      description:
        'PENDING → IN_PROGRESS | RESOLVED; IN_PROGRESS → RESOLVED; RESOLVED → CLOSED | IN_PROGRESS; ESCALATED → IN_PROGRESS | RESOLVED (chỉ System Admin). Chuyển sang RESOLVED bắt buộc có ghi chú. Chuyển sang ESCALATED dùng route leo thang',
    }),
    ApiParam({ name: 'id', description: 'Mã phiếu' }),
    ApiResponse({ status: 200, description: 'Cập nhật thành công' }),
    ApiResponse({ status: 400, description: 'Chuyển trạng thái không hợp lệ' }),
    ApiResponse({ status: 403, description: 'Không có quyền xử lý phiếu này' }),
    ApiResponse({ status: 409, description: 'Phiếu vừa được cập nhật bởi người khác' }),
  );
}

// Tài liệu Swagger cho endpoint leo thang phiếu
export function ApiEscalateIssueDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Leo thang phiếu lên Super Admin',
      description:
        'Chỉ Ban Quản Lý của tòa nhà, và chỉ khi phiếu đang PENDING hoặc IN_PROGRESS. System Admin được thông báo',
    }),
    ApiParam({ name: 'id', description: 'Mã phiếu' }),
    ApiResponse({ status: 201, description: 'Leo thang thành công' }),
    ApiResponse({ status: 403, description: 'Phiếu thuộc tòa nhà khác' }),
    ApiResponse({ status: 409, description: 'Phiếu không còn ở trạng thái có thể leo thang' }),
  );
}
