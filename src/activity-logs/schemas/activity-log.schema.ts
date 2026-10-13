import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import {
  ACTIVITY_ACTOR_ROLES,
  ACTIVITY_LOG_RETENTION_DAYS,
  ACTIVITY_TARGET_TYPES,
  ActivityActorRole,
  ActivityCategory,
  ActivityStatus,
  ActivityTargetType,
} from '../enums/activity-log.enums';

// Bản ghi nhật ký thao tác nghiệp vụ hiển thị cho trang quản trị
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ActivityLog extends Document {
  // Người hoặc tác nhân thực hiện thao tác
  @Prop(
    raw({
      userId: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
      name: { type: String, required: true, trim: true },
      phone: { type: String, trim: true },
      role: { type: String, enum: ACTIVITY_ACTOR_ROLES, required: true },
    }),
  )
  actor: {
    userId?: Types.ObjectId;
    name: string;
    phone?: string;
    role: ActivityActorRole;
  };

  // Tòa nhà phát sinh sự kiện, thiếu với sự kiện cấp hệ thống
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Building',
    required: false,
  })
  buildingId?: Types.ObjectId;

  @Prop({ type: String, enum: ActivityCategory, required: true })
  category: ActivityCategory;

  @Prop({ type: String, enum: ActivityStatus, required: true })
  status: ActivityStatus;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: false, trim: true })
  description?: string;

  // Đối tượng bị tác động bởi thao tác
  @Prop(
    raw({
      type: { type: String, enum: ACTIVITY_TARGET_TYPES },
      id: { type: String },
      label: { type: String, trim: true },
    }),
  )
  target?: {
    type: ActivityTargetType;
    id?: string;
    label?: string;
  };

  // Dữ liệu bổ sung, tuyệt đối không chứa OTP hay token
  @Prop({ type: Object, required: false })
  metadata?: Record<string, unknown>;

  createdAt: Date;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);

// Chỉ mục phục vụ danh sách theo tòa nhà, theo nhóm và theo người thực hiện (mới nhất trước)
ActivityLogSchema.index({ buildingId: 1, createdAt: -1 });
ActivityLogSchema.index({ category: 1, createdAt: -1 });
ActivityLogSchema.index({ 'actor.userId': 1, createdAt: -1 });

// Tự động xóa nhật ký quá hạn lưu để bảng không tăng vô hạn
ActivityLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: ACTIVITY_LOG_RETENTION_DAYS * 24 * 60 * 60 },
);
