import { Schema, model, Document } from "mongoose";

export interface IAchievement extends Document {
  title: string;
  date: string; // e.g. "Month Year"
  detail: string;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}

const AchievementSchema = new Schema<IAchievement>({
  title: { type: String, required: true, trim: true },
  date: { type: String, required: true },
  detail: { type: String, required: true },
  weight: { type: Number, default: 0 },
}, { timestamps: true });

export const Achievement = model<IAchievement>("Achievement", AchievementSchema);
