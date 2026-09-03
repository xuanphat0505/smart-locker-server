import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import { LockerStatus } from '../enums';

// trạm tủ
@Schema({ timestamps: true })
export class Locker extends Document {
  // Tên hiển thị của trạm tủ
  @Prop({ required: true, trim: true })
  name: string;

  // Mã định danh duy nhất của trạm tủ
  @Prop({
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  })
  code: string;

  // Tòa nhà nơi đặt trạm tủ
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Building',
    required: true,
    index: true,
  })
  buildingId: Types.ObjectId;

  // Tổng số lượng ngăn tủ vật lý
  @Prop({ required: true, min: 1 })
  totalBoxes: number;

  // Địa chỉ MAC phần cứng của bộ vi điều khiển IoT
  @Prop({
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  })
  macAddress: string;

  // Khóa bí mật dùng để xác thực các request từ bo mạch IoT Kiosk hoặc ESP32
  @Prop({ required: true, select: false })
  apiKey: string;

  // Trạng thái vận hành của trạm tủ
  @Prop({
    type: String,
    enum: LockerStatus,
    default: LockerStatus.ONLINE,
    index: true,
  })
  status: LockerStatus;

  // Mô tả vị trí chi tiết đặt tủ trong tòa nhà
  @Prop({ required: false, trim: true })
  locationDescription?: string;

  // Tọa độ địa lý GPS độc lập phục vụ định vị và đo khoảng cách
  @Prop({
    type: {
      latitude: { type: Number, required: false },
      longitude: { type: Number, required: false },
    },
    _id: false,
    required: false,
  })
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export const LockerSchema = SchemaFactory.createForClass(Locker);
