// Phân loại nhóm lĩnh vực thông báo trong hệ thống trạm tủ thông minh
export enum NotificationCategory {
  ACCOUNT = 'ACCOUNT',
  HARDWARE = 'HARDWARE',
  PACKAGE = 'PACKAGE',
  SYSTEM = 'SYSTEM',
}

// Mức độ ưu tiên và khẩn cấp của thông báo
export enum NotificationPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// Danh mục chi tiết các mã sự kiện thông báo cho cả Admin và Cư Dân
export enum NotificationType {
  // Nhóm tài khoản và xác thực cư dân
  RESIDENT_REGISTRATION_PENDING = 'RESIDENT_REGISTRATION_PENDING',
  RESIDENT_ACCOUNT_UPDATED = 'RESIDENT_ACCOUNT_UPDATED',
  RESIDENT_APPROVED = 'RESIDENT_APPROVED',
  RESIDENT_REJECTED = 'RESIDENT_REJECTED',

  // Nhóm phần cứng trạm tủ và cảm biến IoT
  LOCKER_OFFLINE = 'LOCKER_OFFLINE',
  LOCKER_ONLINE = 'LOCKER_ONLINE',
  LOCKER_DOOR_FORCED = 'LOCKER_DOOR_FORCED',
  LOCKER_DOOR_LEFT_OPEN = 'LOCKER_DOOR_LEFT_OPEN',
  LOCKER_HARDWARE_FAULT = 'LOCKER_HARDWARE_FAULT',
  LOCKER_CAPACITY_WARNING = 'LOCKER_CAPACITY_WARNING',

  // Nhóm bưu kiện và luồng nhận trả hàng
  PACKAGE_ARRIVED = 'PACKAGE_ARRIVED',
  PACKAGE_PICKED_UP = 'PACKAGE_PICKED_UP',
  PACKAGE_OVERDUE = 'PACKAGE_OVERDUE',
  PACKAGE_DAMAGED_REPORTED = 'PACKAGE_DAMAGED_REPORTED',
  PACKAGE_MANUAL_OVERRIDE = 'PACKAGE_MANUAL_OVERRIDE',

  // Nhóm thông báo chung và an ninh tòa nhà
  SYSTEM_ANNOUNCEMENT = 'SYSTEM_ANNOUNCEMENT',
  SECURITY_ALERT = 'SECURITY_ALERT',
}
