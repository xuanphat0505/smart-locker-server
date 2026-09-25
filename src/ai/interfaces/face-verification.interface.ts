// Định nghĩa kết quả trả về khi xác thực khuôn mặt mở tủ tại Kiosk
export interface VerifyFaceHardwareResult {
  success: boolean;
  boxNumber: number;
  residentName: string;
  residentPhone: string;
  apartment: string;
  trackingNumber: string;
  matchScore: number;
  livenessScore: number;
  inferenceTimeMs: number;
}

// Định nghĩa kết quả trả về khi cư dân đăng ký Face ID thành công
export interface EnrollFaceResult {
  success: boolean;
  livenessScore: number;
  avatarUrl?: string;
  enrolledAt: Date;
  enrolledPosesCount?: number;
}

// Định nghĩa kết quả tiền xử lý ảnh và trích xuất vector khi đăng ký tài khoản
export interface ProcessEnrollmentResult {
  embedding: number[];
  livenessScore: number;
  avatarUrl?: string;
  enrolledPosesCount: number;
}
