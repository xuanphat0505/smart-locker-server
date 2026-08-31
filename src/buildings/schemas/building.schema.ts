import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BuildingStatus } from '../enums/building-status.enum';

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

  @Prop({
    type: String,
    enum: BuildingStatus,
    default: BuildingStatus.ACTIVE,
    index: true,
  })
  status: BuildingStatus;

  @Prop({ required: false, trim: true })
  description?: string;
}

export const BuildingSchema = SchemaFactory.createForClass(Building);
