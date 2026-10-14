// Nhóm vấn đề được báo cáo
export enum IssueCategory {
  LOCKER = 'LOCKER',
  OTP = 'OTP',
  PARCEL = 'PARCEL',
  APP = 'APP',
}

// Mức ưu tiên xử lý phiếu
export enum IssuePriority {
  URGENT = 'URGENT',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

// Vòng đời của một phiếu báo lỗi
export enum IssueStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

// Các chuyển trạng thái hợp lệ qua PATCH status; chuyển sang ESCALATED chỉ đi qua route leo thang riêng
export const ISSUE_STATUS_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  [IssueStatus.PENDING]: [IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED],
  [IssueStatus.IN_PROGRESS]: [IssueStatus.RESOLVED],
  [IssueStatus.ESCALATED]: [IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED],
  [IssueStatus.RESOLVED]: [IssueStatus.CLOSED, IssueStatus.IN_PROGRESS],
  [IssueStatus.CLOSED]: [],
};

// Trạng thái mà Ban Quản Lý còn được phép leo thang lên Super Admin
export const ESCALATABLE_STATUSES: IssueStatus[] = [
  IssueStatus.PENDING,
  IssueStatus.IN_PROGRESS,
];

// Giới hạn tệp đính kèm của một phiếu
export const ISSUE_MAX_ATTACHMENTS = 3;
export const ISSUE_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ISSUE_ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];
