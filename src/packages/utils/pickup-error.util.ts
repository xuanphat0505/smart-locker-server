import { HttpException, HttpStatus } from '@nestjs/common';

// Mã lỗi ổn định của luồng nhận hàng để thiết bị phần cứng ánh xạ sang chữ ngắn
export enum PickupErrorCode {
  CODE_INVALID = 'CODE_INVALID',
  PICKUP_LOCKED = 'PICKUP_LOCKED',
  QR_PROOF_EXPIRED = 'QR_PROOF_EXPIRED',
  LOCKER_NOT_FOUND = 'LOCKER_NOT_FOUND',
}

// Dựng lỗi HTTP kèm mã lỗi; trường message giữ nguyên cho ứng dụng di động hiển thị
export const buildPickupError = (
  status: HttpStatus,
  code: PickupErrorCode,
  message: string,
): HttpException => new HttpException({ statusCode: status, code, message }, status);
