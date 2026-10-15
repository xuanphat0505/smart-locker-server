import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ResidentPricingResponseDto } from '../dto/payment.dto';

// Tài liệu Swagger cho endpoint kiểm tra phí quá hạn của bưu kiện
export function ApiCheckFeeDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Kiểm tra phí quá hạn và trạng thái gia hạn của bưu kiện',
      description:
        'Tính toán số tiền quá hạn dựa trên chính sách biểu phí lũy thừa của tòa nhà và tổng số tiền đã nộp trước đó. Chỉ chủ đơn, Ban Quản Lý cùng tòa nhà hoặc System Admin được xem (403 với người khác)',
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
        'Tra cứu trạng thái thanh toán phục vụ Auto-Polling từ Mobile App (yêu cầu JWT của chủ giao dịch, Ban Quản Lý cùng tòa nhà hoặc System Admin; trả 403 với người khác)',
      description:
        'Endpoint phản hồi nhanh và gọn nhẹ giúp Client định kỳ 2 giây kiểm tra trạng thái PAID để tự động đóng modal hoặc bung cửa tủ. Khi cư dân chuyển thiếu tiền, đơn vẫn PENDING và phản hồi kèm receivedAmount (đã nhận) cùng remainingAmount (còn thiếu)',
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
        'ESP32 gọi endpoint này sau khi xác nhận thanh toán PAID, bắt buộc gửi x-api-key và x-locker-code của trạm. Chỉ áp dụng cho giao dịch Kiosk thuộc đúng trạm tủ của thiết bị. Hệ thống phát lệnh MQTT mở chốt điện 12V và cập nhật trạng thái tủ/đơn hàng.',
    }),
    ApiResponse({
      status: 200,
      description: 'Mở tủ thành công',
    }),
    ApiResponse({
      status: 401,
      description: 'Thiếu hoặc sai x-api-key / mã trạm tủ của thiết bị',
    }),
    ApiResponse({
      status: 403,
      description: 'Giao dịch không phải phiên Kiosk thuộc trạm tủ của thiết bị',
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
        'Yêu cầu JWT của chủ giao dịch, Ban Quản Lý cùng tòa nhà hoặc System Admin; trả 403 với người khác. Phản hồi gồm thông tin người nhận và tài khoản thụ hưởng nên không được công khai',
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

// Tài liệu Swagger cho endpoint cư dân xem biểu phí lưu kho của tòa nhà mình
export function ApiGetResidentPricingDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cư dân xem biểu phí lưu kho của tòa nhà mình',
      description:
        'Trả về biểu phí 4 chặng (mốc T1/T2/T3, phụ thu, trần phí) kèm bảng phí từng chặng đã tính sẵn cho gói tháng và khách lẻ. Tòa nhà lấy từ JWT, không chứa thông tin tài khoản ngân hàng',
    }),
    ApiResponse({
      status: 200,
      description: 'Lấy biểu phí thành công',
      type: ResidentPricingResponseDto,
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
      description: 'Không có quyền truy cập (Chỉ dành cho Cư dân)',
    }),
    ApiResponse({
      status: 404,
      description: 'Không tìm thấy thông tin tòa nhà',
    }),
  );
}
