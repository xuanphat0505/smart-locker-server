// Giao diện trừu tượng và các kiểu dữ liệu cho dịch vụ lưu trữ tệp tin
export interface UploadFileOptions {
  folder?: string;
  allowedMimeTypes?: string[];
  maxSizeBytes?: number;
  transformation?: Record<string, any>;
}

// Kết quả trả về sau khi tải tệp tin lên hệ thống lưu trữ
export interface UploadFileResult {
  url: string;
  publicId: string;
  size?: number;
  format?: string;
  mimetype?: string;
}

// storgae service
export interface IStorageService {
  uploadFile(
    file: Express.Multer.File,
    options?: UploadFileOptions,
  ): Promise<UploadFileResult>;
  deleteFile(publicId: string): Promise<boolean>;
}

// Token nhận diện injection dependency của dịch vụ lưu trữ
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
