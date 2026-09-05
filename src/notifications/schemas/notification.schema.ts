import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from '../enums/notification.enums';

export type NotificationDocument = Notification & Document;

// Thực thể thông báo lưu trữ toàn bộ lịch sử thông báo của cư dân và quản trị viên
@Schema({
  timestamps: true,
  collection: 'notifications',
})
export class Notification extends Document {
  // Người nhận thông báo trực tiếp
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  recipientId: Types.ObjectId;

  // Tòa nhà gắn liền với bưu kiện hoặc sự kiện trạm tủ
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Building',
    required: false,
    index: true,
  })
  buildingId?: Types.ObjectId;

  // Tiêu đề ngắn gọn của thông báo
  @Prop({ required: true, trim: true })
  title: string;

  // Nội dung chi tiết của thông báo
  @Prop({ required: true, trim: true })
  message: string;

  // Phân loại nhóm lĩnh vực thông báo
  @Prop({
    type: String,
    enum: NotificationCategory,
    required: true,
    index: true,
  })
  category: NotificationCategory;

  // Mã loại sự kiện thông báo cụ thể
  @Prop({
    type: String,
    enum: NotificationType,
    required: true,
    index: true,
  })
  type: NotificationType;

  // Mức độ ưu tiên và cảnh báo
  @Prop({
    type: String,
    enum: NotificationPriority,
    default: NotificationPriority.NORMAL,
    index: true,
  })
  priority: NotificationPriority;

  // Trạng thái đã được người dùng đọc hay chưa
  @Prop({ default: false, index: true })
  isRead: boolean;

  // Mốc thời gian người dùng mở xem thông báo
  @Prop({ type: Date, default: null })
  readAt?: Date;

  // Đường dẫn điều hướng nhanh khi người dùng chạm vào thông báo
  @Prop({ type: String, default: null })
  actionUrl?: string;

  // Dữ liệu mở rộng chứa các ID tham chiếu như lockerId, boxNumber, packageId
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: Record<string, any>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Chỉ mục hỗ trợ truy vấn danh sách thông báo hộp thư cá nhân mới nhất
NotificationSchema.index({ recipientId: 1, createdAt: -1 });

// Chỉ mục tối ưu hóa đếm số lượng thông báo chưa đọc
NotificationSchema.index({ recipientId: 1, isRead: 1 });

// Chỉ mục lọc theo nhóm lĩnh vực và mức độ ưu tiên
NotificationSchema.index({
  recipientId: 1,
  category: 1,
  priority: 1,
  createdAt: -1,
});

// Chỉ mục hỗ trợ quét sự cố và thông báo theo phạm vi tòa nhà
NotificationSchema.index({
  buildingId: 1,
  category: 1,
  priority: 1,
  createdAt: -1,
});

// Chỉ mục tự động dọn dẹp các thông báo cũ sau 90 ngày nhằm tối ưu dung lượng lưu trữ
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);
