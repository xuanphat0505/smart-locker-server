import { Schema } from 'mongoose';

// Bản ghi bộ đếm dùng sinh mã tuần tự (ví dụ mã phiếu TK-0001) một cách nguyên tử
export interface CounterDocument {
  _id: string;
  seq: number;
}

export const COUNTER_MODEL_NAME = 'Counter';

export const CounterSchema = new Schema<CounterDocument>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});
