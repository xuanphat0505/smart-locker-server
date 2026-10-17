import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiConsumes,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';

// Tài liệu Swagger cho endpoint tài xế gửi bưu kiện vào ngăn tủ
export function ApiDropOffPackageDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Tài xế bắt đầu gửi bưu kiện vào ngăn tủ (Không cần tài khoản)',
      description:
        'API công khai cho phép tài xế gửi hàng sau khi quét mã QR trạm tủ. Hệ thống giữ chỗ ngăn, phát lệnh mở cửa và tạo kiện ở trạng thái PENDING_DEPOSIT, kèm depositToken (chỉ trả một lần). Kiện chỉ chuyển sang WAITING_FOR_PICKUP và cư dân chỉ được thông báo khi cảm biến xác nhận hàng đã nằm trong ngăn và cửa đã đóng; quá hạn chờ thì tự hủy hoặc xác nhận theo trạng thái cảm biến',
    }),
    ApiResponse({
      status: 201,
      description:
        'Đã giữ chỗ và phát lệnh mở cửa ngăn tủ, chờ cảm biến xác nhận hàng đã được đặt vào',
    }),
    ApiResponse({
      status: 409,
      description:
        'Ngăn vừa được người khác giữ, mã vận đơn đang có kiện, hoặc cảm biến báo ngăn đang có vật',
    }),
    ApiResponse({
      status: 400,
      description: 'Ngăn tủ đã có hàng hoặc không khả dụng',
    }),
    ApiResponse({
      status: 404,
      description: 'Trạm tủ hoặc thông tin cư dân không tồn tại',
    }),
    ApiResponse({
      status: 409,
      description:
        'Mã vận đơn đang có kiện chờ lấy hoặc quá hạn trong cùng tòa nhà, không cho gửi trùng',
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
      summary: 'Nhập mã OTP 6 số tại trạm tủ để nhận hàng hoặc nộp phạt mở tủ',
      description:
        'API công khai phục vụ màn hình cảm ứng hoặc bàn phím tại tủ. Nếu đơn hợp lệ: phát lệnh mở tủ và giải phóng Box. Nếu đơn quá hạn chưa thanh toán: khởi tạo phiên VietQR và trả về requiresPayment: true kèm dữ liệu QR để ESP32 render lên màn hình LCD.',
    }),
    ApiResponse({
      status: 200,
      description:
        'Xác thực OTP thành công (cửa ngăn tủ mở) hoặc yêu cầu nộp phí quá hạn (trả về dữ liệu VietQR)',
    }),
    ApiResponse({
      status: 400,
      description:
        'Mã OTP không đúng, đơn hàng đã được lấy trước đó, hoặc bị khóa tạm thời do nhập sai',
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

// Tài liệu Swagger cho endpoint nhận diện khuôn mặt mở tủ nhận hàng
export function ApiPickupFaceDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Nhận diện khuôn mặt cư dân tại trạm tủ để nhận hàng',
      description:
        'API phục vụ camera tại trạm tủ Kiosk, kiểm tra độ sống khuôn mặt (liveness) và so khớp 1:N với các đơn hàng chờ nhận để phát lệnh mở tủ',
    }),
    ApiConsumes('multipart/form-data', 'application/json'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['lockerCode'],
        properties: {
          lockerCode: {
            type: 'string',
            example: 'LK-S101-01',
            description: 'Mã trạm tủ thông minh',
          },
          file: {
            type: 'string',
            format: 'binary',
            description: 'File ảnh chụp khuôn mặt từ camera trạm tủ',
          },
          imageBase64: {
            type: 'string',
            description: 'Chuỗi Base64 ảnh khuôn mặt nếu không upload file',
          },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Xác thực khuôn mặt thành công, lệnh mở cửa ngăn tủ đã phát',
    }),
    ApiResponse({
      status: 400,
      description: 'Dữ liệu không hợp lệ hoặc thiếu ảnh',
    }),
    ApiResponse({
      status: 401,
      description: 'Khuôn mặt không khớp với cư dân nào có đơn chờ tại tủ',
    }),
    ApiResponse({
      status: 403,
      description: 'Phát hiện giả mạo khuôn mặt màn hình hoặc ảnh in',
    }),
    ApiResponse({
      status: 404,
      description: 'Trạm tủ không tồn tại hoặc không có đơn hàng chờ nhận',
    }),
  );
}

// Tài liệu Swagger cho endpoint gửi mã OTP xác thực SĐT của tài xế
export function ApiSendShipperOtpDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Gửi mã xác thực OTP 6 số tới số điện thoại của tài xế',
      description:
        'API công khai gửi mã OTP 6 số (hiệu lực 3 phút) qua SMS để xác minh SIM chính chủ của tài xế. Mã chỉ được trả về trong trường devOtp khi máy chủ bật SMS_DEV_MODE',
    }),
    ApiResponse({
      status: 200,
      description: 'Đã gửi mã OTP thành công',
    }),
    ApiResponse({
      status: 400,
      description:
        'Số điện thoại không hợp lệ, gửi lại quá nhanh (< 60s) hoặc vượt 5 lần mỗi giờ',
    }),
    ApiResponse({
      status: 502,
      description: 'Cổng gửi SMS không phản hồi hoặc từ chối, mã OTP không được lưu',
    }),
  );
}

// Tài liệu Swagger cho endpoint xác minh mã OTP của tài xế
export function ApiVerifyShipperOtpDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Xác minh mã OTP và cấp phiên tin cậy 60 ngày cho tài xế',
      description:
        'API công khai so khớp mã OTP, khi hợp lệ sẽ cấp sessionToken 60 ngày để gửi hàng liên hoàn',
    }),
    ApiResponse({
      status: 200,
      description: 'Xác thực số điện thoại tài xế thành công',
    }),
    ApiResponse({
      status: 400,
      description: 'Mã OTP không chính xác, đã hết hạn hoặc quá số lần thử',
    }),
  );
}

// Tài liệu Swagger cho endpoint xác minh Google Firebase idToken của tài xế
export function ApiVerifyFirebaseTokenDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Xác minh Google Firebase ID Token và cấp phiên tin cậy 60 ngày',
      description:
        'API công khai giải mã idToken do Google Firebase cấp sau khi tài xế nhận SMS OTP thật thành công',
    }),
    ApiResponse({
      status: 200,
      description: 'Xác thực tài xế thành công qua Google Firebase',
    }),
    ApiResponse({
      status: 400,
      description: 'Token Firebase không chứa số điện thoại hợp lệ',
    }),
    ApiResponse({
      status: 401,
      description: 'Mã Firebase idToken không hợp lệ hoặc đã hết hạn',
    }),
  );
}

// Tài liệu Swagger cho endpoint quản trị viên liệt kê bưu kiện
export function ApiListAdminPackagesDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Danh sách bưu kiện cho quản trị viên',
      description:
        'System Admin xem toàn hệ thống (lọc theo buildingId); Building Admin chỉ xem bưu kiện của tòa mình. Không trả pinCode, qrCodeToken, failedAttempts, lockedUntil. Trả về { data, total, page, limit }',
    }),
    ApiResponse({ status: 200, description: 'Lấy danh sách thành công' }),
    ApiResponse({ status: 400, description: 'Tham số lọc không hợp lệ' }),
    ApiResponse({ status: 401, description: 'Chưa đăng nhập' }),
    ApiResponse({ status: 403, description: 'Không có quyền truy cập' }),
  );
}

// Tài liệu Swagger cho endpoint thu hồi bưu kiện về kho Ban Quản Lý
export function ApiReturnPackageDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Thu hồi bưu kiện về kho Ban Quản Lý',
      description:
        'Chỉ áp dụng cho bưu kiện đang chờ nhận hoặc quá hạn. Đổi trạng thái sang RETURNED, giải phóng ngăn và gửi lệnh mở cửa để lấy hàng ra. Ghi nhật ký thao tác',
    }),
    ApiParam({ name: 'id', description: 'Mã bưu kiện' }),
    ApiResponse({ status: 201, description: 'Thu hồi thành công' }),
    ApiResponse({ status: 403, description: 'Bưu kiện thuộc tòa nhà khác' }),
    ApiResponse({ status: 404, description: 'Không tìm thấy bưu kiện' }),
    ApiResponse({
      status: 409,
      description: 'Bưu kiện không còn ở trạng thái có thể thu hồi',
    }),
  );
}

// Tài liệu Swagger cho endpoint cấp lại mã OTP của bưu kiện
export function ApiResendOtpDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cấp lại mã OTP cho bưu kiện',
      description:
        'Sinh mã OTP mới (vô hiệu mã cũ, đặt lại số lần nhập sai) và gửi cho cư dân qua thông báo. Mã không được trả về cho quản trị viên. Mỗi bưu kiện chỉ cấp lại một lần mỗi 60 giây',
    }),
    ApiParam({ name: 'id', description: 'Mã bưu kiện' }),
    ApiResponse({ status: 201, description: 'Cấp lại OTP thành công' }),
    ApiResponse({ status: 403, description: 'Bưu kiện thuộc tòa nhà khác' }),
    ApiResponse({ status: 404, description: 'Không tìm thấy bưu kiện' }),
    ApiResponse({
      status: 409,
      description: 'Bưu kiện không còn nằm trong ngăn tủ',
    }),
    ApiResponse({ status: 429, description: 'Cấp lại OTP quá thường xuyên' }),
  );
}

// Tài liệu Swagger cho endpoint tài xế tra cứu kết quả lượt gửi hàng
export function ApiGetDepositStatusDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Tài xế tra cứu kết quả lượt gửi hàng bằng mã xác nhận',
      description:
        'Trả trạng thái lượt gửi (PENDING_DEPOSIT, WAITING_FOR_PICKUP, DEPOSIT_CANCELLED) kèm tiến độ cảm biến. Chỉ trả thông tin kiện và OTP khi lượt gửi đã được xác nhận và trong thời gian ngắn sau đó',
    }),
    ApiParam({ name: 'id', description: 'Mã kiện hàng nhận được khi mở tủ' }),
    ApiHeader({
      name: 'x-deposit-token',
      description: 'Mã xác nhận lượt gửi (depositToken) nhận được khi mở tủ',
      required: true,
    }),
    ApiResponse({ status: 200, description: 'Tra cứu thành công' }),
    ApiResponse({ status: 403, description: 'Mã xác nhận không hợp lệ' }),
    ApiResponse({ status: 404, description: 'Kiện hàng không tồn tại' }),
  );
}
