import { randomUUID } from 'crypto';

// Một khoản tiền đã nhận cho đơn thanh toán
export interface PaymentReceipt {
  transactionId: string;
  amount: number;
  receivedAt: Date;
}

// Phần tiền đã nhận của một đơn, dùng khi chuyển sang đơn mới
interface ReceivedFunds {
  receivedAmount?: number;
  receipts?: PaymentReceipt[];
}

// Khoản tiền đã nhận ban đầu của một đơn mới khi không có đơn cũ nào để chuyển sang
export function emptyCredit(): {
  receivedAmount: number;
  receipts: PaymentReceipt[];
} {
  return { receivedAmount: 0, receipts: [] };
}

// Tính số tiền còn thiếu của đơn, không bao giờ âm
export function calculateRemaining(amount: number, receivedAmount = 0): number {
  return Math.max(0, amount - receivedAmount);
}

// Đơn được coi là đã đủ tiền khi tổng tiền nhận không nhỏ hơn số phải nộp
export function isFullyPaid(amount: number, receivedAmount = 0): boolean {
  return receivedAmount >= amount;
}

// Chọn mã giao dịch để chống tính trùng: ưu tiên mã SePay, sau đó mã tham chiếu ngân hàng, cuối cùng sinh mã ngẫu nhiên khi cổng không gửi mã nào
export function resolveTransactionId(params: {
  sepayTransactionId?: string;
  referenceCode?: string;
}): { transactionId: string; isDedupable: boolean } {
  const known = params.sepayTransactionId || params.referenceCode;
  if (known) {
    return { transactionId: String(known), isDedupable: true };
  }
  return { transactionId: `UNKNOWN-${randomUUID()}`, isDedupable: false };
}

// Gộp số tiền và các khoản đã nhận của nhiều đơn cũ để chuyển sang một đơn mới
export function sumCredit(payments: ReceivedFunds[]): {
  receivedAmount: number;
  receipts: PaymentReceipt[];
} {
  return payments.reduce<{
    receivedAmount: number;
    receipts: PaymentReceipt[];
  }>(
    (total, payment) => ({
      receivedAmount: total.receivedAmount + (payment.receivedAmount ?? 0),
      receipts: [...total.receipts, ...(payment.receipts ?? [])],
    }),
    emptyCredit(),
  );
}
