import { toIdString } from '../../common/utils/building-scope.util';
import { LOCKER_ACTION_ACTIVITY } from '../constants/locker-action-activity.map';
import { ActivityStatus } from '../enums/activity-log.enums';
import {
  CreateActivityLogInput,
  LockerActionInput,
} from '../interfaces/activity-log.interface';

// Dựng nội dung nhật ký nghiệp vụ từ một thao tác tủ; dùng chung cho ghi trực tiếp và nạp lại dữ liệu cũ để hai nơi không lệch nhau
export function buildLockerActivityEntry(
  input: LockerActionInput,
): CreateActivityLogInput {
  const config = LOCKER_ACTION_ACTIVITY[input.action];
  const trackingNumber = input.metadata?.trackingNumber;
  const reason = input.metadata?.reason;
  const descriptionParts = [
    `Ngăn #${input.boxNumber} - trạm ${input.locker.code}`,
    typeof trackingNumber === 'string'
      ? `Mã vận đơn ${trackingNumber}`
      : undefined,
    typeof reason === 'string' && reason ? `Lý do: ${reason}` : undefined,
  ].filter(Boolean);

  return {
    actor: input.actor ?? {
      name: input.performedBy,
      phone: input.performedBy,
      role: config.defaultActorRole,
    },
    buildingId: input.locker.buildingId,
    category: config.category,
    status:
      input.status === 'FAILED' ? ActivityStatus.ERROR : config.defaultStatus,
    title: config.title,
    description: descriptionParts.join(' - '),
    target: {
      type: 'LOCKER',
      id: toIdString(input.locker._id),
      label: input.locker.name ?? input.locker.code,
    },
    metadata: {
      boxNumber: input.boxNumber,
      packageId: input.packageId ? String(input.packageId) : undefined,
      action: input.action,
    },
  };
}
