import { Role } from '../enums/role.enum';
import { ApprovalStatus } from '../../users/enums/approval-status.enum';
import { UserProfileResponseDto } from '../../users/dto/user.dto';

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
  buildingName?: string;
  apartment?: string;
  approvalStatus: ApprovalStatus;
  avatar?: string;
  twoFactorAuth?: {
    enabled: boolean;
  };
  faceAuth?: {
    enabled: boolean;
    enrolledAt?: Date;
  };
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

// Cấu trúc dữ liệu trả về khi người dùng đăng nhập thành công hoàn tất
export interface SuccessLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfileResponseDto;
}

// Cấu trúc dữ liệu yêu cầu xác thực hai bước trong quá trình đăng nhập
export interface Require2FAResponse {
  require2FA: true;
  tempToken: string;
  twoFactorMethod: 'TOTP';
}

// Cấu trúc dữ liệu trả về từ hàm login (đăng nhập trực tiếp hoặc chuyển tiếp sang 2FA)
export type LoginResponse = SuccessLoginResponse | Require2FAResponse;

// Cấu trúc dữ liệu trả về khi khởi tạo mã QR và secret xác thực 2 bước
export interface TwoFactorGenerateResponse {
  qrCodeDataUrl: string;
  secret: string;
  otpauthUri?: string;
}

// Cấu trúc dữ liệu trả về khi kích hoạt xác thực 2 bước thành công
export interface TwoFactorTurnOnResponse {
  message: string;
  recoveryCodes: string[];
}
