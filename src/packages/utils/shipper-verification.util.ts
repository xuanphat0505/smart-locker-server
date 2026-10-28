import * as crypto from 'crypto';
import { safeEqualHex } from '../../common/utils/security.util';

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
  return safeEqualHex(hashOtp(phone, otp, secret), storedHash);
}

// Nội dung tin nhắn OTP
export function buildOtpMessage(otp: string): string {
  return `${otp} là mã xác thực Smart Locker. Hết hạn sau 3 phút. Không chia sẻ.`;
}

export const SHIPPER_NAME_MIN_LENGTH = 2;
export const SHIPPER_NAME_MAX_LENGTH = 60;

// Trạng thái độ tin cậy của tên tài xế gắn với phiên xác thực
export type ShipperNameStatus = 'SELF_DECLARED' | 'APPROVED';

// Chuẩn hóa tên tài xế: bỏ khoảng trắng thừa và gộp nhiều khoảng trắng liên tiếp thành một
export function normalizeShipperName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

// Quyết định tên và trạng thái sau khi tài xế xác thực lại: tên đã được duyệt thì giữ nguyên, tên tự khai thì cập nhật theo lần nhập mới
export function resolveSessionName(
  current: { name?: string; nameStatus?: ShipperNameStatus },
  incomingName: string,
): { name: string; nameStatus: ShipperNameStatus } {
  if (current.nameStatus === 'APPROVED' && current.name) {
    return { name: current.name, nameStatus: 'APPROVED' };
  }
  return { name: normalizeShipperName(incomingName), nameStatus: 'SELF_DECLARED' };
}
