// Định nghĩa trạng thái vòng đời của bưu kiện trong hệ sinh thái Smart Locker
export enum PackageStatus {
  WAITING_FOR_PICKUP = 'WAITING_FOR_PICKUP', // Đang lưu trữ trong ngăn tủ chờ cư dân đến lấy
  PICKED_UP = 'PICKED_UP', // Cư dân đã mở tủ và lấy hàng thành công
  OVERDUE = 'OVERDUE', // Quá thời hạn lưu kho tối đa (48 giờ)
  RETURNED = 'RETURNED', // Đã hoàn trả lại cho đơn vị giao vận hoặc chuyển về kho BQL
}
