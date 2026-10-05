import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

// Tài liệu Swagger cho endpoint kiểm tra phí quá hạn của bưu kiện
export function ApiCheckFeeDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Kiểm tra phí quá hạn và trạng thái gia hạn của bưu kiện',
      description:
        'Tính toán số tiền quá hạn dựa trên chính sách biểu phí lũy thừa của tòa nhà và tổng số tiền đã nộp trước đó',
    }),
    ApiParam({
      name: 'packageId',
      description: 'Mã định danh MongoDB của bưu kiện',
      example: '660e8400f29b4e1234567890',
    }),
    ApiResponse({
      status: 200,
      description: 'Tính toán phí quá hạn thành công',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy bưu kiện',
    }),
  );
}

// Tài liệu Swagger cho endpoint tạo phiên thanh toán VietQR
export function ApiCreatePaymentIntentDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Khởi tạo phiên thanh toán VietQR nộp phạt hoặc gia hạn',
      description:
        'Sinh mã giao dịch duy nhất, tạo ảnh VietQR và chuỗi EMVCo chuyển tiền trực tiếp vào STK Ban Quản Lý tòa nhà',
    }),
    ApiResponse({
      status: 201,
      description: 'Khởi tạo phiên thanh toán VietQR thành công',
    }),
    ApiResponse({
      status: 400,
      description:
        'Bưu kiện chưa quá hạn hoặc tòa nhà chưa cấu hình STK thụ hưởng',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy bưu kiện',
    }),
  );
}

// Tài liệu Swagger cho endpoint webhook tiếp nhận thông báo thanh toán SePay
export function ApiSepayWebhookDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Tiếp nhận webhook thanh toán tự động từ cổng SePay Gateway',
      description:
        'Xác thực Secret Token từ Header Authorization, bóc tách orderCode từ nội dung chuyển khoản, gạch nợ tự động và kích hoạt mở tủ Kiosk hoặc gia hạn đơn hàng',
    }),
    ApiResponse({
      status: 200,
      description: 'Tiếp nhận và xử lý webhook thành công',
    }),
    ApiResponse({
      status: 401,
      description: 'Chữ ký xác thực webhook không hợp lệ',
    }),
  );
}

// Tài liệu Swagger cho endpoint tra cứu trạng thái thanh toán phục vụ Client Auto-Polling
export function ApiGetPaymentStatusDoc() {
  return applyDecorators(
    ApiOperation({
      summary:
        'Tra cứu trạng thái thanh toán phục vụ Auto-Polling từ Mobile App hoặc ESP32',
      description:
        'Endpoint phản hồi nhanh và gọn nhẹ giúp Client định kỳ 2 giây kiểm tra trạng thái PAID để tự động đóng modal hoặc bung cửa tủ',
    }),
    ApiParam({
      name: 'orderCode',
      description: 'Mã số giao dịch thanh toán duy nhất',
      example: 8491823912,
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy trạng thái giao dịch thành công',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy giao dịch với mã orderCode tương ứng',
    }),
  );
}

// Tài liệu Swagger cho endpoint hoàn tất nhận hàng tại Kiosk - chỉ xử lý kích hoạt mở khóa cơ khí
export function ApiKioskPickupDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Hoàn tất nhận hàng tại Kiosk sau khi thanh toán thành công',
      description:
        'ESP32 gọi endpoint này sau khi xác nhận thanh toán PAID. Hệ thống phát lệnh MQTT mở chốt điện 12V và cập nhật trạng thái tủ/đơn hàng.',
    }),
    ApiResponse({
      status: 200,
      description: 'Mở tủ thành công',
    }),
    ApiResponse({
      status: 400,
      description: 'Giao dịch chưa được thanh toán hoặc không tồn tại',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy kiện hàng',
    }),
  );
}

// Tài liệu Swagger cho endpoint xem lịch sử giao dịch thanh toán
export function ApiGetMyPaymentsDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cư dân xem lịch sử các giao dịch thanh toán của mình',
      description:
        'Trả về danh sách các hóa đơn nộp phạt và gia hạn sắp xếp theo thời gian mới nhất',
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy lịch sử thanh toán thành công',
    }),
  );
}

// Tài liệu Swagger cho endpoint tra cứu trạng thái giao dịch thanh toán theo mã orderCode
export function ApiGetPaymentByOrderCodeDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Tra cứu trạng thái và thông tin giao dịch theo mã orderCode',
      description:
        'Dùng cho màn hình Kiosk hoặc ứng dụng di động kiểm tra tiến độ thanh toán của đơn hàng',
    }),
    ApiParam({
      name: 'orderCode',
      description: 'Mã số giao dịch thanh toán duy nhất',
      example: 8491823912,
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy thông tin giao dịch thành công',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy giao dịch với mã orderCode tương ứng',
    }),
  );
}

// Tài liệu Swagger cho endpoint tạo phiên thanh toán đăng ký gói tháng VIP
export function ApiCreateSubscriptionIntentDoc() {
  return applyDecorators(
    ApiOperation({
      summary:
        'Khởi tạo phiên thanh toán VietQR đăng ký gói tháng VIP (30k/tháng)',
      description:
        'Sinh mã giao dịch duy nhất, tạo ảnh VietQR và chuỗi EMVCo chuyển 30.000đ trực tiếp vào STK Ban Quản Lý tòa nhà để kích hoạt gói tháng VIP',
    }),
    ApiResponse({
      status: 201,
      description: 'Khởi tạo phiên thanh toán gói tháng thành công',
    }),
    ApiResponse({
      status: 400,
      description:
        'Cư dân chưa liên kết tòa nhà hoặc tòa nhà chưa cấu hình STK thụ hưởng',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy tòa nhà hoặc người dùng',
    }),
  );
}
