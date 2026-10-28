import { sha256Hex } from '../../common/utils/security.util';
import { isKioskRequest } from '../../auth/guards/pickup-auth.guard';
import {
  generateDepositToken,
  hashDepositToken,
  verifyDepositToken,
  verifyDynamicQrToken,
} from './package-code.util';
import { hashOtp, verifyOtp } from './shipper-verification.util';
import {
  PICKUPABLE_STATUSES,
  STORED_STATUSES,
  releaseBoxAfterPickup,
} from './package-status.util';
import { BoxStatus, DoorStatus } from '../../lockers/enums';
import { PackageStatus } from '../enums';

// Tính token QR động của một phút bất kỳ giống công thức trên màn hình trạm tủ
const buildQrToken = (apiKey: string, code: string, minute: number) =>
  sha256Hex(`${apiKey}${code}${minute}`).substring(0, 6).toUpperCase();

describe('verifyDynamicQrToken', () => {
  const NOW = new Date('2026-01-01T00:10:30Z');
  const minute = Math.floor(NOW.getTime() / 1000 / 60);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('chấp nhận token của phút hiện tại và phút liền trước', () => {
    expect(verifyDynamicQrToken('key', 'LK01', buildQrToken('key', 'LK01', minute))).toBe(true);
    expect(verifyDynamicQrToken('key', 'LK01', buildQrToken('key', 'LK01', minute - 1))).toBe(true);
  });

  it('từ chối token cũ hơn hai phút hoặc dữ liệu rỗng', () => {
    expect(verifyDynamicQrToken('key', 'LK01', buildQrToken('key', 'LK01', minute - 2))).toBe(false);
    expect(verifyDynamicQrToken('', 'LK01', 'ABC123')).toBe(false);
    expect(verifyDynamicQrToken('key', '', 'ABC123')).toBe(false);
    expect(verifyDynamicQrToken('key', 'LK01', '')).toBe(false);
  });

  it('không phân biệt hoa thường và khoảng trắng', () => {
    const token = ` ${buildQrToken('key', 'LK01', minute).toLowerCase()} `;
    expect(verifyDynamicQrToken('key', ' lk01 ', token)).toBe(true);
  });
});

describe('verifyOtp và verifyDepositToken', () => {
  it('so khớp đúng và sai mã OTP', () => {
    const stored = hashOtp('0900000000', '123456', 'secret');
    expect(verifyOtp('0900000000', '123456', stored, 'secret')).toBe(true);
    expect(verifyOtp('0900000000', '654321', stored, 'secret')).toBe(false);
    expect(verifyOtp('0900000000', '123456', undefined, 'secret')).toBe(false);
  });

  it('so khớp đúng và sai mã xác nhận lượt gửi', () => {
    const token = generateDepositToken();
    const stored = hashDepositToken(token);
    expect(verifyDepositToken(token, stored)).toBe(true);
    expect(verifyDepositToken('sai', stored)).toBe(false);
    expect(verifyDepositToken(undefined, stored)).toBe(false);
    expect(verifyDepositToken(token, undefined)).toBe(false);
  });
});

describe('hằng trạng thái kiện hàng', () => {
  it('STORED_STATUSES gồm chờ gửi và các trạng thái có thể nhận', () => {
    expect(PICKUPABLE_STATUSES).toEqual([
      PackageStatus.WAITING_FOR_PICKUP,
      PackageStatus.OVERDUE,
    ]);
    expect(STORED_STATUSES).toEqual([
      PackageStatus.PENDING_DEPOSIT,
      PackageStatus.WAITING_FOR_PICKUP,
      PackageStatus.OVERDUE,
    ]);
  });
});

describe('releaseBoxAfterPickup', () => {
  it('trả ngăn về trạng thái trống và lưu lại', async () => {
    const box = {
      status: BoxStatus.OCCUPIED,
      currentPackageId: 'p1',
      doorStatus: DoorStatus.CLOSED,
      hasItem: true,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const boxModel = { findById: jest.fn().mockResolvedValue(box) };

    await releaseBoxAfterPickup(boxModel as never, 'b1');

    expect(box).toMatchObject({
      status: BoxStatus.AVAILABLE,
      currentPackageId: undefined,
      doorStatus: DoorStatus.OPEN,
      hasItem: false,
    });
    expect(box.save).toHaveBeenCalledTimes(1);
  });

  it('không lỗi khi không tìm thấy ngăn', async () => {
    const boxModel = { findById: jest.fn().mockResolvedValue(null) };
    await expect(releaseBoxAfterPickup(boxModel as never, 'b1')).resolves.toBeUndefined();
  });
});

describe('isKioskRequest', () => {
  it('chỉ nhận nguồn DEVICE là Kiosk', () => {
    expect(isKioskRequest('DEVICE')).toBe(true);
    expect(isKioskRequest('MOBILE')).toBe(false);
    expect(isKioskRequest(undefined)).toBe(false);
  });
});