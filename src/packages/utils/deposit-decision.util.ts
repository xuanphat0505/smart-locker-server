// Ảnh chụp cảm biến của một ngăn tại một thời điểm, lấy từ bản tin trạm tủ báo về
export interface SensorSnapshot {
  doorStatus: 'OPEN' | 'CLOSED';
  hasItem: boolean;
  at: number;
}

// Trạng thái theo dõi của một lượt gửi hàng đang chờ xác nhận
export interface DepositState {
  unlockedAt: number;
  doorOpenedAt?: number;
}

// Hành động cần thực hiện sau khi đánh giá một bản tin cảm biến
export type SensorDecision = 'NONE' | 'MARK_DOOR_OPENED' | 'CONFIRM';

// Hành động cần thực hiện khi lượt gửi đã quá hạn chờ
export type ExpiryDecision = 'CONFIRM' | 'CANCEL' | 'WARN_DOOR_OPEN';

// Thời gian chờ tối thiểu sau lúc mở khóa mới chấp nhận xác nhận khi chưa thấy cửa mở (bản tin cửa mở có thể bị rơi)
export const DEPOSIT_GRACE_MS = 20 * 1000;

// Thời hạn chờ cảm biến xác nhận một lượt gửi hàng
export const DEPOSIT_TTL_MS = 10 * 60 * 1000;

// Thời gian mở khóa chốt dành cho tài xế đặt hàng, dài hơn lúc nhận hàng để kịp kéo cửa
export const DROP_OFF_UNLOCK_MS = 10 * 1000;

// Ảnh chụp cảm biến cũ hơn mức này không còn đủ tin cậy để chặn việc gửi hàng vào ngăn
export const SENSOR_FRESH_MS = 2 * 60 * 1000;

// Đánh giá một bản tin cảm biến: ghi nhận cửa đã mở, hoặc xác nhận khi cửa đóng và có hàng
export function decideOnSensor(
  state: DepositState,
  snapshot: SensorSnapshot,
): SensorDecision {
  if (snapshot.doorStatus === 'OPEN') {
    return state.doorOpenedAt ? 'NONE' : 'MARK_DOOR_OPENED';
  }

  if (!snapshot.hasItem) return 'NONE';

  const hasSeenDoorOpen = Boolean(state.doorOpenedAt);
  const graceElapsed = snapshot.at - state.unlockedAt >= DEPOSIT_GRACE_MS;
  return hasSeenDoorOpen || graceElapsed ? 'CONFIRM' : 'NONE';
}

// Quyết định khi lượt gửi quá hạn: xác nhận nếu ngăn đã đóng có hàng, hủy nếu đóng mà trống, giữ chỗ nếu cửa còn mở
export function decideOnExpiry(
  state: DepositState,
  lastSnapshot?: SensorSnapshot | null,
): ExpiryDecision {
  if (!lastSnapshot || lastSnapshot.at < state.unlockedAt) return 'CANCEL';
  if (lastSnapshot.doorStatus === 'OPEN') return 'WARN_DOOR_OPEN';
  return lastSnapshot.hasItem ? 'CONFIRM' : 'CANCEL';
}

// Cảm biến vừa báo ngăn có hàng dù hệ thống ghi ngăn trống thì từ chối giữ chỗ để người vận hành kiểm tra
export function isSensorReportingItem(
  lastSnapshot: SensorSnapshot | null | undefined,
  now: number,
): boolean {
  return Boolean(
    lastSnapshot &&
      lastSnapshot.hasItem &&
      now - lastSnapshot.at <= SENSOR_FRESH_MS,
  );
}
