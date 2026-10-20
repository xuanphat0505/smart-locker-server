import { PaymentStatus, PaymentType } from '../enums/payment.enums';
import { PricingTierKey } from './pricing-policy.util';

export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

// Thông tin kiện hàng làm đầu vào, liveTotalFee chỉ có nghĩa với kiện đang lưu kho
export interface InvoicePackageInput {
  packageId: string;
  trackingNumber: string;
  lockerName?: string;
  boxNumber?: number;
  packageStatus: string;
  droppedOffAt: Date;
  isActive: boolean;
  liveTotalFee: number;
  currentTier: PricingTierKey | null;
}

// Thông tin một phiên thanh toán làm đầu vào
export interface InvoicePaymentInput {
  orderCode: number;
  packageId?: string;
  paymentType: PaymentType;
  status: PaymentStatus;
  amount: number;
  receivedAmount: number;
  paidAt?: Date;
  receiptAt?: Date;
  description?: string;
  expiresAt?: Date;
  sepayTransactionId?: string;
}

export interface InvoicePayment {
  orderCode: number;
  amount: number;
  paidAt?: Date;
  paymentType: PaymentType;
  status: 'PAID' | 'RECEIVED_PENDING';
}

export interface PendingPaymentInfo {
  orderCode: number;
  transferContent?: string;
  remainingAmount: number;
  expiresAt?: Date;
}

export interface Invoice {
  packageId: string;
  trackingNumber: string;
  lockerName?: string;
  boxNumber?: number;
  packageStatus: string;
  status: InvoiceStatus;
  currentTier: PricingTierKey | null;
  totalFee: number;
  paidAmount: number;
  receivedPendingAmount: number;
  dueAmount: number;
  overpaidAmount: number;
  needsRefundReview: boolean;
  pendingPayment: PendingPaymentInfo | null;
  payments: InvoicePayment[];
}

export interface SubscriptionReceipt {
  orderCode: number;
  amount: number;
  paidAt?: Date;
  sepayTransactionId?: string;
}

export interface BuildInvoicesResult {
  invoices: Invoice[];
  subscriptionReceipts: SubscriptionReceipt[];
}

// Cộng dồn một giá trị số trên danh sách phần tử
const sumBy = <T>(items: T[], pick: (item: T) => number) =>
  items.reduce((sum, item) => sum + pick(item), 0);

// Xác định trạng thái hóa đơn từ số tiền còn nợ, đã trả và đã nhận chờ đủ
function resolveInvoiceStatus(
  dueAmount: number,
  paidAmount: number,
  receivedPendingAmount: number,
): InvoiceStatus {
  const hasMoney = paidAmount + receivedPendingAmount > 0;
  if (dueAmount > 0) return hasMoney ? 'PARTIAL' : 'UNPAID';
  if (paidAmount > 0) return 'PAID';
  return hasMoney ? 'PARTIAL' : 'UNPAID';
}

// Dựng các dòng thanh toán của hóa đơn gồm phiên đã PAID và khoản đã nhận ở phiên chờ
function buildInvoicePayments(
  payments: InvoicePaymentInput[],
): InvoicePayment[] {
  const lines: InvoicePayment[] = [];

  payments.forEach((p) => {
    if (p.status === PaymentStatus.PAID) {
      lines.push({
        orderCode: p.orderCode,
        amount: p.amount,
        paidAt: p.paidAt,
        paymentType: p.paymentType,
        status: 'PAID',
      });
    } else if (p.status === PaymentStatus.PENDING && p.receivedAmount > 0) {
      lines.push({
        orderCode: p.orderCode,
        amount: p.receivedAmount,
        paidAt: p.receiptAt,
        paymentType: p.paymentType,
        status: 'RECEIVED_PENDING',
      });
    }
  });

  return lines.sort(
    (a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0),
  );
}

// Chọn phiên chờ mới nhất còn thiếu tiền để hướng dẫn cư dân chuyển nốt
function pickPendingPayment(
  payments: InvoicePaymentInput[],
): PendingPaymentInfo | null {
  const candidate = payments
    .filter(
      (p) =>
        p.status === PaymentStatus.PENDING && p.amount - p.receivedAmount > 0,
    )
    .sort(
      (a, b) => (b.expiresAt?.getTime() ?? 0) - (a.expiresAt?.getTime() ?? 0),
    )[0];

  if (!candidate) return null;

  return {
    orderCode: candidate.orderCode,
    transferContent: candidate.description,
    remainingAmount: candidate.amount - candidate.receivedAmount,
    expiresAt: candidate.expiresAt,
  };
}

// Dựng hóa đơn của một kiện hàng, trả null nếu kiện không có phí và chưa có khoản tiền nào
function buildInvoice(
  pkg: InvoicePackageInput,
  payments: InvoicePaymentInput[],
): Invoice | null {
  const paidList = payments.filter((p) => p.status === PaymentStatus.PAID);
  const pendingList = payments.filter(
    (p) => p.status === PaymentStatus.PENDING,
  );

  const paidAmount = sumBy(paidList, (p) => p.amount);
  const receivedPendingAmount = sumBy(pendingList, (p) => p.receivedAmount);
  const overpaidAmount = sumBy(paidList, (p) =>
    Math.max(0, p.receivedAmount - p.amount),
  );

  // Kiện đã chốt lấy theo số đã trả, kiện đang lưu kho lấy phí hiện tại nhưng không nhỏ hơn số đã có
  const totalFee = pkg.isActive
    ? Math.max(pkg.liveTotalFee, paidAmount + receivedPendingAmount)
    : paidAmount;

  if (totalFee === 0 && receivedPendingAmount === 0) return null;

  const dueAmount = pkg.isActive
    ? Math.max(0, totalFee - paidAmount - receivedPendingAmount)
    : 0;

  return {
    packageId: pkg.packageId,
    trackingNumber: pkg.trackingNumber,
    lockerName: pkg.lockerName,
    boxNumber: pkg.boxNumber,
    packageStatus: pkg.packageStatus,
    status: resolveInvoiceStatus(dueAmount, paidAmount, receivedPendingAmount),
    currentTier: pkg.currentTier,
    totalFee,
    paidAmount,
    receivedPendingAmount,
    dueAmount,
    overpaidAmount,
    needsRefundReview:
      !pkg.isActive && (receivedPendingAmount > 0 || overpaidAmount > 0),
    pendingPayment: pkg.isActive ? pickPendingPayment(payments) : null,
    payments: buildInvoicePayments(payments),
  };
}

// Gom kiện hàng và phiên thanh toán của cư dân thành hóa đơn theo kiện và biên nhận gói tháng
export function buildInvoices(
  packages: InvoicePackageInput[],
  payments: InvoicePaymentInput[],
): BuildInvoicesResult {
  const relevant = payments.filter(
    (p) =>
      p.status === PaymentStatus.PAID || p.status === PaymentStatus.PENDING,
  );

  const subscriptionReceipts = relevant
    .filter(
      (p) =>
        p.paymentType === PaymentType.MONTHLY_SUBSCRIPTION &&
        p.status === PaymentStatus.PAID,
    )
    .map((p) => ({
      orderCode: p.orderCode,
      amount: p.amount,
      paidAt: p.paidAt,
      sepayTransactionId: p.sepayTransactionId,
    }))
    .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0));

  const packagePayments = relevant.filter(
    (p) => p.paymentType !== PaymentType.MONTHLY_SUBSCRIPTION && p.packageId,
  );

  const entries: { invoice: Invoice; activity: number }[] = [];
  packages.forEach((pkg) => {
    const invoice = buildInvoice(
      pkg,
      packagePayments.filter((p) => p.packageId === pkg.packageId),
    );
    if (!invoice) return;

    const paidTimes = invoice.payments.map((p) => p.paidAt?.getTime() ?? 0);
    entries.push({
      invoice,
      activity: Math.max(pkg.droppedOffAt.getTime(), ...paidTimes),
    });
  });

  // Hóa đơn còn nợ lên trước, sau đó theo hoạt động gần nhất
  entries.sort((a, b) => {
    const aDue = a.invoice.dueAmount > 0 ? 1 : 0;
    const bDue = b.invoice.dueAmount > 0 ? 1 : 0;
    return bDue - aDue || b.activity - a.activity;
  });

  return {
    invoices: entries.map((entry) => entry.invoice),
    subscriptionReceipts,
  };
}
