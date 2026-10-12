import { Schema, model, Document } from "mongoose";

export interface ISkill extends Document {
  name: string;
  logoUrl: string; // Cloudinary path: portfolio/skills/{skill_name}/{skill_name}.jpg
  featured: boolean;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}

const SkillSchema = new Schema<ISkill>({
  name: { type: String, required: true, unique: true, trim: true },
  logoUrl: { type: String, required: true },
  featured: { type: Boolean, default: false },
  weight: { type: Number, default: 0 },
}, { timestamps: true });

export const Skill = model<ISkill>("Skill", SkillSchema);
