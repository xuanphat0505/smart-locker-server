// Kiểu dữ liệu dùng chung cho tích hợp hóa đơn điện tử SePay eInvoice

export interface EInvoiceBuyer {
  name: string;
  email: string;
  phone?: string;
}

export interface EInvoiceItem {
  line_number: number;
  line_type: number;
  item_code: string;
  item_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
}

// Nội dung gửi lên POST /v1/invoices/create
export interface CreateInvoicePayload {
  template_code: string;
  invoice_series: string;
  issued_date: string;
  currency: string;
  provider_account_id: string;
  reference_code: string;
  payment_method: string;
  is_draft: boolean;
  buyer: EInvoiceBuyer;
  items: EInvoiceItem[];
  total_amount: number;
  notes?: string;
}

// Hóa đơn đã phát hành nằm trong phản hồi create/check khi thành công
export interface IssuedInvoice {
  reference_code: string;
  invoice_number: string;
  invoice_series: string;
  issued_date: string;
  pdf_url: string;
  xml_url?: string;
  status: string;
  total_amount: number;
}

// Kết quả hỏi trạng thái tạo hóa đơn: Pending khi đang xử lý, Success kèm hóa đơn khi xong
export interface CreateCheckResult {
  reference_code: string;
  status: string;
  message?: string;
  invoice?: IssuedInvoice;
}

// Lỗi trả về từ API eInvoice, giữ mã trạng thái HTTP và mã lỗi để xử lý riêng từng trường hợp
export class EInvoiceApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'EInvoiceApiError';
  }
}
