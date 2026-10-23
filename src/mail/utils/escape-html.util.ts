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
