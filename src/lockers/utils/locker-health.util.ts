import { LockerStatus } from '../enums';

// Quá khoảng thời gian này không có nhịp tim thì trạm tủ được coi là mất kết nối
export const HEARTBEAT_TIMEOUT_MS = 75000;

// Trạm tủ được coi là trực tuyến khi trạng thái là ONLINE và có nhịp tim gần đây
export function isLockerOnline(locker: {
  status: LockerStatus;
  lastHeartbeatAt?: Date;
}): boolean {
  if (locker.status !== LockerStatus.ONLINE || !locker.lastHeartbeatAt) {
    return false;
  }
  return (
    Date.now() - new Date(locker.lastHeartbeatAt).getTime() <=
    HEARTBEAT_TIMEOUT_MS
  );
}
