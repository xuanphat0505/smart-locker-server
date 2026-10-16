export const SHIPPER_NAME_MIN_LENGTH = 2;
export const SHIPPER_NAME_MAX_LENGTH = 60;

// Trạng thái độ tin cậy của tên tài xế gắn với phiên xác thực
export type ShipperNameStatus = 'SELF_DECLARED' | 'APPROVED';

// Chuẩn hóa tên tài xế: bỏ khoảng trắng thừa và gộp nhiều khoảng trắng liên tiếp thành một
export function normalizeShipperName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

// Quyết định tên và trạng thái sau khi tài xế xác thực lại: tên đã được duyệt thì giữ nguyên, tên tự khai thì cập nhật theo lần nhập mới
export function resolveSessionName(
  current: { name?: string; nameStatus?: ShipperNameStatus },
  incomingName: string,
): { name: string; nameStatus: ShipperNameStatus } {
  if (current.nameStatus === 'APPROVED' && current.name) {
    return { name: current.name, nameStatus: 'APPROVED' };
  }
  return { name: normalizeShipperName(incomingName), nameStatus: 'SELF_DECLARED' };
}
