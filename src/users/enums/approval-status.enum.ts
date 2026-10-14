export enum ApprovalStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
  // Tài khoản đã được duyệt nhưng bị quản trị viên tạm khóa, không đăng nhập được
  SUSPENDED = 'SUSPENDED',
}
