import { Model, Types } from 'mongoose';
import { Package } from '../schemas';
import { PackageStatus } from '../enums';

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
      status: {
        $in: [PackageStatus.WAITING_FOR_PICKUP, PackageStatus.OVERDUE],
      },
    },
    {
      $set: { status: PackageStatus.PICKED_UP, pickedUpAt: new Date() },
      ...(increments ? { $inc: increments } : {}),
    },
    { new: true },
  );
}
