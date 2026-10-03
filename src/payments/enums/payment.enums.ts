// Định nghĩa trạng thái của phiên giao dịch thanh toán
export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

// Định nghĩa mục đích thanh toán của cư dân
export enum PaymentType {
  OVERDUE_PICKUP = 'OVERDUE_PICKUP',
  STORAGE_EXTENSION = 'STORAGE_EXTENSION',
  MONTHLY_SUBSCRIPTION = 'MONTHLY_SUBSCRIPTION',
}

// Định nghĩa phương thức thanh toán
export enum PaymentMethod {
  VIETQR = 'VIETQR',
  SANDBOX = 'SANDBOX',
}
