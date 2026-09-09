import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  TwoFactorTurnOnDto,
  TwoFactorTurnOffDto,
  TwoFactorAuthenticateDto,
} from '../dto';

// Tài liệu Swagger cho endpoint đăng ký Cư Dân
export function ApiRegisterResidentDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Đăng ký tài khoản Cư Dân (Resident)',
      description:
        'Tạo tài khoản cư dân thuộc một tòa nhà cụ thể, mặc định ở trạng thái PENDING chờ Ban Quản Lý phê duyệt',
    }),
    ApiResponse({
      status: 201,
      description:
        'Đăng ký tài khoản thành công, vui lòng đăng nhập để nhận token',
    }),
    ApiResponse({
      status: 409,
      description: 'Email hoặc Số điện thoại đã được đăng ký',
    }),
  );
}

// Tài liệu Swagger cho endpoint đăng ký Tài Xế Giao Hàng
export function ApiRegisterShipperDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Đăng ký tài khoản Tài Xế Giao Hàng (Shipper)',
      description:
        'Tạo tài khoản tài xế gắn liền với đơn vị vận chuyển, trạng thái kích hoạt ACTIVE ngay lập tức',
    }),
    ApiResponse({
      status: 201,
      description:
        'Đăng ký tài xế thành công, vui lòng đăng nhập để nhận token',
    }),
    ApiResponse({
      status: 409,
      description: 'Email hoặc Số điện thoại đã được đăng ký',
    }),
  );
}

// Tài liệu Swagger cho endpoint đăng nhập hệ thống
export function ApiLoginDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Đăng nhập hệ thống bằng Email và Mật khẩu',
      description:
        'Xác thực tài khoản qua LocalStrategy và trả về cặp mã JWT Access Token và Refresh Token',
    }),
    ApiBody({ type: LoginDto }),
    ApiResponse({
      status: 200,
      description: 'Đăng nhập thành công và nhận cặp token',
    }),
    ApiResponse({
      status: 401,
      description: 'Email hoặc Mật khẩu không chính xác',
    }),
  );
}

// Tài liệu Swagger cho endpoint làm mới token
export function ApiRefreshTokenDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cấp lại Access Token mới qua Refresh Token',
      description:
        'Nhận Refresh Token hợp lệ, kiểm tra mã băm bảo mật và trả về cặp Access Token và Refresh Token mới',
    }),
    ApiBody({ type: RefreshTokenDto }),
    ApiResponse({
      status: 200,
      description: 'Cấp mới cặp token thành công',
    }),
    ApiResponse({
      status: 401,
      description: 'Refresh Token không hợp lệ, hết hạn hoặc đã bị thu hồi',
    }),
  );
}

// Tài liệu Swagger cho endpoint đăng xuất
export function ApiLogoutDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Đăng xuất tài khoản',
      description:
        'Hủy bỏ phiên đăng nhập và xóa mã băm Refresh Token trong cơ sở dữ liệu',
    }),
    ApiResponse({
      status: 200,
      description: 'Đăng xuất tài khoản thành công',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa xác thực hoặc token không hợp lệ',
    }),
  );
}

// Tài liệu Swagger cho endpoint yêu cầu gửi liên kết đặt lại mật khẩu
export function ApiForgotPasswordDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Yêu cầu gửi liên kết đặt lại mật khẩu qua email',
      description:
        'Người dùng cung cấp email để nhận liên kết chứa mã token bảo mật phục vụ đặt lại mật khẩu',
    }),
    ApiBody({ type: ForgotPasswordDto }),
    ApiResponse({
      status: 200,
      description:
        'Nếu email tồn tại trên hệ thống, liên kết đặt lại mật khẩu đã được gửi đến hộp thư',
    }),
    ApiResponse({
      status: 400,
      description:
        'Yêu cầu gửi quá nhanh (cooldown 60 giây) hoặc email không hợp lệ',
    }),
  );
}

// Tài liệu Swagger cho endpoint đặt lại mật khẩu mới bằng mã OTP
export function ApiResetPasswordDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Đặt lại mật khẩu mới thông qua mã xác thực OTP',
      description:
        'Xác thực mã OTP 6 chữ số gửi qua email và cập nhật mật khẩu mới cho tài khoản, đồng thời hủy các phiên đăng nhập cũ',
    }),
    ApiBody({ type: ResetPasswordDto }),
    ApiResponse({
      status: 200,
      description: 'Đặt lại mật khẩu thành công',
    }),
    ApiResponse({
      status: 400,
      description:
        'Mã OTP không hợp lệ, đã hết hạn hoặc mật khẩu không đạt yêu cầu bảo mật',
    }),
  );
}

// Tài liệu Swagger cho endpoint khởi tạo khóa bí mật 2FA TOTP và mã QR
export function Api2faGenerateDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Khởi tạo khóa bí mật 2FA TOTP và mã QR',
      description:
        'Sinh chuỗi Base32 secret và mã QR Data URL để người dùng quét vào Google Authenticator hoặc ứng dụng TOTP tương thích',
    }),
    ApiResponse({
      status: 200,
      description: 'Khởi tạo khóa bí mật và mã QR thành công',
    }),
    ApiResponse({
      status: 400,
      description: 'Tài khoản đã kích hoạt 2FA trước đó',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa xác thực hoặc token không hợp lệ',
    }),
  );
}

// Tài liệu Swagger cho endpoint kích hoạt xác thực hai bước TOTP
export function Api2faTurnOnDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Kích hoạt xác thực hai bước 2FA TOTP',
      description:
        'Xác minh mã 6 chữ số từ ứng dụng Authenticator, kích hoạt 2FA và trả về danh sách 8 mã khôi phục dự phòng',
    }),
    ApiBody({ type: TwoFactorTurnOnDto }),
    ApiResponse({
      status: 200,
      description: 'Kích hoạt xác thực hai bước thành công kèm 8 mã khôi phục',
    }),
    ApiResponse({
      status: 400,
      description:
        'Mã xác thực không hợp lệ, hết hạn hoặc chưa khởi tạo mã bí mật',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa xác thực hoặc token không hợp lệ',
    }),
  );
}

// Tài liệu Swagger cho endpoint vô hiệu hóa xác thực hai bước TOTP
export function Api2faTurnOffDoc() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Vô hiệu hóa xác thực hai bước 2FA TOTP',
      description:
        'Yêu cầu nhập mật khẩu tài khoản và mã OTP hiện tại để xác minh danh tính trước khi tắt 2FA',
    }),
    ApiBody({ type: TwoFactorTurnOffDto }),
    ApiResponse({
      status: 200,
      description: 'Vô hiệu hóa xác thực hai bước thành công',
    }),
    ApiResponse({
      status: 400,
      description: 'Mật khẩu hoặc mã xác thực không chính xác',
    }),
    ApiResponse({
      status: 401,
      description: 'Chưa xác thực hoặc token không hợp lệ',
    }),
  );
}

// Tài liệu Swagger cho endpoint xác thực bước thứ hai khi đăng nhập
export function Api2faAuthenticateDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Xác thực bước 2 bằng mã TOTP hoặc mã khôi phục khi đăng nhập',
      description:
        'Gửi mã tempToken nhận được sau bước nhập email/password cùng mã 6 số TOTP hoặc mã recovery code để hoàn tất đăng nhập',
    }),
    ApiBody({ type: TwoFactorAuthenticateDto }),
    ApiResponse({
      status: 200,
      description:
        'Xác thực hai bước thành công, phát hành Access Token và Refresh Token',
    }),
    ApiResponse({
      status: 400,
      description: 'Mã xác thực hoặc mã khôi phục không chính xác',
    }),
    ApiResponse({
      status: 401,
      description: 'Phiên đăng nhập tạm thời hết hạn hoặc không hợp lệ',
    }),
  );
}
