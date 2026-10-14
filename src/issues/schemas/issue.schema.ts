import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import {
  IssueCategory,
  IssuePriority,
  IssueStatus,
} from '../enums/issue.enums';

// Một mục trong dòng thời gian xử lý của phiếu, chỉ được thêm vào cuối
export interface IssueTimelineEntry {
  at: Date;
  actorId?: Types.ObjectId;
  actorName: string;
  note: string;
  fromStatus?: IssueStatus;
  toStatus?: IssueStatus;
}

// Phiếu báo lỗi hoặc sự cố do cư dân, tài xế hoặc Ban Quản Lý gửi lên
@Schema({ timestamps: true })
export class Issue extends Document {
  // Mã phiếu hiển thị dạng TK-0001, duy nhất toàn hệ thống
  @Prop({ required: true, unique: true, index: true })
  ticketCode: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  description: string;

  @Prop({
    type: [raw({ url: { type: String }, publicId: { type: String } })],
    default: [],
  })
  attachments: { url: string; publicId: string }[];

  @Prop({ type: String, enum: IssueCategory, required: true })
  category: IssueCategory;

  @Prop({ type: String, enum: IssuePriority, default: IssuePriority.MEDIUM })
  priority: IssuePriority;

  @Prop({
    type: String,
    enum: IssueStatus,
    default: IssueStatus.PENDING,
    index: true,
  })
  status: IssueStatus;

  // Ảnh chụp thông tin người báo tại thời điểm tạo phiếu
  @Prop(
    raw({
      userId: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
      role: { type: String },
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
    }),
  )
  reporter: {
    userId?: Types.ObjectId;
    role: string;
    name: string;
    phone?: string;
    email?: string;
  };

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Building',
    required: true,
    index: true,
  })
  buildingId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Locker' })
  lockerId?: Types.ObjectId;

  @Prop(
    raw({
      userId: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
      name: { type: String, trim: true },
    }),
  )
  assignee?: { userId: Types.ObjectId; name: string };

  @Prop({ default: false })
  escalatedToSuperAdmin: boolean;

  @Prop({ trim: true, maxlength: 500 })
  resolutionNote?: string;

  @Prop({
    type: [
      raw({
        at: { type: Date, required: true },
        actorId: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
        actorName: { type: String, required: true },
        note: { type: String, default: '' },
        fromStatus: { type: String, enum: IssueStatus },
        toStatus: { type: String, enum: IssueStatus },
      }),
    ],
    default: [],
  })
  timeline: IssueTimelineEntry[];

  createdAt: Date;
  updatedAt: Date;
}

export const IssueSchema = SchemaFactory.createForClass(Issue);

// Chỉ mục phục vụ danh sách theo tòa nhà và trạng thái (mới nhất trước)
IssueSchema.index({ buildingId: 1, status: 1, createdAt: -1 });
IssueSchema.index({ lockerId: 1, status: 1 });
