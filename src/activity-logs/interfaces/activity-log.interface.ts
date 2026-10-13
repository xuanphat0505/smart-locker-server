import { Types } from 'mongoose';
import { LockerAction } from '../../lockers/enums/locker.enums';
import {
  ActivityActorRole,
  ActivityCategory,
  ActivityStatus,
  ActivityTargetType,
} from '../enums/activity-log.enums';

// Người hoặc tác nhân thực hiện thao tác được ghi vào nhật ký
export interface ActivityActorInput {
  userId?: Types.ObjectId | string;
  name: string;
  phone?: string;
  role: ActivityActorRole;
}

// Dữ liệu để ghi một bản ghi nhật ký thao tác nghiệp vụ
export interface CreateActivityLogInput {
  actor: ActivityActorInput;
  // Nhận ObjectId, chuỗi hoặc document đã populate; thiếu với sự kiện cấp hệ thống
  buildingId?: unknown;
  category: ActivityCategory;
  status: ActivityStatus;
  title: string;
  description?: string;
  target?: { type: ActivityTargetType; id?: string; label?: string };
  metadata?: Record<string, unknown>;
}

// Dữ liệu một thao tác tủ: ghi LockerLog (nhật ký phần cứng) và đồng thời ActivityLog
export interface LockerActionInput {
  locker: { _id: unknown; code: string; name?: string; buildingId: unknown };
  boxNumber: number;
  packageId?: Types.ObjectId | string;
  action: LockerAction;
  performedBy: string;
  status: 'SUCCESS' | 'FAILED';
  metadata?: Record<string, unknown>;
  // Bỏ trống thì suy ra từ performedBy và vai trò mặc định của hành động
  actor?: ActivityActorInput;
}
