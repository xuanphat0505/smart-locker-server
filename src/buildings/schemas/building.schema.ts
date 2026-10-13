import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BuildingStatus } from '../enums/building-status.enum';
import { DEFAULT_PRICING_POLICY } from '../../payments/utils/pricing-policy.util';

@Schema({ timestamps: true })
export class Building extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  })
  code: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ required: true, min: 1 })
  totalFloors: number;

  @Prop({ required: true, min: 1 })
  totalApartments: number;

  @Prop({ required: false, trim: true })
  hotline?: string;

  // Email chính thức của tòa nhà
  @Prop({ required: false, trim: true })
  managementEmail?: string;

  @Prop({
    type: String,
    enum: BuildingStatus,
    default: BuildingStatus.ACTIVE,
    index: true,
  })
  status: BuildingStatus;

  @Prop({ required: false, trim: true })
  description?: string;

  // Tọa độ địa lý GeoJSON Point phục vụ truy vấn định vị GPS không gian
  @Prop(
    raw({
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [Kinh độ (Longitude), Vĩ độ (Latitude)]
        required: false,
      },
    }),
  )
  location?: {
    type: string;
    coordinates: [number, number];
  };

  // Thông tin tài khoản ngân hàng thụ hưởng của Ban Quản Lý tòa nhà
  @Prop(
    raw({
      bankBin: { type: String, required: false },
      bankName: { type: String, required: false },
      accountNumber: { type: String, required: false },
      accountName: { type: String, required: false },
    }),
  )
  bankAccount?: {
    bankBin?: string;
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
  };

  // Cấu hình biểu phí 4 chặng do Ban Quản Lý thiết lập
  @Prop(
    raw({
      monthlySubscriptionFee: {
        type: Number,
        default: DEFAULT_PRICING_POLICY.monthlySubscriptionFee,
        min: 0,
      },
      perUseFee: {
        type: Number,
        default: DEFAULT_PRICING_POLICY.perUseFee,
        min: 0,
      },
      t1Hours: {
        type: Number,
        default: DEFAULT_PRICING_POLICY.t1Hours,
        min: 1,
      },
      t2Hours: {
        type: Number,
        default: DEFAULT_PRICING_POLICY.t2Hours,
        min: 1,
      },
      t3Hours: {
        type: Number,
        default: DEFAULT_PRICING_POLICY.t3Hours,
        min: 1,
      },
      feeX1: { type: Number, default: DEFAULT_PRICING_POLICY.feeX1, min: 0 },
      feeX2: { type: Number, default: DEFAULT_PRICING_POLICY.feeX2, min: 0 },
      maxOverdueFeeCap: {
        type: Number,
        default: DEFAULT_PRICING_POLICY.maxOverdueFeeCap,
        min: 0,
      },
    }),
  )
  pricingPolicy?: {
    monthlySubscriptionFee: number;
    perUseFee: number;
    t1Hours: number;
    t2Hours: number;
    t3Hours: number;
    feeX1: number;
    feeX2: number;
    maxOverdueFeeCap: number;
  };
}

export const BuildingSchema = SchemaFactory.createForClass(Building);

// Đánh chỉ mục 2dsphere hỗ trợ tìm kiếm lân cận $geoNear siêu tốc
BuildingSchema.index({ location: '2dsphere' });
