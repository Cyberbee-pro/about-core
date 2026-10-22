import { Schema, model, Document } from "mongoose";

export interface IPfpItem {
  url: string;
  publicId: string;
  uploadedAt: Date;
}

export interface ISiteConfig extends Document {
  name: string;
  pfpUrl?: string;
  pfpPublicId?: string;
  pfpHistory?: IPfpItem[];
  jobTitles: string[];
  resumeUrl: string;
  resumePublicId?: string;
  statusMessage: string;
  bioSummary: string;
  createdAt?: Date;
  updatedAt?: Date;
}


const PfpItemSchema = new Schema<IPfpItem>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SiteConfigSchema = new Schema<ISiteConfig>(
  {
    name: { type: String, required: true },
    pfpUrl: { type: String },
    pfpPublicId: { type: String },
    pfpHistory: { type: [PfpItemSchema], default: [] },

    jobTitles: {
      type: [String],
      required: true,
      default: undefined,
      validate: {
        validator: (val: string[]) => Array.isArray(val) && val.length > 0,
        message: "jobTitles must have at least one entry",
      },
    },
    resumeUrl: { type: String, required: true },
    resumePublicId: { type: String },
    statusMessage: { type: String, required: true },

    bioSummary: { type: String, required: true },
  },
  { timestamps: true }
);

export const SiteConfig = model<ISiteConfig>("SiteConfig", SiteConfigSchema);