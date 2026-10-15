import {
  buildOverdueFilter,
  computeExpiredAt,
  resolveStorageLimitHours,
} from './package-expiry.util';
import { PackageStatus } from '../enums';

describe('package-expiry.util', () => {
  describe('resolveStorageLimitHours', () => {
    it('lấy mốc T3 của tòa nhà', () => {
      expect(resolveStorageLimitHours({ t3Hours: 72 })).toBe(72);
    });

    it('tòa chưa cấu hình thì dùng mặc định 48 giờ', () => {
      expect(resolveStorageLimitHours(undefined)).toBe(48);
      expect(resolveStorageLimitHours(null)).toBe(48);
      expect(resolveStorageLimitHours({})).toBe(48);
    });
  });

  describe('computeExpiredAt', () => {
    const droppedOffAt = new Date('2026-10-15T00:00:00.000Z');

    it('cộng đúng số giờ lưu kho vào thời điểm gửi hàng', () => {
      expect(computeExpiredAt(droppedOffAt, 48).toISOString()).toBe(
        '2026-10-17T00:00:00.000Z',
      );
      expect(computeExpiredAt(droppedOffAt, 72).toISOString()).toBe(
        '2026-10-18T00:00:00.000Z',
      );
    });

    it('không làm thay đổi đối tượng ngày gốc', () => {
      computeExpiredAt(droppedOffAt, 48);
      expect(droppedOffAt.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    });
  });

  describe('buildOverdueFilter', () => {
    it('chỉ chọn kiện đang chờ, đã quá hạn và hết thời gian gia hạn', () => {
      const now = new Date('2026-10-15T12:00:00.000Z');

      expect(buildOverdueFilter(now)).toEqual({
        status: PackageStatus.WAITING_FOR_PICKUP,
        expiredAt: { $lt: now },
        $or: [
          { paidUntil: { $exists: false } },
          { paidUntil: null },
          { paidUntil: { $lte: now } },
        ],
      });
    });
  });
});
