// Thoát các ký tự đặc biệt của biểu thức chính quy để dùng chuỗi người dùng nhập làm điều kiện tìm kiếm an toàn
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
