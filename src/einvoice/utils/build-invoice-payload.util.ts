import { PaymentType } from '../../payments/enums/payment.enums';
import { CreateInvoicePayload } from '../einvoice.types';

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export interface BuildInvoicePayloadInput {
  orderCode: number;
  amount: number;
  paymentType: PaymentType;
  trackingNumber?: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  templateCode: string;
  invoiceSeries: string;
  providerAccountId: string;
  issuedAt: Date;
}

// Mã tham chiếu duy nhất của hóa đơn theo mã đơn thanh toán, dùng để chống tạo trùng
export function buildReferenceCode(orderCode: number): string {
  return `INV-${orderCode}`;
}

// Định dạng thời điểm theo giờ Việt Nam thành YYYY-MM-DD HH:mm:ss mà SePay yêu cầu cho ngày phát hành
export function formatIssuedDate(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace('T', ' ');
}

// Chọn mã hàng, tên hàng và đơn vị tính theo loại thanh toán
function resolveLineItem(
  paymentType: PaymentType,
  trackingNumber?: string,
): { code: string; name: string; unit: string } {
  if (paymentType === PaymentType.MONTHLY_SUBSCRIPTION) {
    return {
      code: 'GOI_THANG',
      name: 'Gói thành viên Smart Locker 30 ngày',
      unit: 'gói',
    };
  }
  return {
    code: 'PHI_LUU_KHO',
    name: trackingNumber
      ? `Phí lưu kho bưu kiện ${trackingNumber}`
      : 'Phí lưu kho bưu kiện',
    unit: 'lần',
  };
}

// Dựng nội dung tạo hóa đơn bán hàng một dòng, phát hành ngay (is_draft = false), không khai thuế
export function buildInvoicePayload(
  input: BuildInvoicePayloadInput,
): CreateInvoicePayload {
  const line = resolveLineItem(input.paymentType, input.trackingNumber);

  return {
    template_code: input.templateCode,
    invoice_series: input.invoiceSeries,
    issued_date: formatIssuedDate(input.issuedAt),
    currency: 'VND',
    provider_account_id: input.providerAccountId,
    reference_code: buildReferenceCode(input.orderCode),
    payment_method: 'CK',
    is_draft: false,
    buyer: {
      name: input.buyerName,
      email: input.buyerEmail,
      ...(input.buyerPhone ? { phone: input.buyerPhone } : {}),
    },
    items: [
      {
        line_number: 1,
        line_type: 1,
        item_code: line.code,
        item_name: line.name,
        unit: line.unit,
        quantity: 1,
        unit_price: input.amount,
      },
    ],
    total_amount: input.amount,
    notes: `Hóa đơn thử nghiệm sandbox, mã đơn ${input.orderCode}`,
  };
}
