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

// Tạo URL ảnh mã VietQR theo chuẩn mở NAPAS phục vụ hiển thị trên Mobile App và Web
export function generateVietQrUrl(params: {
  bankBin: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  description: string;
  template?: string;
}): string {
  const {
    bankBin,
    accountNumber,
    accountName,
    amount,
    description,
    template = 'compact2',
  } = params;
  const encodedName = encodeURIComponent(accountName);
  const encodedDesc = encodeURIComponent(description);

  return `https://img.vietqr.io/image/${bankBin}-${accountNumber}-${template}.png?amount=${amount}&addInfo=${encodedDesc}&accountName=${encodedName}`;
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

// Sinh mã số giao dịch nguyên dương duy nhất có độ dài an toàn cho VietQR và PayOS
export function generateOrderCode(): number {
  const timeSlice = Date.now().toString().slice(-6);
  const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
  return parseInt(`${timeSlice}${randomPart}`, 10);
}
