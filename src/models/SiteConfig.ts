import { Schema, model, Document } from "mongoose";

export interface ISiteConfig extends Document {
  name: string;
  pfpUrl?: string;
  pfpPublicId?: string;
  jobTitles: string[];
  resumeDriveUrl: string;
  statusMessage: string;
  bioSummary: string;
}

const SiteConfigSchema = new Schema<ISiteConfig>(
  {
    name: { type: String, required: true },
    pfpUrl: { type: String },
    pfpPublicId: { type: String },
    jobTitles: {
      type: [String],
      required: true,
      default: undefined,
      validate: {
        validator: (val: string[]) => Array.isArray(val) && val.length > 0,
        message: "jobTitles must have at least one entry",
      },
    },
    resumeDriveUrl: { type: String, required: true },
    statusMessage: { type: String, required: true },

    bioSummary: { type: String, required: true },
  },
  { timestamps: true }
);

export const SiteConfig = model<ISiteConfig>("SiteConfig", SiteConfigSchema);