import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import { Role } from '../../auth/enums/role.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, unique: true, index: true, trim: true })
  phone: string;

  @Prop({ required: true })
  password: string;

  @Prop({ type: String, enum: Role, default: Role.RESIDENT })
  role: Role;

  // Dành riêng cho Cư Dân (Resident) gắn với Tòa Nhà
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Building',
    required: false,
    index: true,
  })
  buildingId?: Types.ObjectId;

  @Prop({ required: false, trim: true })
  apartment?: string;

  // Trạng thái xét duyệt cư dân của Ban Quản Lý Tòa Nhà
  @Prop({
    type: String,
    enum: ApprovalStatus,
    default: ApprovalStatus.PENDING,
  })
  approvalStatus: ApprovalStatus;

  @Prop({ required: false, trim: true })
  rejectedReason?: string;

  @Prop({ required: false })
  approvedAt?: Date;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: false,
  })
  approvedBy?: Types.ObjectId;

  // Token nhận thông báo đẩy qua Expo Go
  @Prop({ required: false, trim: true })
  devicePushToken?: string;

  // Mã băm của Refresh Token
  @Prop({ required: false })
  refreshTokenHash?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Chỉ mục kết hợp tối ưu hóa truy vấn lọc cư dân chờ duyệt theo tòa nhà
UserSchema.index({ buildingId: 1, role: 1, approvalStatus: 1 });

// Chỉ mục kết hợp tìm nhanh các tài khoản Ban Quản Lý của tòa nhà
UserSchema.index({ buildingId: 1, role: 1 });
