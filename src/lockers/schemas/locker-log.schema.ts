import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import { LockerAction } from '../enums';

// Thực thể nhật ký ghi vết toàn bộ các tác vụ đóng mở khóa ngăn tủ
@Schema({ timestamps: true })
export class LockerLog extends Document {
  // Trạm tủ thực hiện hành động
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Locker',
    required: true,
    index: true,
  })
  lockerId: Types.ObjectId;

  // Số ngăn tủ bị tác động
  @Prop({ required: true, min: 1 })
  boxNumber: number;

  // Bưu kiện gắn liền với hành động mở tủ nếu có
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Package',
    required: false,
    index: true,
  })
  packageId?: Types.ObjectId;

  // Loại hành động tác động tới ngăn tủ
  @Prop({
    type: String,
    enum: LockerAction,
    required: true,
  })
  action: LockerAction;

  // Người thực hiện hành động lưu số điện thoại hoặc mã định danh
  @Prop({ required: true, trim: true })
  performedBy: string;

  // Kết quả thực thi
  @Prop({ required: true, enum: ['SUCCESS', 'FAILED'] })
  status: string;

  // Dữ liệu mở rộng lưu ngữ cảnh lỗi hoặc thông số cảm biến
  @Prop({ type: Object, required: false })
  metadata?: Record<string, any>;
}

export const LockerLogSchema = SchemaFactory.createForClass(LockerLog);

// Đánh chỉ mục phục vụ truy xuất lịch sử thao tác của từng trạm tủ
LockerLogSchema.index({ lockerId: 1, createdAt: -1 });

// Đánh chỉ mục phục vụ truy xuất đối soát lịch sử của từng kiện hàng
LockerLogSchema.index({ packageId: 1, createdAt: -1 });
