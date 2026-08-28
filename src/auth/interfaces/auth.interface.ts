import { Role } from '../enums/role.enum';

// Cấu trúc payload chứa trong JWT Token
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

// Cấu trúc đối tượng user an toàn đã loại bỏ mật khẩu
export interface SanitizedUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: Date;
  updatedAt?: Date;
}

// Cấu trúc thông tin user được gắn vào req.user sau khi giải mã JWT Token
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
}

// Cấu trúc dữ liệu trả về khi người dùng đăng nhập thành công
export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  };
}
