import { Role } from '../enums/role.enum';
import { ApprovalStatus } from '../../users/enums/approval-status.enum';

// Cấu trúc payload chứa trong JWT Token
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  buildingId?: string;
  approvalStatus?: ApprovalStatus;
  iat?: number;
  exp?: number;
}

// Cấu trúc đối tượng user an toàn đã loại bỏ mật khẩu
export interface SanitizedUser {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  buildingId?: string;
  apartment?: string;
  approvalStatus: ApprovalStatus;
  carrierName?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Cấu trúc thông tin user được gắn vào req.user sau khi giải mã JWT Token
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
  buildingId?: string;
  approvalStatus?: ApprovalStatus;
}

// Cấu trúc dữ liệu trả về khi làm mới token thành công
export interface TokensResponse {
  accessToken: string;
  refreshToken: string;
}

// Cấu trúc dữ liệu trả về khi người dùng đăng ký tài khoản thành công
export interface RegisterResponse {
  message: string;
  user: SanitizedUser;
}

// Cấu trúc dữ liệu trả về khi người dùng đăng nhập thành công
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    phone: string;
    role: Role;
    buildingId?: string;
    apartment?: string;
    approvalStatus: ApprovalStatus;
    carrierName?: string;
  };
}
