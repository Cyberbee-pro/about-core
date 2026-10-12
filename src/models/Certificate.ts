import { Schema, model, Document } from "mongoose";

export interface ICertificate extends Document {
  title: string;
  description: string;
  link?: string;
  mediaUrl: string; // Cloudinary path: portfolio/certificate/{org_title_year}.jpg
  organization: string;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}

const CertificateSchema = new Schema<ICertificate>({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  link: { type: String },
  mediaUrl: { type: String, required: true },
  organization: { type: String, required: true, trim: true },
  weight: { type: Number, default: 0 },
}, { timestamps: true });

export const Certificate = model<ICertificate>("Certificate", CertificateSchema);
