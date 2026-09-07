import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { STORAGE_SERVICE } from './interfaces/storage-service.interface';
import type {
  IStorageService,
  UploadFileResult,
} from './interfaces/storage-service.interface';

@Injectable()
export class UploadService {
  constructor(
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
  ) {}

  // Tải lên ảnh đại diện cá nhân với cấu hình tối ưu nhận diện khuôn mặt và nén tự động
  async uploadAvatar(file: Express.Multer.File): Promise<UploadFileResult> {
    if (!file) {
      throw new BadRequestException(
        'Vui lòng chọn tệp tin ảnh đại diện hợp lệ',
      );
    }

    return this.storageService.uploadFile(file, {
      folder: 'smart-locker/avatars',
      transformation: [
        { width: 300, height: 300, crop: 'fill', gravity: 'face' },
        { fetch_format: 'auto', quality: 'auto' },
      ],
    });
  }

  // Tải lên ảnh chứng từ hoặc ảnh chụp kiện hàng bưu phẩm tại trạm tủ
  async uploadPackageImage(
    file: Express.Multer.File,
  ): Promise<UploadFileResult> {
    if (!file) {
      throw new BadRequestException(
        'Vui lòng chọn tệp tin ảnh bưu phẩm hợp lệ',
      );
    }

    return this.storageService.uploadFile(file, {
      folder: 'smart-locker/packages',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { fetch_format: 'auto', quality: 'auto' },
      ],
    });
  }

  // Xóa tệp tin đã lưu trữ trên hạ tầng đám mây
  async deleteFile(publicId: string): Promise<boolean> {
    if (!publicId) return false;
    return this.storageService.deleteFile(publicId);
  }
}
