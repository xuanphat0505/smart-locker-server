import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';

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
