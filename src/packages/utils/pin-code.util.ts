import { BadRequestException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { Package } from '../schemas';
import { PackageStatus } from '../enums';

const MAX_PIN_ATTEMPTS = 10;

// Sinh mã OTP 6 số chưa bị bưu kiện nào đang lưu trong cùng trạm tủ sử dụng
export async function generateUniquePinCode(
  packageModel: Model<Package>,
  lockerId: Types.ObjectId,
  excludePackageId?: Types.ObjectId,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_PIN_ATTEMPTS; attempt++) {
    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();
    const existing = await packageModel.exists({
      lockerId,
      pinCode,
      status: {
        $in: [PackageStatus.WAITING_FOR_PICKUP, PackageStatus.OVERDUE],
      },
      ...(excludePackageId ? { _id: { $ne: excludePackageId } } : {}),
    });

    if (!existing) return pinCode;
  }

  throw new BadRequestException(
    'Không thể sinh mã OTP duy nhất cho trạm tủ này, vui lòng thử lại',
  );
}
