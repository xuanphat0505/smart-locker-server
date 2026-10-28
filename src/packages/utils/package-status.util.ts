import { Model, QueryFilter, Types } from 'mongoose';
import { Package } from '../schemas';
import { PackageStatus } from '../enums';
import { Box } from '../../lockers/schemas/box.schema';
import { BoxStatus, DoorStatus } from '../../lockers/enums';
import { DEFAULT_PRICING_POLICY } from '../../payments/utils/storage-pricing.util';

// Trạng thái kiện hàng còn có thể nhận: đang chờ lấy hoặc đã quá hạn lưu kho
export const PICKUPABLE_STATUSES = [
  PackageStatus.WAITING_FOR_PICKUP,
  PackageStatus.OVERDUE,
];

// Trạng thái kiện hàng đang chiếm ngăn tủ: chờ xác nhận gửi, chờ lấy hoặc quá hạn
export const STORED_STATUSES = [
  PackageStatus.PENDING_DEPOSIT,
  ...PICKUPABLE_STATUSES,
];

// Chiếm quyền nhận kiện bằng một lệnh cập nhật duy nhất: chỉ kiện đang chờ nhận hoặc quá hạn mới chuyển được sang đã nhận
// Trả về null khi đã có yêu cầu khác nhận trước, giúp hai yêu cầu đồng thời không cùng mở tủ
export function claimPackageForPickup(
  packageModel: Model<Package>,
  packageId: Types.ObjectId | string,
  increments?: Record<string, number>,
) {
  return packageModel.findOneAndUpdate(
    {
      _id: packageId,
      status: { $in: PICKUPABLE_STATUSES },
    },
    {
      $set: { status: PackageStatus.PICKED_UP, pickedUpAt: new Date() },
      ...(increments ? { $inc: increments } : {}),
    },
    { new: true },
  );
}

// Trả ngăn tủ về trạng thái trống sau khi bưu kiện được lấy, cửa giữ trạng thái mở cho tới khi cảm biến báo đóng
export async function releaseBoxAfterPickup(
  boxModel: Model<Box>,
  boxId: Types.ObjectId | string,
): Promise<void> {
  const box = await boxModel.findById(boxId);
  if (box) {
    box.status = BoxStatus.AVAILABLE;
    box.currentPackageId = undefined;
    box.doorStatus = DoorStatus.OPEN;
    box.hasItem = false;
    await box.save();
  }
}

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
