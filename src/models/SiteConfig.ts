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

/**
 * Migration hook: For existing SiteConfig documents in MongoDB created prior to
 * standardizing on resumeUrl, copy legacy resumeDriveUrl into resumeUrl upon
 * document initialization so GET /api/v1/config preserves the resume link.
 */
SiteConfigSchema.pre("init", function (rawDoc: Record<string, unknown>) {
  if (rawDoc && typeof rawDoc === "object") {
    if (!rawDoc.resumeUrl && typeof rawDoc.resumeDriveUrl === "string" && rawDoc.resumeDriveUrl) {
      rawDoc.resumeUrl = rawDoc.resumeDriveUrl;
      delete rawDoc.resumeDriveUrl;
    }
  }
});

export const SiteConfig = model<ISiteConfig>("SiteConfig", SiteConfigSchema);

/**
 * Migrates existing SiteConfig documents in MongoDB by copying `resumeDriveUrl`
 * into `resumeUrl` if `resumeUrl` is missing or empty, preserving the resume link
 * before removing the legacy field.
 */
export const migrateSiteConfigResumeUrl = async (): Promise<{ modifiedCount: number }> => {
  if (!SiteConfig.collection) {
    return { modifiedCount: 0 };
  }

  try {
    const result = await SiteConfig.collection.updateMany(
      {
        $or: [{ resumeUrl: { $exists: false } }, { resumeUrl: null }, { resumeUrl: "" }],
        resumeDriveUrl: { $exists: true, $ne: "" },
      },
      [
        {
          $set: {
            resumeUrl: "$resumeDriveUrl",
          },
        },
        {
          $unset: "resumeDriveUrl",
        },
      ]
    );
    return { modifiedCount: result.modifiedCount };
  } catch {
    const cursor = SiteConfig.collection.find({
      $or: [{ resumeUrl: { $exists: false } }, { resumeUrl: null }, { resumeUrl: "" }],
      resumeDriveUrl: { $exists: true, $ne: "" },
    });
    let modifiedCount = 0;
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      if (doc && doc._id && doc.resumeDriveUrl) {
        await SiteConfig.collection.updateOne(
          { _id: doc._id },
          {
            $set: { resumeUrl: doc.resumeDriveUrl },
            $unset: { resumeDriveUrl: "" },
          }
        );
        modifiedCount++;
      }
    }
    return { modifiedCount };
  }
};