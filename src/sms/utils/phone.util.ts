// Đổi số điện thoại Việt Nam sang định dạng quốc tế E.164 (+84...) để gửi SMS
export function toE164Vn(phone: string): string {
  const compact = phone.trim().replace(/[\s.-]/g, '');
  if (compact.startsWith('+84')) return compact;
  if (compact.startsWith('84') && compact.length === 11) return `+${compact}`;
  if (compact.startsWith('0')) return `+84${compact.slice(1)}`;
  return compact;
}
