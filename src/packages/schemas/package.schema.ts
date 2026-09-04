import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import { PackageStatus } from '../enums/package.enums';
import { BoxSize } from '../../lockers/enums/locker.enums';

// Thực thể bưu kiện đại diện cho một kiện hàng được lưu trữ trong ngăn tủ
@Schema({ timestamps: true })
export class Package extends Document {
  // Mã vận đơn của đơn vị vận chuyển
  @Prop({ required: true, index: true, trim: true })
  trackingNumber: string;

  // Trạm tủ đang lưu giữ kiện hàng
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Locker',
    required: true,
    index: true,
  })
  lockerId: Types.ObjectId;

  // Ngăn tủ cụ thể chứa bưu kiện
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Box',
    required: true,
    index: true,
  })
  boxId: Types.ObjectId;

  // Số thứ tự in trên cánh ngăn tủ
  @Prop({ required: true, min: 1 })
  boxNumber: number;

  // Kích thước của ngăn tủ được chọn
  @Prop({
    type: String,
    enum: BoxSize,
    required: true,
  })
  boxSize: BoxSize;

  // Tòa nhà của cư dân nhận hàng
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Building',
    required: true,
    index: true,
  })
  buildingId: Types.ObjectId;

  // Cư dân thụ hưởng bưu kiện
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  residentId: Types.ObjectId;

  // Số điện thoại của cư dân nhận hàng
  @Prop({ required: true, trim: true })
  receiverPhone: string;

  // Tên của cư dân nhận hàng
  @Prop({ required: true, trim: true })
  receiverName: string;

  // Số phòng hoặc số căn hộ nhận bưu kiện
  @Prop({ required: true, trim: true })
  apartment: string;

  // Số điện thoại của tài xế giao bưu kiện
  @Prop({ required: true, index: true, trim: true })
  shipperPhone: string;

  // Tên của tài xế giao hàng
  @Prop({ required: false, trim: true })
  shipperName?: string;

  // Cờ xác nhận số điện thoại của tài xế đã được xác thực OTP chính chủ
  @Prop({ default: false, index: true })
  isShipperVerified: boolean;

  // Đơn vị giao vận chuyển phát bưu phẩm
  @Prop({ required: true, trim: true })
  carrierName: string;

  // Mã tài khoản người dùng nếu tài xế có liên kết tài khoản nội bộ
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true,
  })
  shipperId?: Types.ObjectId;

  // Mã OTP nhận hàng gồm 6 số ngẫu nhiên
  @Prop({ required: true, index: true, trim: true })
  pinCode: string;

  // Mã token bảo mật dùng để sinh mã QR động phục vụ quét camera mở tủ
  @Prop({ required: true, unique: true, index: true })
  qrCodeToken: string;

  // Đếm số lần nhập sai mã OTP liên tiếp tại màn hình trạm tủ
  @Prop({ default: 0 })
  failedAttempts: number;

  // Thời hạn tạm thời khóa mở tủ bằng mã OTP nếu nhập sai quá 5 lần
  @Prop({ required: false })
  lockedUntil?: Date;

  // Trạng thái vòng đời hiện tại của bưu kiện
  @Prop({
    type: String,
    enum: PackageStatus,
    default: PackageStatus.WAITING_FOR_PICKUP,
    index: true,
  })
  status: PackageStatus;

  // Thời điểm tài xế bỏ kiện hàng vào ngăn tủ thành công
  @Prop({ required: true, default: Date.now })
  droppedOffAt: Date;

  // Thời điểm cư dân mở tủ lấy hàng
  @Prop({ required: false })
  pickedUpAt?: Date;

  // Hạn chót lấy hàng trước khi chuyển sang trạng thái quá hạn
  @Prop({ required: true })
  expiredAt: Date;

  // Ghi chú đính kèm của đơn hàng
  @Prop({ required: false, trim: true })
  note?: string;
}

export const PackageSchema = SchemaFactory.createForClass(Package);

// Đánh chỉ mục phục vụ tìm kiếm nhanh khi cư dân bấm OTP tại màn hình trạm tủ
PackageSchema.index({ lockerId: 1, pinCode: 1, status: 1 });

// Đánh chỉ mục tối ưu truy vấn danh sách bưu kiện của từng cư dân
PackageSchema.index({ residentId: 1, status: 1 });

// Đánh chỉ mục phục vụ tác vụ nền tự động quét các đơn quá hạn sau 48 giờ
PackageSchema.index({ status: 1, expiredAt: 1 });
