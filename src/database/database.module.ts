import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Module quản lý cấu hình kết nối MongoDB cho toàn bộ ứng dụng
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      // Inject ConfigService để lấy chuỗi kết nối từ biến môi trường
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URL'),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
