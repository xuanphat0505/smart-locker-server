import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';

// Tài liệu Swagger cho endpoint lấy thông tin trạm tủ qua mã code
export function ApiGetLockerByCodeDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy thông tin chi tiết trạm tủ theo mã Code',
      description:
        'API công khai phục vụ tài xế hoặc cư dân quét mã QR dán trên thân tủ để hiển thị thông tin trạm',
    }),
    ApiParam({
      name: 'code',
      required: true,
      example: 'LK-S101-01',
      description: 'Mã định danh duy nhất của trạm tủ',
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy thông tin trạm tủ thành công',
    }),
    ApiResponse({
      status: 404,
      description: 'Trạm tủ không tồn tại',
    }),
  );
}

// Tài liệu Swagger cho endpoint lấy sơ đồ các ngăn tủ thời gian thực
export function ApiGetLockerBoxesDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy sơ đồ các ngăn tủ thời gian thực',
      description:
        'API công khai trả về danh sách các ngăn tủ (trống/bận, kích thước S/M/L) để hiển thị giao diện 2D cho tài xế chọn ngăn',
    }),
    ApiParam({
      name: 'code',
      required: true,
      example: 'LK-S101-01',
      description: 'Mã định danh duy nhất của trạm tủ',
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy danh sách ngăn tủ thành công',
    }),
    ApiResponse({
      status: 404,
      description: 'Trạm tủ không tồn tại',
    }),
  );
}

// Tài liệu Swagger cho endpoint tra cứu cư dân trước khi mở tủ
export function ApiLookupReceiverDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Tra cứu xác thực Cư Dân theo Số Điện Thoại và Mã Trạm Tủ',
      description:
        'API công khai giúp tài xế đối soát tên và số căn hộ của cư dân trước khi mở tủ bỏ hàng vào',
    }),
    ApiQuery({
      name: 'phone',
      required: true,
      example: '0912345678',
      description: 'Số điện thoại của cư dân nhận hàng',
    }),
    ApiQuery({
      name: 'lockerCode',
      required: true,
      example: 'LK-S101-01',
      description: 'Mã trạm tủ nơi tài xế đang thao tác gửi',
    }),
    ApiResponse({
      status: 200,
      description: 'Cư dân hợp lệ và thuộc tòa nhà',
    }),
    ApiResponse({
      status: 404,
      description:
        'Số điện thoại chưa đăng ký hoặc chưa được duyệt vào tòa nhà này',
    }),
  );
}

// Tài liệu Swagger cho endpoint khởi tạo trạm tủ mới
export function ApiCreateLockerDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Khởi tạo trạm tủ thông minh mới',
      description:
        'Dành riêng cho System Admin khởi tạo trạm tủ, tự động tạo toàn bộ các ngăn tủ con',
    }),
    ApiResponse({
      status: 201,
      description: 'Khởi tạo trạm tủ và các ngăn tủ thành công',
    }),
    ApiResponse({
      status: 409,
      description: 'Mã trạm tủ hoặc địa chỉ MAC đã tồn tại',
    }),
  );
}

// Tài liệu Swagger cho endpoint lấy danh sách tất cả trạm tủ
export function ApiFindAllLockersDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy danh sách tất cả các trạm tủ trong hệ thống',
      description: 'Dành cho Quản trị viên theo dõi mạng lưới trạm tủ',
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy danh sách trạm tủ thành công',
    }),
  );
}
