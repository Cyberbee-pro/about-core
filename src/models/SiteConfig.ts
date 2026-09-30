import { Schema, model, Document } from "mongoose";

export interface ISiteConfig extends Document {
  resumeDriveUrl: string;
  statusMessage: string;
  bioSummary: string;
}

const SiteConfigSchema = new Schema<ISiteConfig>({
  resumeDriveUrl: { type: String, required: true },
  statusMessage: { type: String, default: "Building systems..." },
  bioSummary: { type: String, required: true },
}, { timestamps: true });

export const SiteConfig = model<ISiteConfig>("SiteConfig", SiteConfigSchema);