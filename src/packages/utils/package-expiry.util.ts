import { QueryFilter } from 'mongoose';
import { Package } from '../schemas';
import { PackageStatus } from '../enums';
import { DEFAULT_PRICING_POLICY } from '../../payments/utils/pricing-policy.util';

const HOUR_MS = 60 * 60 * 1000;

// Số giờ trước hạn lưu kho để nhắc cư dân nhận hàng
export const EXPIRY_WARNING_HOURS = 12;

// Số giờ lưu kho tối đa của tòa nhà (mốc T3 trong biểu phí), dùng mặc định khi tòa chưa cấu hình
export function resolveStorageLimitHours(
  policy?: { t3Hours?: number } | null,
): number {
  return policy?.t3Hours ?? DEFAULT_PRICING_POLICY.t3Hours;
}

// Tính thời điểm hết hạn lưu kho của kiện hàng từ lúc gửi và số giờ lưu kho tối đa của tòa nhà
export function computeExpiredAt(
  droppedOffAt: Date,
  storageLimitHours: number,
): Date {
  return new Date(droppedOffAt.getTime() + storageLimitHours * HOUR_MS);
}

// Bộ lọc các kiện đang chờ đã quá hạn lưu kho và không còn nằm trong thời gian đã gia hạn
export function buildOverdueFilter(now: Date): QueryFilter<Package> {
  return {
    status: PackageStatus.WAITING_FOR_PICKUP,
    expiredAt: { $lt: now },
    $or: [
      { paidUntil: { $exists: false } },
      { paidUntil: null },
      { paidUntil: { $lte: now } },
    ],
  };
}

// Bộ lọc các kiện đang chờ sắp hết hạn lưu kho trong khoảng giờ cảnh báo, chưa được nhắc và không còn trong thời gian đã gia hạn
export function buildExpiringSoonFilter(
  now: Date,
  warnHours: number,
): QueryFilter<Package> {
  return {
    status: PackageStatus.WAITING_FOR_PICKUP,
    expiredAt: { $gt: now, $lte: new Date(now.getTime() + warnHours * HOUR_MS) },
    expiryWarnedAt: { $exists: false },
    $or: [
      { paidUntil: { $exists: false } },
      { paidUntil: null },
      { paidUntil: { $lte: now } },
    ],
  };
}
