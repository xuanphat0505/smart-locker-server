// Thoát các ký tự đặc biệt của biểu thức chính quy để dùng chuỗi người dùng nhập làm điều kiện tìm kiếm an toàn
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// Mã hóa các ký tự đặc biệt của HTML để dữ liệu do người dùng nhập không thể chèn thẻ hoặc liên kết vào nội dung email
export function escapeHtml(value: string | undefined | null): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

// Đổi số điện thoại Việt Nam sang định dạng quốc tế E.164 (+84...) để gửi SMS
export function toE164Vn(phone: string): string {
  const compact = phone.trim().replace(/[\s.-]/g, '');
  if (compact.startsWith('+84')) return compact;
  if (compact.startsWith('84') && compact.length === 11) return `+${compact}`;
  if (compact.startsWith('0')) return `+84${compact.slice(1)}`;
  return compact;
}

// Chuẩn hóa mã nhập vào về dạng chữ hoa không khoảng trắng hai đầu, dùng cho mã trạm tủ, mã vận đơn
export function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

// Lấy nội dung thông báo từ giá trị bắt được trong catch để ghi log
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
