import { Types } from 'mongoose';
import { Role } from '../../auth/enums/role.enum';
import { toObjectIdOrUndefined } from '../../common/utils/building-scope.util';
import { LockerAction } from '../../lockers/enums/locker.enums';
import { ActivityLog } from '../schemas/activity-log.schema';
import { buildLockerActivityEntry } from './build-locker-activity';

// Bản ghi LockerLog đọc ở dạng thô để nạp sang ActivityLog
export interface LockerLogRecord {
  _id: Types.ObjectId;
  lockerId: Types.ObjectId;
  boxNumber: number;
  packageId?: Types.ObjectId;
  action: LockerAction;
  performedBy: string;
  status: 'SUCCESS' | 'FAILED';
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

// Thông tin trạm tủ cần để dựng nhật ký (tòa nhà, mã và tên trạm)
export interface LockerLookup {
  _id: Types.ObjectId;
  code: string;
  name?: string;
  buildingId: Types.ObjectId;
}

// Cư dân tra theo số điện thoại để điền tên và mã người nhận hàng
export interface ResidentLookup {
  _id: Types.ObjectId;
  name: string;
}

// Các hành động mà người thực hiện là cư dân nên có thể tra tên theo số điện thoại
const RESIDENT_ACTIONS: ReadonlySet<LockerAction> = new Set([
  LockerAction.PICKUP_OTP,
  LockerAction.PICKUP_QR,
  LockerAction.PICKUP_FACE_ID,
]);

// Dựng tài liệu ActivityLog từ một LockerLog cũ, dùng lại _id và thời gian gốc để chạy lại không bị trùng
export function mapLockerLogToActivityDoc(
  record: LockerLogRecord,
  lockers: Map<string, LockerLookup>,
  residentsByPhone: Map<string, ResidentLookup>,
): Partial<ActivityLog> | null {
  const locker = lockers.get(String(record.lockerId));
  if (!locker || !record.createdAt) return null;

  const resident = RESIDENT_ACTIONS.has(record.action)
    ? residentsByPhone.get(record.performedBy)
    : undefined;

  const entry = buildLockerActivityEntry({
    locker,
    boxNumber: record.boxNumber,
    packageId: record.packageId,
    action: record.action,
    performedBy: record.performedBy,
    status: record.status,
    metadata: record.metadata,
    actor: resident
      ? {
          userId: resident._id,
          name: resident.name,
          phone: record.performedBy,
          role: Role.RESIDENT,
        }
      : undefined,
  });

  return {
    _id: record._id,
    actor: {
      userId: toObjectIdOrUndefined(entry.actor.userId),
      name: entry.actor.name,
      phone: entry.actor.phone,
      role: entry.actor.role,
    },
    buildingId: toObjectIdOrUndefined(entry.buildingId),
    category: entry.category,
    status: entry.status,
    title: entry.title,
    description: entry.description,
    target: entry.target,
    metadata: { ...entry.metadata, backfilled: true },
    createdAt: record.createdAt,
  };
}
