import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';
import { Model, Types } from 'mongoose';
import { Package } from '../schemas';
import { safeEqualHex, sha256Hex } from '../../common/utils/security.util';
import { normalizeCode } from '../../common/utils/text.util';
import { STORED_STATUSES } from './package-status.util';

const MAX_PIN_ATTEMPTS = 10;

// Sinh mã OTP 6 số chưa bị bưu kiện nào đang lưu trong cùng trạm tủ sử dụng
export async function generateUniquePinCode(
  packageModel: Model<Package>,
  lockerId: Types.ObjectId,
  excludePackageId?: Types.ObjectId,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_PIN_ATTEMPTS; attempt++) {
    const pinCode = randomInt(100000, 1000000).toString();
    const existing = await packageModel.exists({
      lockerId,
      pinCode,
      status: { $in: STORED_STATUSES },
      ...(excludePackageId ? { _id: { $ne: excludePackageId } } : {}),
    });

    if (!existing) return pinCode;
  }

  throw new BadRequestException('Không thể sinh mã OTP duy nhất cho trạm tủ này, vui lòng thử lại');
}

// Chuẩn hóa mã vận đơn về dạng chữ hoa không khoảng trắng hai đầu
export function normalizeTrackingNumber(trackingNumber: string): string {
  return normalizeCode(trackingNumber);
}

// Chặn gửi trùng: không cho gửi mã vận đơn đang có kiện chờ đặt hàng, chờ lấy hoặc quá hạn trong cùng tòa nhà
export async function assertTrackingNumberNotInUse(
  packageModel: Model<Package>,
  trackingNumber: string,
  buildingId: Types.ObjectId,
): Promise<void> {
  const existing = await packageModel.exists({
    trackingNumber,
    buildingId,
    status: { $in: STORED_STATUSES },
  });

  if (existing) {
    throw new ConflictException(
      `Mã vận đơn ${trackingNumber} đang có kiện chờ lấy trong tòa nhà này, không thể gửi trùng`,
    );
  }
}

// Thời gian sau khi xác nhận mà tài xế còn xem được kết quả kèm OTP bằng mã xác nhận lượt gửi
export const DEPOSIT_RESULT_WINDOW_MS = 15 * 60 * 1000;

// Sinh mã xác nhận lượt gửi ngẫu nhiên, chỉ trả cho tài xế một lần
export function generateDepositToken(): string {
  return randomBytes(24).toString('hex');
}

// Băm mã xác nhận để lưu trong cơ sở dữ liệu thay vì lưu mã gốc
export function hashDepositToken(token: string): string {
  return sha256Hex(token);
}

// So khớp mã xác nhận với bản băm đã lưu theo cách không lộ thông tin qua thời gian xử lý
export function verifyDepositToken(
  token: string | undefined,
  storedHash: string | undefined,
): boolean {
  if (!token || !storedHash) return false;
  return safeEqualHex(hashDepositToken(token), storedHash);
}

// Thẩm định tính hợp lệ của mã QR Token động sinh từ màn hình LCD trạm tủ, chấp nhận cửa sổ phút hiện tại và phút liền trước
export function verifyDynamicQrToken(apiKey: string, stationCode: string, token: string): boolean {
  if (!apiKey || !stationCode || !token) {
    return false;
  }

  const cleanToken = normalizeCode(token);
  const currentWindow = Math.floor(Date.now() / 1000 / 60);
  const windowsToCheck = [currentWindow, currentWindow - 1];

  return windowsToCheck.some((window) => {
    const payload = `${apiKey}${normalizeCode(stationCode)}${window}`;
    const expectedToken = sha256Hex(payload).substring(0, 6).toUpperCase();
    return expectedToken === cleanToken;
  });
}
