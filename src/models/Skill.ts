import { Schema, model, Document } from "mongoose";

export type SkillType = "tool" | "language" | "framework";
export const SKILL_TYPES: SkillType[] = ["tool", "language", "framework"];

export interface ISkill extends Document {
  name: string;
  type: SkillType;
  logoUrl: string; // Cloudinary path: portfolio/skills/{skill_name}/{skill_name}.jpg
  featured: boolean;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}

const SkillSchema = new Schema<ISkill>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: {
      type: String,
      enum: {
        values: SKILL_TYPES,
        message: "Invalid skill type: `{VALUE}` is not supported. Allowed values: tool, language, framework",
      },
      default: "tool",
      required: true,
      trim: true,
      lowercase: true,
    },
    logoUrl: { type: String, required: true },
    featured: { type: Boolean, default: false },
    weight: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Skill = model<ISkill>("Skill", SkillSchema);
