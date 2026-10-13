import { Role } from '../../auth/enums/role.enum';

// Nhóm nghiệp vụ của một bản ghi nhật ký thao tác
export enum ActivityCategory {
  PACKAGE = 'PACKAGE',
  PICKUP = 'PICKUP',
  LOCKER = 'LOCKER',
  HARDWARE = 'HARDWARE',
  SETTINGS = 'SETTINGS',
  USER = 'USER',
  PAYMENT = 'PAYMENT',
  ISSUE = 'ISSUE',
}

// Mức độ của sự kiện để admin lọc nhanh
export enum ActivityStatus {
  SUCCESS = 'SUCCESS',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

// Vai trò người thực hiện: các vai trò tài khoản cùng tác nhân hệ thống và thiết bị
export const ACTIVITY_ACTOR_ROLES = [
  ...Object.values(Role),
  'SYSTEM',
  'DEVICE',
] as const;

export type ActivityActorRole = (typeof ACTIVITY_ACTOR_ROLES)[number];

// Loại đối tượng bị tác động
export const ACTIVITY_TARGET_TYPES = [
  'LOCKER',
  'PACKAGE',
  'USER',
  'BUILDING',
  'ISSUE',
  'SYSTEM',
] as const;

export type ActivityTargetType = (typeof ACTIVITY_TARGET_TYPES)[number];

// Số ngày lưu nhật ký thao tác trước khi MongoDB tự xóa (chỉ áp dụng cho ActivityLog, không áp dụng cho LockerLog)
export const ACTIVITY_LOG_RETENTION_DAYS = 365;
