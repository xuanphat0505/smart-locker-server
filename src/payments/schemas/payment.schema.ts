import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import {
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../enums/payment.enums';

export type PaymentDocument = Payment & Document;

// Thực thể lưu vết lịch sử thanh toán nộp phạt và gia hạn lưu kho tủ thông minh
@Schema({ timestamps: true, collection: 'payments' })
export class Payment extends Document {
  // Mã giao dịch số nguyên duy nhất phục vụ chuẩn VietQR và PayOS
  @Prop({ required: true, unique: true, index: true })
  orderCode: number;

  // Kiện hàng phát sinh giao dịch nộp phạt hoặc gia hạn (tùy chọn khi mua gói tháng)
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Package',
    required: false,
    index: true,
  })
  packageId?: Types.ObjectId;

  // Cư dân thực hiện thanh toán giao dịch (tùy chọn khi thanh toán ẩn danh hoặc nộp phạt tại tủ)
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true,
  })
  userId?: Types.ObjectId;

  // Tòa nhà thụ hưởng dòng tiền
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Building',
    required: true,
    index: true,
  })
  buildingId: Types.ObjectId;

  // Trạm tủ lưu trữ kiện hàng (tùy chọn khi mua gói tháng)
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Locker',
    required: false,
  })
  lockerId?: Types.ObjectId;

  // Ngăn tủ vật lý chứa kiện hàng (tùy chọn khi mua gói tháng)
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Box',
    required: false,
  })
  boxId?: Types.ObjectId;

  // Số thứ tự ô tủ in trên cánh cửa (tùy chọn khi mua gói tháng)
  @Prop({ required: false })
  boxNumber?: number;

  // Đánh dấu giao dịch được khởi tạo tại màn hình trạm tủ Kiosk vật lý
  @Prop({ required: false, default: false })
  isKiosk?: boolean;

  // Mục đích thanh toán: Nộp phạt mở tủ hoặc Gia hạn lưu kho
  @Prop({
    type: String,
    enum: PaymentType,
    default: PaymentType.OVERDUE_PICKUP,
    required: true,
  })
  paymentType: PaymentType;

  // Phương thức thanh toán: Cổng thanh toán SePay hoặc Sandbox thử nghiệm
  @Prop({
    type: String,
    enum: PaymentMethod,
    default: PaymentMethod.SEPAY,
    required: true,
  })
  paymentMethod: PaymentMethod;

  // Số tiền thanh toán (VNĐ)
  @Prop({ required: true, min: 0 })
  amount: number;

  // Số giờ được gia hạn thêm sau khi nộp tiền thành công (mặc định 0 khi mua gói tháng)
  @Prop({ required: false, default: 0 })
  extensionHours?: number;

  // Bản sao bất biến thông tin tài khoản thụ hưởng của BQL tại thời điểm tạo giao dịch
  @Prop(
    raw({
      bankBin: { type: String, required: false },
      bankName: { type: String, required: false },
      accountNumber: { type: String, required: false },
      accountName: { type: String, required: false },
    }),
  )
  recipientAccount?: {
    bankBin?: string;
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
  };

  // Trạng thái của phiên giao dịch
  @Prop({
    type: String,
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
    required: true,
    index: true,
  })
  status: PaymentStatus;

  // Đường dẫn link thanh toán SePay Checkout
  @Prop({ required: false })
  paymentUrl?: string;

  // Đường dẫn ảnh mã QR SePay / VietQR dành cho ứng dụng di động và web
  @Prop({ required: false })
  qrCodeUrl?: string;

  // Chuỗi văn bản EMVCo chuẩn NAPAS 247 để ESP32 tự vẽ mã QR lên màn hình LCD
  @Prop({ required: false })
  qrPayload?: string;

  // Mã định danh giao dịch duy nhất do SePay cấp khi gạch nợ
  @Prop({ required: false, index: true })
  sepayTransactionId?: string;

  // Mã tham chiếu giao dịch phía ngân hàng (FT reference code) do SePay gửi về
  @Prop({ required: false })
  referenceCode?: string;

  // Nội dung chuyển khoản ngân hàng
  @Prop({ required: false })
  description?: string;

  // Thời điểm nhận được tiền vào tài khoản
  @Prop({ required: false })
  paidAt?: Date;

  // Thời hạn thanh toán của phiên giao dịch (mặc định 15 phút)
  @Prop({ required: true })
  expiresAt: Date;

  // Dữ liệu thô từ webhook SePay phục vụ đối soát kiểm toán
  @Prop({ type: Object, select: false })
  rawTransactionData?: Record<string, any>;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

// Chỉ mục tìm kiếm nhanh theo mã orderCode giao dịch duy nhất
PaymentSchema.index({ orderCode: 1 }, { unique: true });

// Chỉ mục tái sử dụng mã QR PENDING còn hạn cho từng kiện hàng
PaymentSchema.index({ packageId: 1, status: 1, expiresAt: 1 });

// Chỉ mục tra cứu nhanh trạng thái giao dịch chưa hoàn tất của kiện hàng
PaymentSchema.index({ packageId: 1, status: 1 });

// Chỉ mục phục vụ báo cáo và đối soát doanh thu của Ban Quản Lý theo tòa nhà
PaymentSchema.index({ buildingId: 1, status: 1, createdAt: -1 });

// Chỉ mục truy vấn lịch sử giao dịch của cư dân trên ứng dụng di động
PaymentSchema.index({ userId: 1, createdAt: -1 });

// Chỉ mục tra cứu lịch sử thanh toán theo loại giao dịch của cư dân
PaymentSchema.index({ userId: 1, paymentType: 1, status: 1 });
