import { createHash, randomBytes, timingSafeEqual } from 'crypto';

// Thời gian sau khi xác nhận mà tài xế còn xem được kết quả kèm OTP bằng mã xác nhận lượt gửi
export const DEPOSIT_RESULT_WINDOW_MS = 15 * 60 * 1000;

// Sinh mã xác nhận lượt gửi ngẫu nhiên, chỉ trả cho tài xế một lần
export function generateDepositToken(): string {
  return randomBytes(24).toString('hex');
}

// Băm mã xác nhận để lưu trong cơ sở dữ liệu thay vì lưu mã gốc
export function hashDepositToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// So khớp mã xác nhận với bản băm đã lưu theo cách không lộ thông tin qua thời gian xử lý
export function verifyDepositToken(
  token: string | undefined,
  storedHash: string | undefined,
): boolean {
  if (!token || !storedHash) return false;
  const provided = Buffer.from(hashDepositToken(token));
  const stored = Buffer.from(storedHash);
  return provided.length === stored.length && timingSafeEqual(provided, stored);
}
