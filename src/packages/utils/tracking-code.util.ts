import { ConflictException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { Package } from '../schemas';
import { PackageStatus } from '../enums';

// Chuẩn hóa mã vận đơn về dạng chữ hoa không khoảng trắng hai đầu
export function normalizeTrackingNumber(trackingNumber: string): string {
  return trackingNumber.trim().toUpperCase();
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
    status: {
      $in: [
        PackageStatus.PENDING_DEPOSIT,
        PackageStatus.WAITING_FOR_PICKUP,
        PackageStatus.OVERDUE,
      ],
    },
  });

  if (existing) {
    throw new ConflictException(
      `Mã vận đơn ${trackingNumber} đang có kiện chờ lấy trong tòa nhà này, không thể gửi trùng`,
    );
  }
}
