import { Schema, model, Document, Types } from "mongoose";

export interface IExperiencePosition {
  positionTag: string; // e.g., "Senior Role Promotion", "Initial Hire"
  title: string;
  description: string;
  startDate: Date;
  endDate?: Date;
  mediaUrls: string[]; // Cloudinary media assets
  certificateUrls: string[]; // Cloudinary certificate assets
  isCurrent: boolean;
}

export type ExperienceTag = "focus" | "extracurricular";
export type ExperienceType =
  | "internship"
  | "contract"
  | "freelance"
  | "full_time"
  | "part_time"
  | "club"
  | "volunteering";

export interface IExperience extends Document {
  organization: string;
  tag: ExperienceTag;
  type: ExperienceType;
  iconUrl: string; // Cloudinary icon path
  skills: Types.ObjectId[]; // Ref to Skill model
  weight: number;
  positions: IExperiencePosition[]; // Promotion tiers & history
  createdAt: Date;
  updatedAt: Date;
}

const ExperiencePositionSchema = new Schema<IExperiencePosition>({
  positionTag: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  mediaUrls: [{ type: String }],
  certificateUrls: [{ type: String }],
  isCurrent: { type: Boolean, default: false },
});

const ExperienceSchema = new Schema<IExperience>({
  organization: { type: String, required: true, trim: true },
  tag: { type: String, enum: ["focus", "extracurricular"], required: true },
  type: {
    type: String,
    enum: [
      "internship",
      "contract",
      "freelance",
      "full_time",
      "part_time",
      "club",
      "volunteering",
    ],
    required: true,
  },
  iconUrl: { type: String, required: true },
  skills: [{ type: Schema.Types.ObjectId, ref: "Skill" }],
  weight: { type: Number, default: 0 },
  positions: [ExperiencePositionSchema],
}, { timestamps: true });

export const Experience = model<IExperience>("Experience", ExperienceSchema);
