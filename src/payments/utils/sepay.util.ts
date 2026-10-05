import * as https from 'https';
import * as querystring from 'querystring';
import { SePayPgClient } from 'sepay-pg-node';

// Khởi tạo đối tượng SePayPgClient từ thông tin cấu hình môi trường
export function getSepayPgClient(): SePayPgClient {
  const env = (process.env.SEPAY_ENV as 'sandbox' | 'production') || 'sandbox';
  const merchantId =
    process.env.SEPAY_MERCHANT_ID || process.env.MERCHANT_ID || '';
  const secretKey =
    process.env.SEPAY_SECRET_KEY || process.env.SECRET_KEY || '';

  return new SePayPgClient({
    env,
    merchant_id: merchantId,
    secret_key: secretKey,
  });
}

// Khởi tạo tập hợp các trường thanh toán kèm chữ ký số bảo mật bằng SDK SePayPgClient
export function initSepayOneTimePaymentFields(params: {
  orderCode: number;
  amount: number;
  description: string;
  successUrl?: string;
  errorUrl?: string;
  cancelUrl?: string;
}) {
  const client = getSepayPgClient();

  const checkoutPayload: Parameters<
    typeof client.checkout.initOneTimePaymentFields
  >[0] = {
    payment_method: 'BANK_TRANSFER',
    order_invoice_number: String(params.orderCode),
    order_amount: params.amount,
    currency: 'VND',
    order_description: params.description,
  };

  // Chỉ gắn URL chuyển hướng nếu được yêu cầu rõ ràng, mặc định để trống để SePay cố định trang biên lai thành công
  if (params.successUrl) {
    checkoutPayload.success_url = params.successUrl;
  }
  if (params.errorUrl) {
    checkoutPayload.error_url = params.errorUrl;
  }
  if (params.cancelUrl) {
    checkoutPayload.cancel_url = params.cancelUrl;
  }

  return client.checkout.initOneTimePaymentFields(checkoutPayload);
}

// Tạo đường dẫn cổng thanh toán trực tuyến SePay Checkout sử dụng SDK SePayPgClient
export async function generateSepayCheckoutUrl(params: {
  orderCode: number;
  amount: number;
  description: string;
  successUrl?: string;
  errorUrl?: string;
  cancelUrl?: string;
}): Promise<string> {
  const client = getSepayPgClient();
  const initUrl = client.checkout.initCheckoutUrl();
  const formFields = initSepayOneTimePaymentFields(params);

  try {
    const postData = querystring.stringify(formFields);
    const parsedUrl = new URL(initUrl);

    const redirectUrl = await new Promise<string>((resolve, reject) => {
      const req = https.request(
        {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: parsedUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
          },
        },
        (res) => {
          if (res.headers.location) {
            resolve(res.headers.location);
          } else {
            reject(
              new Error(
                `Khong tim thay redirect location header: status ${res.statusCode}`,
              ),
            );
          }
        },
      );

      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    return redirectUrl;
  } catch {
    const queryParams = new URLSearchParams();
    Object.entries(formFields).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        queryParams.append(key, String(val));
      }
    });

    return `${initUrl}?${queryParams.toString()}`;
  }
}

// Tạo nội dung chuyển khoản chuẩn hóa cho cổng thanh toán SePay
export function generateSepayTransferContent(
  type: 'LOCKER' | 'SUB',
  orderCode: number,
): string {
  return `${type}${orderCode}`;
}

// Trích xuất mã giao dịch orderCode từ nội dung chuyển khoản SePay
export function parseOrderCodeFromContent(content: string): number | null {
  if (!content) {
    return null;
  }

  const prefixMatch = content.match(/(?:LOCKER|SUB|OVERDUE)\s*(\d+)/i);
  if (prefixMatch && prefixMatch[1]) {
    return parseInt(prefixMatch[1], 10);
  }

  return null;
}

// Trích xuất mã phiên SePay PG dạng PAY từ nội dung chuyển khoản ngân hàng
export function parseSepayPgCodeFromContent(content: string): string | null {
  if (!content) {
    return null;
  }

  const payMatch = content.match(/\b(PAY[A-Z0-9]+)\b/i);
  return payMatch ? payMatch[1].toUpperCase() : null;
}

// Tra cứu mã đơn hàng nội bộ từ mã phiên SePay PG bằng SePay SDK
export async function lookupOrderInvoiceByPayCode(
  payCode: string,
): Promise<number | null> {
  try {
    const client = getSepayPgClient();
    const res = await client.order.all({ q: payCode });
    const orders = res?.data?.data || res?.data;

    if (Array.isArray(orders) && orders.length > 0) {
      const matched =
        orders.find(
          (o: any) => o.order_id?.toUpperCase() === payCode.toUpperCase(),
        ) || orders[0];

      if (matched?.order_invoice_number) {
        return parseInt(matched.order_invoice_number, 10);
      }
    }
  } catch (error) {
    // Bỏ qua lỗi tra cứu API để không làm sập tiến trình webhook
  }

  return null;
}

// Tạo đường dẫn ảnh mã SePay QR phục vụ quét chuyển khoản ngân hàng tự động
export function generateSepayQrUrl(params: {
  bankName: string;
  accountNumber: string;
  amount: number;
  description: string;
  template?: string;
}): string {
  const {
    bankName,
    accountNumber,
    amount,
    description,
    template = 'compact',
  } = params;
  const encodedBank = encodeURIComponent(bankName);
  const encodedDesc = encodeURIComponent(description);

  return `https://qr.sepay.vn/img?acc=${accountNumber}&bank=${encodedBank}&amount=${amount}&des=${encodedDesc}&template=${template}`;
}

// Sinh mã số giao dịch nguyên dương duy nhất có độ dài an toàn cho SePay
export function generateOrderCode(): number {
  const timeSlice = Date.now().toString().slice(-6);
  const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
  return parseInt(`${timeSlice}${randomPart}`, 10);
}
