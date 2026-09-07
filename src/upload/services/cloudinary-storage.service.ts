import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiOptions } from 'cloudinary';
import { Readable } from 'stream';
import {
  IStorageService,
  UploadFileOptions,
  UploadFileResult,
} from '../interfaces/storage-service.interface';

@Injectable()
export class CloudinaryStorageService implements IStorageService {
  private readonly logger = new Logger(CloudinaryStorageService.name);
  private isConfigured = false;

  constructor(private readonly configService: ConfigService) {
    this.initCloudinary();
  }

  // Khởi tạo cấu hình Cloudinary SDK từ các biến môi trường
  private initCloudinary(): void {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isConfigured = true;
      this.logger.log('Đã kết nối thành công dịch vụ Cloudinary Storage');
    } else {
      this.logger.warn(
        'Chưa cấu hình thông tin xác thực Cloudinary trong file môi trường .env',
      );
    }
  }

  // Chuẩn hóa và trích xuất mã định danh publicId từ chuỗi đầu vào hoặc đường dẫn URL
  private sanitizePublicId(publicIdOrUrl: string): string {
    if (!publicIdOrUrl) return '';
    let clean = publicIdOrUrl.trim();

    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      const match = clean.match(/\/upload\/(?:v\d+\/)?(.+)$/);
      if (match && match[1]) {
        clean = match[1];
      }
    }

    return clean.replace(/\.[^/.]+$/, '');
  }

  // Tải tệp tin ảnh dạng stream buffer lên dịch vụ đám mây Cloudinary
  async uploadFile(
    file: Express.Multer.File,
    options: UploadFileOptions = {},
  ): Promise<UploadFileResult> {
    if (!this.isConfigured) {
      throw new InternalServerErrorException(
        'Dịch vụ lưu trữ đám mây Cloudinary chưa được cấu hình đầy đủ trên hệ thống',
      );
    }

    if (!file || !file.buffer) {
      throw new BadRequestException(
        'Tệp tin tải lên không hợp lệ hoặc dữ liệu bị rỗng',
      );
    }

    const uploadOptions: UploadApiOptions = {
      folder: options.folder || 'smart-locker/general',
      resource_type: 'auto',
      ...(options.transformation
        ? { transformation: options.transformation }
        : {}),
    };

    return new Promise<UploadFileResult>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error || !result) {
            this.logger.error('Lỗi khi tải tệp tin lên Cloudinary:', error);
            const isPermissionDenied =
              error?.message?.includes('missing permissions') ||
              error?.http_code === 403;
            const message = isPermissionDenied
              ? 'Khóa API Cloudinary thiếu quyền tạo tệp tin, vui lòng cấp quyền Upload trên bảng điều khiển Cloudinary'
              : `Không thể lưu trữ tệp tin lên máy chủ ảnh: ${error?.message || 'Lỗi không xác định'}`;
            return reject(new InternalServerErrorException(message));
          }

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            size: result.bytes,
            format: result.format,

            mimetype: file.mimetype,
          });
        },
      );

      uploadStream.on('error', (streamErr) => {
        this.logger.error(
          'Lỗi luồng truyền tệp tin lên Cloudinary:',
          streamErr,
        );
        reject(
          new InternalServerErrorException(
            'Lỗi trong tiến trình truyền dữ liệu tệp tin lên máy chủ lưu trữ',
          ),
        );
      });

      const readableStream = Readable.from(file.buffer);
      readableStream.on('error', (readErr) => {
        this.logger.error('Lỗi đọc dữ liệu tệp tin đầu vào:', readErr);
        reject(
          new BadRequestException(
            'Không thể đọc dữ liệu tệp tin được cung cấp',
          ),
        );
      });

      readableStream.pipe(uploadStream);
    });
  }

  // Xóa vĩnh viễn tệp tin ảnh khỏi máy chủ đám mây dựa trên mã định danh publicId
  async deleteFile(publicId: string): Promise<boolean> {
    if (!this.isConfigured || !publicId) {
      return false;
    }

    try {
      const cleanPublicId = this.sanitizePublicId(publicId);
      const destroyResponse = (await cloudinary.uploader.destroy(
        cleanPublicId,
      )) as { result?: string };
      return destroyResponse?.result === 'ok';
    } catch (error) {
      this.logger.error(
        `Lỗi khi xóa tệp tin ${publicId} trên Cloudinary:`,
        error,
      );
      return false;
    }
  }
}
