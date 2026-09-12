import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';

// Tài liệu Swagger cho endpoint Quản trị viên cấp cao System Admin tạo tài khoản Ban Quản Lý Tòa Nhà
export function ApiCreateBuildingAdminDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Khởi tạo tài khoản Ban Quản Lý Tòa Nhà',
      description:
        'Dành riêng cho Quản trị viên cấp cao System Admin tạo tài khoản BQL và liên kết với một Tòa nhà cụ thể',
    }),
    ApiResponse({
      status: 201,
      description: 'Khởi tạo tài khoản Ban Quản Lý thành công',
    }),
    ApiResponse({
      status: 400,
      description:
        'Dữ liệu đầu vào không hợp lệ hoặc mã tòa nhà không đúng định dạng',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa đăng nhập hoặc JWT Token không hợp lệ',
    }),
    ApiResponse({
      status: 403,
      description: 'Không có quyền truy cập (Chỉ dành cho System Admin)',
    }),
    ApiResponse({
      status: 409,
      description: 'Email hoặc Số điện thoại đã tồn tại trên hệ thống',
    }),
  );
}

// Tài liệu Swagger cho endpoint Ban Quản Lý tạo trực tiếp tài khoản Cư Dân
export function ApiCreateResidentByAdminDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Khởi tạo tài khoản Cư Dân trực tiếp',
      description:
        'Dành riêng cho Ban Quản Lý Tòa Nhà tạo sẵn tài khoản cư dân có trạng thái ACTIVE trong chung cư của mình',
    }),
    ApiResponse({
      status: 201,
      description: 'Khởi tạo tài khoản cư dân thành công',
    }),
    ApiResponse({
      status: 400,
      description: 'Tài khoản quản trị chưa được liên kết với Tòa nhà nào',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa đăng nhập hoặc JWT Token không hợp lệ',
    }),
    ApiResponse({
      status: 403,
      description: 'Không có quyền truy cập (Chỉ dành cho Building Admin)',
    }),
    ApiResponse({
      status: 409,
      description: 'Email hoặc Số điện thoại đã tồn tại trên hệ thống',
    }),
  );
}

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
        'Dành riêng cho Ban Quản Lý Tòa Nhà (Building Admin) xem danh sách cư dân có trạng thái PENDING',
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
      description: 'Không có quyền truy cập (Chỉ dành cho Building Admin)',
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
      status: 403,
      description: 'Không có quyền truy cập (Chỉ dành cho Building Admin)',
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
      status: 403,
      description: 'Không có quyền truy cập (Chỉ dành cho Building Admin)',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy hồ sơ cư dân',
    }),
  );
}

// Tài liệu Swagger cho endpoint lấy danh sách người dùng theo phạm vi phân quyền
export function ApiFindAllUsersDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy danh sách người dùng theo phạm vi phân quyền',
      description:
        'System Admin xem toàn bộ người dùng trong hệ thống; Building Admin chỉ xem danh sách cư dân thuộc tòa nhà do mình quản lý',
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
      description:
        'Không có quyền truy cập (Chỉ dành cho System Admin hoặc Building Admin)',
    }),
  );
}

// Tài liệu Swagger cho endpoint lấy chi tiết một người dùng
export function ApiFindOneUserDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy chi tiết người dùng theo ID',
      description:
        'System Admin xem bất kỳ người dùng nào; Building Admin chỉ xem được cư dân thuộc tòa nhà của mình',
    }),
    ApiResponse({ status: 200, description: 'Tìm thấy thông tin người dùng' }),
    ApiResponse({
      status: 401,
      description: 'Chưa xác thực hoặc Token hết hạn',
    }),
    ApiResponse({
      status: 403,
      description: 'Không có quyền truy cập thông tin người dùng này',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy người dùng',
    }),
  );
}

// Tài liệu Swagger cho endpoint xóa người dùng
export function ApiRemoveUserDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Xóa tài khoản người dùng',
      description:
        'System Admin xóa bất kỳ tài khoản nào; Building Admin chỉ được phép xóa tài khoản cư dân thuộc tòa nhà của mình',
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
      description: 'Không có quyền xóa tài khoản người dùng này',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy người dùng để xóa',
    }),
  );
}

// Tài liệu Swagger cho endpoint tải lên và cập nhật ảnh đại diện người dùng
export function ApiUploadAvatarDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Tải lên ảnh đại diện cá nhân',
      description:
        'Người dùng tải lên tệp tin hình ảnh đại diện (jpeg, png, webp tối đa 5MB) để cập nhật ảnh hồ sơ cá nhân',
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'Tệp tin hình ảnh tải lên (định dạng JPG, PNG, WEBP)',
          },
        },
        required: ['file'],
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Cập nhật ảnh đại diện thành công',
    }),
    ApiResponse({
      status: 400,
      description:
        'Tệp tin không đúng định dạng ảnh hoặc vượt quá dung lượng cho phép',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa đăng nhập hoặc Token hết hạn',
    }),
  );
}

// Tài liệu Swagger cho endpoint xóa ảnh đại diện đưa về mặc định
export function ApiRemoveAvatarDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Xóa ảnh đại diện cá nhân',
      description:
        'Xóa ảnh đại diện hiện tại của người dùng và đưa về trạng thái mặc định',
    }),
    ApiResponse({
      status: 200,
      description: 'Xóa ảnh đại diện thành công',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa đăng nhập hoặc Token hết hạn',
    }),
  );
}

// Tài liệu Swagger cho endpoint đổi mật khẩu tài khoản cá nhân
export function ApiChangePasswordDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Đổi mật khẩu tài khoản cá nhân',
      description:
        'Người dùng đang đăng nhập tự thay đổi mật khẩu hiện tại và hủy toàn bộ phiên đăng nhập cũ trên các thiết bị khác',
    }),
    ApiResponse({
      status: 200,
      description: 'Đổi mật khẩu thành công',
    }),
    ApiResponse({
      status: 400,
      description:
        'Mật khẩu hiện tại không chính xác hoặc mật khẩu mới trùng với mật khẩu cũ',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa đăng nhập hoặc JWT Token không hợp lệ',
    }),
  );
}

// Tài liệu Swagger cho endpoint cập nhật mã push token thiết bị di động
export function ApiUpdatePushTokenDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Đăng ký hoặc cập nhật mã push token của thiết bị di động',
      description:
        'Cung cấp mã Expo Push Token để hệ thống gửi thông báo đẩy trực tiếp lên thanh trạng thái và cửa sổ thiết bị',
    }),
    ApiResponse({
      status: 200,
      description: 'Cập nhật mã push token thành công',
    }),
    ApiResponse({
      status: 400,
      description: 'Mã push token không hợp lệ hoặc để trống',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa đăng nhập hoặc JWT Token không hợp lệ',
    }),
  );
}
