// Thời hạn token truy cập, dùng chung cho module đăng ký JWT và service cấp token
export const ACCESS_TOKEN_TTL = '15m';

// Thời hạn token làm mới
export const REFRESH_TOKEN_TTL = '7d';

// Thời hạn token tạm dùng giữa bước nhập mật khẩu và bước xác thực hai lớp
export const TWO_FA_TEMP_TOKEN_TTL = '5m';

// Thời hạn mã OTP đặt lại mật khẩu, tính bằng mili giây
export const RESET_PASSWORD_OTP_TTL_MS = 10 * 60 * 1000;

// Số lần nhập sai tối đa cho một mã OTP đặt lại mật khẩu trước khi mã bị hủy
export const RESET_PASSWORD_MAX_ATTEMPTS = 5;
