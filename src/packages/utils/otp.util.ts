import * as crypto from 'crypto';

export const OTP_TTL_MS = 3 * 60 * 1000;
export const OTP_RESEND_INTERVAL_MS = 60 * 1000;
export const OTP_MAX_SENDS_PER_HOUR = 5;
export const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;

// Sinh mã OTP 6 chữ số bằng bộ sinh số ngẫu nhiên an toàn
export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

// Băm mã OTP kèm số điện thoại bằng HMAC để không lưu mã gốc trong cơ sở dữ liệu
export function hashOtp(phone: string, otp: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${phone}:${otp}`).digest('hex');
}

// So khớp mã OTP người dùng nhập với bản băm đã lưu bằng phép so sánh thời gian cố định
export function verifyOtp(
  phone: string,
  otp: string,
  storedHash: string | undefined,
  secret: string,
): boolean {
  if (!storedHash) return false;
  const candidate = Buffer.from(hashOtp(phone, otp, secret), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

// Nội dung tin nhắn OTP
export function buildOtpMessage(otp: string): string {
  return `${otp} là mã xác thực Smart Locker. Hết hạn sau 3 phút. Không chia sẻ.`;
}
