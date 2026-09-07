import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { CloudinaryStorageService } from './services/cloudinary-storage.service';
import { STORAGE_SERVICE } from './interfaces/storage-service.interface';

@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: CloudinaryStorageService,
    },
    UploadService,
  ],
  exports: [UploadService, STORAGE_SERVICE],
})
export class UploadModule {}
