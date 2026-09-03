import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import { BoxSize, BoxStatus, DoorStatus } from '../enums';

// ngăn tủ
@Schema({ timestamps: true })
export class Box extends Document {
  // Trạm tủ sở hữu ngăn này
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Locker',
    required: true,
    index: true,
  })
  lockerId: Types.ObjectId;

  // Số thứ tự của ngăn tủ được dán trên mặt cánh tủ
  @Prop({ required: true, min: 1 })
  boxNumber: number;

  // Kích thước của ngăn tủ
  @Prop({
    type: String,
    enum: BoxSize,
    default: BoxSize.MEDIUM,
  })
  size: BoxSize;

  // Trạng thái sử dụng của ngăn tủ
  @Prop({
    type: String,
    enum: BoxStatus,
    default: BoxStatus.AVAILABLE,
    index: true,
  })
  status: BoxStatus;

  // Trạng thái đóng hoặc mở cánh cửa từ cảm biến công tắc từ
  @Prop({
    type: String,
    enum: DoorStatus,
    default: DoorStatus.CLOSED,
  })
  doorStatus: DoorStatus;

  // Trạng thái phát hiện bưu kiện từ cảm biến quang học hồng ngoại
  @Prop({ default: false })
  hasItem: boolean;

  // Bưu kiện hiện tại đang được lưu trữ bên trong ngăn
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Package',
    required: false,
  })
  currentPackageId?: Types.ObjectId;
}

export const BoxSchema = SchemaFactory.createForClass(Box);

// Đảm bảo trong cùng 1 trạm tủ không bao giờ trùng lặp số ngăn
BoxSchema.index({ lockerId: 1, boxNumber: 1 }, { unique: true });

// Tối ưu hóa truy vấn tìm kiếm ngăn trống theo kích thước cho tài xế giao hàng
BoxSchema.index({ lockerId: 1, status: 1, size: 1 });
