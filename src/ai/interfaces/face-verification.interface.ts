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

// Định nghĩa điểm tọa độ mốc đặc trưng trên khuôn mặt
export interface LandmarkPoint {
  x: number;
  y: number;
}

// Định nghĩa 5 điểm mốc chuẩn của khuôn mặt do YuNet phát hiện
export interface FacialLandmarks {
  rightEye: LandmarkPoint;
  leftEye: LandmarkPoint;
  noseTip: LandmarkPoint;
  rightMouth: LandmarkPoint;
  leftMouth: LandmarkPoint;
}

// Định nghĩa dữ liệu vị trí khuôn mặt do YuNet phát hiện
export interface FaceDetectionMetadata {
  detected: boolean;
  confidence?: number;
  box?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  landmarks?: FacialLandmarks;
  cropApplied: boolean;
}

// Định nghĩa kết quả kiểm tra so khớp khuôn mặt độc lập không có tác dụng phụ mở tủ
export interface CheckFaceMatchResult {
  isMatch: boolean;
  isReal: boolean;
  livenessScore: number;
  matchScore: number;
  threshold: number;
  faceDetection?: FaceDetectionMetadata;
  croppedFaceBase64?: string;
  matchedResident?: {
    userId: string;
    name: string;
    phone: string;
    apartment?: string;
  };
  matchedPackage?: {
    packageId: string;
    trackingNumber: string;
    boxNumber: number;
    status: string;
  };
  candidateCount: number;
  message?: string;
  inferenceTimeMs: number;
  dryRun: boolean;
}
