import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '../../auth/enums/role.enum';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';

// Xác định phạm vi tòa nhà được phép truy vấn: System Admin tùy chọn lọc theo tòa, Building Admin luôn bị ép về tòa của mình
export function resolveBuildingScope(
  user: AuthenticatedUser,
  requestedBuildingId?: string,
): Types.ObjectId | undefined {
  if (user.role === Role.SYSTEM_ADMIN) {
    if (!requestedBuildingId) return undefined;
    if (!Types.ObjectId.isValid(requestedBuildingId)) {
      throw new BadRequestException('Mã tòa nhà không hợp lệ');
    }
    return new Types.ObjectId(requestedBuildingId);
  }

  if (user.role === Role.BUILDING_ADMIN) {
    if (!user.buildingId || !Types.ObjectId.isValid(user.buildingId)) {
      throw new BadRequestException(
        'Tài khoản quản trị chưa được liên kết với Tòa nhà nào',
      );
    }
    return new Types.ObjectId(user.buildingId);
  }

  throw new ForbiddenException('Bạn không có quyền truy cập dữ liệu quản trị');
}

// Chuyển giá trị ObjectId hoặc document đã populate về chuỗi mã định danh để so sánh
export function toIdString(value: unknown): string {
  if (value && typeof value === 'object' && '_id' in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

// Kiểm tra một tòa nhà có nằm trong phạm vi quyền của người dùng quản trị hay không
export function canAccessBuilding(
  user: AuthenticatedUser,
  buildingId: unknown,
): boolean {
  if (user.role === Role.SYSTEM_ADMIN) return true;
  return (
    user.role === Role.BUILDING_ADMIN &&
    Boolean(user.buildingId) &&
    Boolean(buildingId) &&
    toIdString(buildingId) === String(user.buildingId)
  );
}

// Chuyển giá trị ObjectId, chuỗi hoặc document đã populate thành ObjectId, trả về undefined nếu không hợp lệ
export function toObjectIdOrUndefined(
  value: unknown,
): Types.ObjectId | undefined {
  if (value === undefined || value === null) return undefined;
  const id = toIdString(value);
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : undefined;
}
