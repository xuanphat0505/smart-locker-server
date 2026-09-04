import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ShipperSessionDocument = HydratedDocument<ShipperSession>;

// Lược đồ lưu trữ phiên xác thực và mã OTP tạm thời của tài xế giao hàng vãng lai
@Schema({ timestamps: true, collection: 'shipper_sessions' })
export class ShipperSession {
  // Số điện thoại của tài xế (chuẩn hóa 10 số)
  @Prop({ required: true, unique: true, index: true, trim: true })
  phone: string;

  // Mã OTP 6 chữ số gửi qua SMS hoặc Zalo
  @Prop()
  otp?: string;

  // Thời điểm hết hạn của mã OTP (3 phút kể từ khi gửi)
  @Prop()
  otpExpiresAt?: Date;

  // Đánh dấu số điện thoại này đã từng xác thực OTP thành công
  @Prop({ default: false })
  isVerified: boolean;

  // Thời điểm xác thực thành công gần nhất
  @Prop()
  verifiedAt?: Date;

  // Token phiên giao hàng tin cậy cấp cho thiết bị của tài xế
  @Prop({ index: true })
  sessionToken?: string;

  // Thời điểm hết hạn của phiên tin cậy (Tự động trượt gia hạn thêm 60 ngày mỗi lần giao hàng thành công)
  @Prop()
  sessionExpiresAt?: Date;

  // Số lần nhập sai mã OTP liên tiếp để chống tấn công vét cạn
  @Prop({ default: 0 })
  failedAttempts: number;

  // Thời điểm gần nhất yêu cầu gửi mã OTP phục vụ giới hạn tần suất gửi lại
  @Prop()
  lastResendAt?: Date;
}

export const ShipperSessionSchema =
  SchemaFactory.createForClass(ShipperSession);

// Tự động dọn dẹp các phiên làm việc đã quá hạn bảo lưu
ShipperSessionSchema.index({ sessionExpiresAt: 1 }, { expireAfterSeconds: 0 });
