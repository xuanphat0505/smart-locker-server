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

// Tài liệu Swagger cho endpoint cập nhật thông tin và tọa độ trạm tủ
export function ApiUpdateLockerDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cập nhật thông tin và tọa độ vị trí trạm tủ',
      description:
        'Cho phép cập nhật tên, vị trí mô tả, trạng thái và tọa độ GPS. Building Admin chỉ được sửa trạm tủ thuộc tòa nhà của mình',
    }),
    ApiParam({
      name: 'id',
      required: true,
      example: 'LK-S101-01',
      description: 'ObjectId hoặc mã Code của trạm tủ',
    }),
    ApiResponse({ status: 200, description: 'Cập nhật thành công' }),
    ApiResponse({
      status: 403,
      description: 'Trạm tủ thuộc tòa nhà khác, không đủ quyền chỉnh sửa',
    }),
    ApiResponse({ status: 404, description: 'Trạm tủ không tồn tại' }),
  );
}

// Tài liệu Swagger cho endpoint quản trị viên xem ngăn tủ kèm bưu kiện
export function ApiGetBoxesForAdminDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Danh sách ngăn tủ kèm bưu kiện cho quản trị viên',
      description:
        'Trả về từng ngăn cùng bưu kiện đang nằm trong ngăn (mã vận đơn, người nhận, thời điểm gửi). Không trả OTP hay mã QR. Building Admin chỉ xem trạm của tòa mình',
    }),
    ApiParam({ name: 'code', example: 'LK-S101-01', description: 'Mã trạm tủ' }),
    ApiResponse({ status: 200, description: 'Lấy danh sách ngăn thành công' }),
    ApiResponse({ status: 403, description: 'Trạm tủ thuộc tòa nhà khác' }),
    ApiResponse({ status: 404, description: 'Trạm tủ không tồn tại' }),
  );
}

// Tài liệu Swagger cho endpoint đổi trạng thái ngăn tủ
export function ApiUpdateBoxStatusDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Chuyển ngăn tủ sang bảo trì hoặc sẵn sàng',
      description:
        'Chỉ đổi giữa AVAILABLE và MAINTENANCE, bắt buộc có lý do. Từ chối khi ngăn đang chứa bưu kiện',
    }),
    ApiParam({ name: 'code', example: 'LK-S101-01', description: 'Mã trạm tủ' }),
    ApiParam({ name: 'boxNumber', example: 4, description: 'Số ngăn tủ' }),
    ApiResponse({ status: 200, description: 'Đổi trạng thái thành công' }),
    ApiResponse({ status: 403, description: 'Trạm tủ thuộc tòa nhà khác' }),
    ApiResponse({ status: 404, description: 'Trạm tủ hoặc ngăn không tồn tại' }),
    ApiResponse({ status: 409, description: 'Ngăn đang chứa bưu kiện' }),
  );
}

// Tài liệu Swagger cho endpoint mở khóa ngăn tủ từ xa
export function ApiUnlockBoxDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Mở khóa ngăn tủ từ xa',
      description:
        'Gửi lệnh mở cửa qua MQTT, bắt buộc có lý do và được ghi nhật ký. Chỉ mở cửa vật lý, không đổi trạng thái bưu kiện hay ngăn. Từ chối khi trạm ngoại tuyến để lệnh không bị thực thi muộn; chặn gọi lặp trong 10 giây',
    }),
    ApiParam({ name: 'code', example: 'LK-S101-01', description: 'Mã trạm tủ' }),
    ApiParam({ name: 'boxNumber', example: 4, description: 'Số ngăn tủ' }),
    ApiResponse({ status: 201, description: 'Đã gửi lệnh mở khóa' }),
    ApiResponse({ status: 403, description: 'Trạm tủ thuộc tòa nhà khác' }),
    ApiResponse({ status: 404, description: 'Trạm tủ hoặc ngăn không tồn tại' }),
    ApiResponse({ status: 429, description: 'Vừa có lệnh mở khóa cho ngăn này' }),
    ApiResponse({ status: 502, description: 'Không gửi được lệnh tới trạm tủ' }),
    ApiResponse({ status: 503, description: 'Trạm tủ đang ngoại tuyến' }),
  );
}

// Tài liệu Swagger cho endpoint lịch sử thao tác của trạm tủ
export function ApiGetLockerLogsDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Lịch sử thao tác của trạm tủ',
      description:
        'Đọc từ nhật ký phần cứng LockerLog, mới nhất trước, có phân trang. Lọc theo ngăn, loại thao tác và khoảng thời gian',
    }),
    ApiParam({ name: 'code', example: 'LK-S101-01', description: 'Mã trạm tủ' }),
    ApiResponse({ status: 200, description: 'Trả về { data, total, page, limit }' }),
    ApiResponse({ status: 403, description: 'Trạm tủ thuộc tòa nhà khác' }),
    ApiResponse({ status: 404, description: 'Trạm tủ không tồn tại' }),
  );
}
