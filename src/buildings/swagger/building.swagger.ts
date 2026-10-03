import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

// Tài liệu Swagger cho endpoint lấy danh sách tất cả Tòa Nhà
export function ApiFindAllBuildingsDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy danh sách tất cả Tòa Nhà',
      description:
        'API công khai trả về danh sách các Tòa Nhà đang hoạt động (ACTIVE) để ứng dụng di động hiển thị cho Cư Dân chọn khi đăng ký',
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy danh sách tòa nhà thành công',
    }),
  );
}

// Tài liệu Swagger cho endpoint tìm kiếm Tòa Nhà gần vị trí GPS
export function ApiFindNearbyBuildingsDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Tìm kiếm Tòa Nhà gần vị trí GPS hiện tại',
      description:
        'API công khai tính toán khoảng cách cầu theo chỉ mục 2dsphere của MongoDB và trả về danh sách tòa nhà gần nhất kèm khoảng cách (mét)',
    }),
    ApiQuery({
      name: 'lat',
      required: true,
      type: Number,
      example: 10.84231,
      description: 'Vĩ độ GPS của thiết bị',
    }),
    ApiQuery({
      name: 'lng',
      required: true,
      type: Number,
      example: 106.84025,
      description: 'Kinh độ GPS của thiết bị',
    }),
    ApiQuery({
      name: 'radius',
      required: false,
      type: Number,
      example: 5000,
      description:
        'Bán kính tìm kiếm tối đa tính bằng mét (mặc định: 5000m = 5km)',
    }),
    ApiResponse({
      status: 200,
      description:
        'Tìm kiếm tòa nhà lân cận thành công (đã sắp xếp từ gần đến xa)',
    }),
    ApiResponse({
      status: 400,
      description: 'Tọa độ lat/lng không hợp lệ',
    }),
  );
}

// Tài liệu Swagger cho endpoint lấy chi tiết một Tòa Nhà
export function ApiFindOneBuildingDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy thông tin chi tiết một Tòa Nhà',
      description:
        'Truy vấn cơ sở dữ liệu lấy thông tin chi tiết đầy đủ của một Tòa Nhà theo mã ObjectId',
    }),
    ApiResponse({
      status: 200,
      description: 'Tìm thấy thông tin tòa nhà',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy tòa nhà',
    }),
  );
}

// Tài liệu Swagger cho endpoint Quản trị viên cấp cao System Admin tạo mới Tòa Nhà
export function ApiCreateBuildingDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Tạo mới một Tòa Nhà',
      description:
        'Dành riêng cho Quản trị viên cấp cao System Admin thêm tòa nhà đối tác mới vào hệ thống Smart Locker',
    }),
    ApiResponse({
      status: 201,
      description: 'Khởi tạo tòa nhà thành công',
    }),
    ApiResponse({
      status: 400,
      description: 'Dữ liệu đầu vào không hợp lệ',
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
      description: 'Mã tòa nhà (code) đã tồn tại trong hệ thống',
    }),
  );
}

// Tài liệu Swagger cho endpoint Ban Quản Lý xem thông tin Tòa Nhà của mình
export function ApiGetMyBuildingDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Ban Quản Lý xem thông tin Tòa Nhà của mình',
      description:
        'Dành cho Quản trị viên Tòa Nhà (BUILDING_ADMIN) xem thông tin chi tiết, STK ngân hàng thụ hưởng và biểu phí hiện hành',
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy thông tin tòa nhà thành công',
    }),
    ApiResponse({
      status: 400,
      description: 'Tài khoản chưa được liên kết với Tòa nhà nào',
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
      status: 404,
      description: 'Không tìm thấy thông tin tòa nhà',
    }),
  );
}

// Tài liệu Swagger cho endpoint Ban Quản Lý cập nhật thông tin và biểu phí Tòa Nhà của mình
export function ApiUpdateMyBuildingDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Ban Quản Lý cập nhật cấu hình Tòa Nhà',
      description:
        'Dành cho Quản trị viên Tòa Nhà (BUILDING_ADMIN) cập nhật hotline, email, STK ngân hàng thụ hưởng VietQR và biểu phí 4 chặng',
    }),
    ApiResponse({
      status: 200,
      description: 'Cập nhật cấu hình tòa nhà thành công',
    }),
    ApiResponse({
      status: 400,
      description: 'Dữ liệu đầu vào hoặc biểu phí không hợp lệ',
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
      status: 404,
      description: 'Không tìm thấy tòa nhà để cập nhật',
    }),
  );
}

// Tài liệu Swagger cho endpoint cập nhật Tòa Nhà theo ID
export function ApiUpdateBuildingDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cập nhật thông tin Tòa Nhà theo mã ID',
      description:
        'System Admin có quyền cập nhật mọi tòa nhà; Building Admin chỉ được cập nhật tòa nhà do mình quản lý',
    }),
    ApiResponse({
      status: 200,
      description: 'Cập nhật thông tin tòa nhà thành công',
    }),
    ApiResponse({
      status: 400,
      description: 'Dữ liệu cập nhật không hợp lệ',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa đăng nhập hoặc JWT Token không hợp lệ',
    }),
    ApiResponse({
      status: 403,
      description:
        'Không có quyền truy cập hoặc cố gắng sửa đổi tòa nhà không thuộc quyền quản lý',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy tòa nhà để cập nhật',
    }),
  );
}

// Tài liệu Swagger cho endpoint Quản trị viên cấp cao System Admin xóa Tòa Nhà
export function ApiRemoveBuildingDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Xóa Tòa Nhà khỏi hệ thống',
      description:
        'Dành riêng cho Quản trị viên cấp cao System Admin xóa tòa nhà (có kiểm tra ràng buộc không có cư dân bên trong)',
    }),
    ApiResponse({
      status: 200,
      description: 'Xóa tòa nhà thành công',
    }),
    ApiResponse({
      status: 400,
      description:
        'Không thể xóa tòa nhà vì đang có cư dân hoặc trạm tủ hoạt động',
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
      status: 404,
      description: 'Không tìm thấy tòa nhà để xóa',
    }),
  );
}
