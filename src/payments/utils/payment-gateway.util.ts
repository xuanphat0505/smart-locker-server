import { randomInt } from 'crypto';
import * as https from 'https';
import * as querystring from 'querystring';
import { SePayPgClient } from 'sepay-pg-node';

// Khởi tạo đối tượng SePayPgClient từ thông tin cấu hình môi trường
export function getSepayPgClient(): SePayPgClient {
  const env = (process.env.SEPAY_ENV as 'sandbox' | 'production') || 'sandbox';
  const merchantId = process.env.SEPAY_MERCHANT_ID || process.env.MERCHANT_ID || '';
  const secretKey = process.env.SEPAY_SECRET_KEY || process.env.SECRET_KEY || '';

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

  const checkoutPayload: Parameters<typeof client.checkout.initOneTimePaymentFields>[0] = {
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
            reject(new Error(`Khong tim thay redirect location header: status ${res.statusCode}`));
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
export function generateSepayTransferContent(type: 'LOCKER' | 'SUB', orderCode: number): string {
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
export async function lookupOrderInvoiceByPayCode(payCode: string): Promise<number | null> {
  try {
    const client = getSepayPgClient();
    const res = await client.order.all({ q: payCode });
    const orders = res?.data?.data || res?.data;

    if (Array.isArray(orders) && orders.length > 0) {
      const matched =
        orders.find((o: any) => o.order_id?.toUpperCase() === payCode.toUpperCase()) || orders[0];

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
  const { bankName, accountNumber, amount, description, template = 'compact' } = params;
  const encodedBank = encodeURIComponent(bankName);
  const encodedDesc = encodeURIComponent(description);

  return `https://qr.sepay.vn/img?acc=${accountNumber}&bank=${encodedBank}&amount=${amount}&des=${encodedDesc}&template=${template}`;
}

// Sinh mã số giao dịch nguyên dương duy nhất có độ dài an toàn cho SePay
export function generateOrderCode(): number {
  const timeSlice = Date.now().toString().slice(-6);
  const randomPart = randomInt(1000, 10000).toString();
  return parseInt(`${timeSlice}${randomPart}`, 10);
}

// Tính toán mã băm CRC16-CCITT theo tiêu chuẩn EMVCo QR
function calculateCrc16Ccitt(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Sinh chuỗi văn bản EMVCo chuẩn NAPAS 247 để mạch ESP32 tự vẽ mã QR lên màn hình LCD
export function generateVietQrPayload(params: {
  bankBin: string;
  accountNumber: string;
  amount: number;
  description: string;
}): string {
  const { bankBin, accountNumber, amount, description } = params;

  const beneficiaryInfo = `0006${bankBin}01${accountNumber.length.toString().padStart(2, '0')}${accountNumber}`;
  const tag38 = `0010A00000072701${beneficiaryInfo.length.toString().padStart(2, '0')}${beneficiaryInfo}0208QRIBFTTA`;

  const rawPayloadWithoutCrc = [
    '000201',
    '010212',
    `38${tag38.length.toString().padStart(2, '0')}${tag38}`,
    '5303704',
    `54${amount.toString().length.toString().padStart(2, '0')}${amount}`,
    '5802VN',
    `62${(description.length + 4).toString().padStart(2, '0')}08${description.length.toString().padStart(2, '0')}${description}`,
    '6304',
  ].join('');

  const crc = calculateCrc16Ccitt(rawPayloadWithoutCrc);
  return `${rawPayloadWithoutCrc}${crc}`;
}

// Thông tin tài khoản ngân hàng đã đủ để dựng mã QR và đối soát tiền
export interface ConfiguredBankAccount {
  bankBin: string;
  accountNumber: string;
  accountName: string;
  bankName?: string;
}

// Đối tượng có thể chứa tài khoản ngân hàng thụ hưởng, thường là tòa nhà
interface HasBankAccount {
  bankAccount?: {
    bankBin?: string;
    accountNumber?: string;
    accountName?: string;
    bankName?: string;
  } | null;
}

// Kiểm tra tòa nhà đã có đủ bankBin, accountNumber và accountName; dùng kiểu khẳng định để các đoạn sau truy cập tài khoản mà không cần kiểm tra lại
export function isPaymentConfigured<T extends HasBankAccount>(
  building: T | null | undefined,
): building is T & { bankAccount: ConfiguredBankAccount } {
  const bank = building?.bankAccount;
  return Boolean(bank?.bankBin && bank?.accountNumber && bank?.accountName);
}
