import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

// Tài liệu Swagger cho endpoint lấy thông tin hồ sơ tài khoản cá nhân của người dùng đang đăng nhập
export function ApiGetProfileDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy thông tin tài khoản hiện tại',
      description:
        'Truy vấn cơ sở dữ liệu lấy thông tin chi tiết đầy đủ của người dùng đang đăng nhập từ JWT Token',
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy thông tin hồ sơ tài khoản thành công',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa đăng nhập hoặc JWT Token không hợp lệ',
    }),
  );
}

// Tài liệu Swagger cho endpoint lấy danh sách cư dân chờ duyệt thuộc tòa nhà của Ban Quản Lý
export function ApiGetPendingResidentsDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy danh sách cư dân chờ duyệt thuộc tòa nhà',
      description:
        'Dành cho Ban Quản Lý Tòa Nhà (Building Admin) xem danh sách cư dân có trạng thái PENDING',
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy danh sách cư dân chờ duyệt thành công',
    }),
    ApiResponse({
      status: 400,
      description: 'Tài khoản quản trị chưa được liên kết với Tòa nhà nào',
    }),
    ApiResponse({
      status: 403,
      description:
        'Không có quyền truy cập (Chỉ dành cho Building Admin hoặc System Admin)',
    }),
  );
}

// Tài liệu Swagger cho endpoint Ban Quản Lý phê duyệt hồ sơ cư dân
export function ApiApproveResidentDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Phê duyệt hồ sơ cư dân chuyển sang ACTIVE',
      description:
        'Ban Quản Lý Tòa Nhà duyệt tài khoản cư dân để kích hoạt quyền nhận bưu kiện qua tủ locker',
    }),
    ApiResponse({
      status: 200,
      description: 'Phê duyệt tài khoản cư dân thành công',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy hồ sơ cư dân',
    }),
  );
}

// Tài liệu Swagger cho endpoint Ban Quản Lý từ chối hồ sơ cư dân kèm lý do
export function ApiRejectResidentDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Từ chối hồ sơ cư dân kèm lý do',
      description:
        'Ban Quản Lý Tòa Nhà từ chối hồ sơ cư dân và cập nhật lý do từ chối vào hệ thống',
    }),
    ApiResponse({
      status: 200,
      description: 'Từ chối hồ sơ cư dân thành công',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy hồ sơ cư dân',
    }),
  );
}

// Tài liệu Swagger cho endpoint lấy danh sách tất cả người dùng
export function ApiFindAllUsersDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy danh sách tất cả người dùng',
      description:
        'Trả về danh sách tất cả tài khoản trong hệ thống ngoại trừ mật khẩu (Dành riêng cho Quản trị viên cấp cao System Admin)',
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy danh sách người dùng thành công',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa đăng nhập hoặc JWT Token không hợp lệ',
    }),
    ApiResponse({
      status: 403,
      description: 'Không có quyền truy cập (Chỉ dành cho System Admin)',
    }),
  );
}

// Tài liệu Swagger cho endpoint lấy chi tiết một người dùng
export function ApiFindOneUserDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy chi tiết người dùng theo ID',
      description:
        'Trả về thông tin chi tiết của một tài khoản theo mã định danh ObjectId',
    }),
    ApiResponse({ status: 200, description: 'Tìm thấy thông tin người dùng' }),
    ApiResponse({
      status: 401,
      description: 'Chưa xác thực hoặc Token hết hạn',
    }),
    ApiResponse({
      status: 403,
      description:
        'Không có quyền truy cập (Dành cho System Admin hoặc Building Admin)',
    }),
  );
}

// Tài liệu Swagger cho endpoint xóa người dùng
export function ApiRemoveUserDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Xóa tài khoản người dùng',
      description:
        'Xóa vĩnh viễn tài khoản người dùng khỏi cơ sở dữ liệu theo mã định danh',
    }),
    ApiResponse({
      status: 200,
      description: 'Xóa tài khoản người dùng thành công',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa xác thực hoặc Token hết hạn',
    }),
    ApiResponse({
      status: 403,
      description: 'Không có quyền truy cập (Chỉ dành cho System Admin)',
    }),
  );
}
