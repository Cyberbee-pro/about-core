import { Schema, model, Document } from "mongoose";
import { isValidHttpUrl } from "../utils/stringUtils";

export interface IContributorDocument extends Document {
  name: string;
  profilePicUrl: string;
  profileLink?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContributorSchema = new Schema<IContributorDocument>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    profilePicUrl: { type: String, required: true },
    profileLink: {
      type: String,
      validate: {
        validator: (val: string) => !val || isValidHttpUrl(val),
        message: "profileLink must be a valid http or https URL",
      },
    },
  },
  { timestamps: true }
);

export const Contributor = model<IContributorDocument>("Contributor", ContributorSchema);
