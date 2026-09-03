// Định nghĩa các trạng thái hoạt động của trạm tủ thông minh
export enum LockerStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  MAINTENANCE = 'MAINTENANCE',
}

// Định nghĩa trạng thái sử dụng của từng ngăn tủ con
export enum BoxStatus {
  AVAILABLE = 'AVAILABLE', // Ngăn trống sẵn sàng nhận bưu kiện mới
  OCCUPIED = 'OCCUPIED', // Ngăn đang lưu trữ bưu phẩm chưa lấy
  MAINTENANCE = 'MAINTENANCE', // Ngăn bị kẹt khóa hoặc tạm dừng phục vụ
}

// Định nghĩa phân loại kích cỡ vật lý của từng ngăn tủ
export enum BoxSize {
  SMALL = 'SMALL', // Ngăn nhỏ (10x40x45cm) cho tài liệu, điện thoại, phụ kiện
  MEDIUM = 'MEDIUM', // Ngăn vừa (20x40x45cm) cho hộp giày, quần áo, bưu phẩm chuẩn
  LARGE = 'LARGE', // Ngăn lớn (35x40x45cm) cho thùng hàng to, thiết bị gia dụng
}

// Định nghĩa trạng thái đóng mở cơ học của cánh cửa ngăn tủ từ cảm biến từ
export enum DoorStatus {
  CLOSED = 'CLOSED', // Cánh cửa đang đóng kín chốt
  OPEN = 'OPEN', // Cánh cửa đang mở
}

// Định nghĩa các loại hành động tác động cơ học đóng/mở chốt khóa ngăn tủ
export enum LockerAction {
  DROP_OFF = 'DROP_OFF', // Tài xế mở tủ bỏ kiện hàng vào
  PICKUP_OTP = 'PICKUP_OTP', // Cư dân nhập mã OTP 6 số tại tủ để lấy hàng
  PICKUP_QR = 'PICKUP_QR', // Cư dân quét mã QR token tại tủ để lấy hàng
  REMOTE_OPEN = 'REMOTE_OPEN', // Ban Quản Lý mở khóa khẩn cấp từ xa
  FORCE_OPEN = 'FORCE_OPEN', // Kỹ thuật viên mở cưỡng bức cơ học khi xử lý sự cố kẹt tủ
  OVERDUE_RETRIEVAL = 'OVERDUE_RETRIEVAL', // Thu hồi bưu kiện quá hạn lưu kho
}
