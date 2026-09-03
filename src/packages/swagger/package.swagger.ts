import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

// Tài liệu Swagger cho endpoint tài xế gửi bưu kiện vào ngăn tủ
export function ApiDropOffPackageDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Tài xế gửi bưu kiện vào ngăn tủ (Không cần tài khoản)',
      description:
        'API công khai cho phép tài xế gửi hàng sau khi quét mã QR trạm tủ, hệ thống khóa Box, sinh OTP 6 số và gửi thông báo tới cư dân',
    }),
    ApiResponse({
      status: 201,
      description:
        'Gửi hàng vào tủ thành công, lệnh mở cửa ngăn tủ đã được phát',
    }),
    ApiResponse({
      status: 400,
      description: 'Ngăn tủ đã có hàng hoặc không khả dụng',
    }),
    ApiResponse({
      status: 404,
      description: 'Trạm tủ hoặc thông tin cư dân không tồn tại',
    }),
  );
}

// Tài liệu Swagger cho endpoint cư dân xem danh sách bưu kiện
export function ApiGetMyPackagesDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cư dân xem danh sách bưu kiện của mình',
      description:
        'Yêu cầu Bearer Token của Cư Dân. Trả về danh sách đơn đang chờ lấy và lịch sử nhận',
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy danh sách bưu kiện thành công',
    }),
  );
}

// Tài liệu Swagger cho endpoint xem chi tiết bưu kiện
export function ApiGetPackageByIdDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Xem chi tiết một bưu kiện cụ thể',
      description: 'Yêu cầu Bearer Token của Cư Dân chính chủ sở hữu đơn hàng',
    }),
    ApiParam({
      name: 'id',
      required: true,
      example: '66d01234567890abcdef1234',
      description: 'Mã định danh ID của bưu kiện',
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy chi tiết bưu kiện thành công',
    }),
    ApiResponse({
      status: 404,
      description: 'Bưu kiện không tồn tại',
    }),
  );
}

// Tài liệu Swagger cho endpoint lấy mã QR token mở tủ
export function ApiGetQrTokenDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lấy mã QR Token động phục vụ quét mở tủ',
      description:
        'Trả về mã token bảo mật dùng để render mã QR trên màn hình ứng dụng di động của cư dân',
    }),
    ApiParam({
      name: 'id',
      required: true,
      example: '66d01234567890abcdef1234',
      description: 'Mã định danh ID của bưu kiện',
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy QR Token thành công',
    }),
  );
}

// Tài liệu Swagger cho endpoint nhập OTP mở tủ nhận hàng
export function ApiPickupOtpDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Nhập mã OTP 6 số tại trạm tủ để nhận hàng',
      description:
        'API công khai phục vụ màn hình cảm ứng hoặc bàn phím tại tủ, đổi trạng thái đơn thành PICKED_UP và giải phóng Box',
    }),
    ApiResponse({
      status: 200,
      description: 'Xác thực OTP thành công, lệnh mở cửa ngăn tủ đã phát',
    }),
    ApiResponse({
      status: 400,
      description: 'Mã OTP không đúng hoặc đơn hàng đã được lấy trước đó',
    }),
    ApiResponse({
      status: 404,
      description: 'Trạm tủ không tồn tại',
    }),
  );
}

// Tài liệu Swagger cho endpoint quét QR mở tủ nhận hàng
export function ApiPickupQrDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Quét mã QR trước camera trạm tủ để nhận hàng',
      description:
        'API công khai phục vụ đầu đọc camera tại tủ, giải mã QR Token và kích hoạt mở chốt khóa',
    }),
    ApiResponse({
      status: 200,
      description: 'Quét QR thành công, lệnh mở cửa ngăn tủ đã phát',
    }),
    ApiResponse({
      status: 400,
      description: 'Mã QR không hợp lệ hoặc đơn hàng đã được lấy trước đó',
    }),
    ApiResponse({
      status: 404,
      description: 'Trạm tủ không tồn tại',
    }),
  );
}
