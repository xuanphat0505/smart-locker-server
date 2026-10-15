import {
  calculateRemaining,
  emptyCredit,
  isFullyPaid,
  resolveTransactionId,
  sumCredit,
} from './payment-receipt.util';

describe('payment-receipt.util', () => {
  describe('isFullyPaid', () => {
    it('chuyển thiếu thì chưa đủ', () => {
      expect(isFullyPaid(15000, 1000)).toBe(false);
    });

    it('chuyển đúng hoặc dư thì đủ', () => {
      expect(isFullyPaid(15000, 15000)).toBe(true);
      expect(isFullyPaid(15000, 20000)).toBe(true);
    });

    it('chưa nhận đồng nào thì chưa đủ', () => {
      expect(isFullyPaid(15000)).toBe(false);
    });
  });

  describe('calculateRemaining', () => {
    it('tính phần còn thiếu', () => {
      expect(calculateRemaining(15000, 1000)).toBe(14000);
    });

    it('không bao giờ âm khi chuyển dư', () => {
      expect(calculateRemaining(15000, 20000)).toBe(0);
    });

    it('chưa nhận gì thì còn thiếu đủ số phải nộp', () => {
      expect(calculateRemaining(15000)).toBe(15000);
    });
  });

  describe('cộng dồn nhiều khoản', () => {
    it('chuyển 1.000 rồi 14.000 thì đủ 15.000', () => {
      const first = 1000;
      const second = 14000;
      expect(isFullyPaid(15000, first)).toBe(false);
      expect(isFullyPaid(15000, first + second)).toBe(true);
    });
  });

  describe('resolveTransactionId', () => {
    it('ưu tiên mã giao dịch SePay', () => {
      expect(
        resolveTransactionId({
          sepayTransactionId: '92704',
          referenceCode: 'FT123',
        }),
      ).toEqual({ transactionId: '92704', isDedupable: true });
    });

    it('không có mã SePay thì dùng mã tham chiếu ngân hàng', () => {
      expect(resolveTransactionId({ referenceCode: 'FT123' })).toEqual({
        transactionId: 'FT123',
        isDedupable: true,
      });
    });

    it('không có mã nào thì sinh mã ngẫu nhiên và đánh dấu không chống trùng được', () => {
      const a = resolveTransactionId({});
      const b = resolveTransactionId({});

      expect(a.isDedupable).toBe(false);
      expect(a.transactionId).toMatch(/^UNKNOWN-/);
      expect(a.transactionId).not.toBe(b.transactionId);
    });
  });

  describe('sumCredit', () => {
    const receipt = (transactionId: string, amount: number) => ({
      transactionId,
      amount,
      receivedAt: new Date('2026-10-15T00:00:00Z'),
    });

    it('không có đơn cũ thì không có tiền chuyển sang', () => {
      expect(sumCredit([])).toEqual(emptyCredit());
    });

    it('gộp tiền và khoản nhận của nhiều đơn cũ', () => {
      const result = sumCredit([
        { receivedAmount: 1000, receipts: [receipt('A', 1000)] },
        { receivedAmount: 2000, receipts: [receipt('B', 2000)] },
      ]);

      expect(result.receivedAmount).toBe(3000);
      expect(result.receipts.map((r) => r.transactionId)).toEqual(['A', 'B']);
    });

    it('đơn cũ chưa có trường tiền nhận được coi là 0', () => {
      expect(sumCredit([{}, { receivedAmount: 500 }]).receivedAmount).toBe(500);
    });

    it('mỗi lần gọi emptyCredit trả về đối tượng riêng', () => {
      expect(emptyCredit().receipts).not.toBe(emptyCredit().receipts);
    });
  });
});
