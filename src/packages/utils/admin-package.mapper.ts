import { Types } from 'mongoose';
import { AdminPackageItemDto } from '../dto/admin-package.dto';
import { Package } from '../schemas';

// Các trường bí mật phải loại khỏi mọi truy vấn trả dữ liệu bưu kiện cho admin
export const ADMIN_PACKAGE_EXCLUDED_FIELDS =
  '-pinCode -qrCodeToken -failedAttempts -lockedUntil -boxId -residentId -shipperId -__v';

interface PopulatedRef {
  _id: Types.ObjectId;
  name?: string;
  code?: string;
}

// Chuyển document bưu kiện (đã populate trạm tủ và tòa nhà) sang dữ liệu an toàn cho admin
export function toAdminPackageItem(
  pkg: Package & { createdAt?: Date; updatedAt?: Date },
): AdminPackageItemDto {
  const locker = pkg.lockerId as unknown as PopulatedRef | undefined;
  const building = pkg.buildingId as unknown as PopulatedRef | undefined;

  return {
    _id: String(pkg._id),
    trackingNumber: pkg.trackingNumber,
    status: pkg.status,
    boxNumber: pkg.boxNumber,
    boxSize: pkg.boxSize,
    carrierName: pkg.carrierName,
    receiverName: pkg.receiverName,
    receiverPhone: pkg.receiverPhone,
    apartment: pkg.apartment,
    shipperName: pkg.shipperName,
    shipperPhone: pkg.shipperPhone,
    locker: locker?.code
      ? { _id: String(locker._id), code: locker.code, name: locker.name ?? '' }
      : undefined,
    building: building?.name
      ? { _id: String(building._id), name: building.name }
      : undefined,
    droppedOffAt: pkg.droppedOffAt,
    expiredAt: pkg.expiredAt,
    pickedUpAt: pkg.pickedUpAt,
    paidUntil: pkg.paidUntil,
    totalFeePaid: pkg.totalFeePaid ?? 0,
    note: pkg.note,
    isShipperVerified: pkg.isShipperVerified,
    createdAt: pkg.createdAt as Date,
    updatedAt: pkg.updatedAt as Date,
  };
}
