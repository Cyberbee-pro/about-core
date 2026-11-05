import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../src/config/db";

export interface RenameResult {
  contributorsCount: number;
  peopleCount: number;
  applied: boolean;
  renamed: boolean;
}

export async function renameContributorsCollection(
  options: { apply?: boolean } = {}
): Promise<RenameResult> {
  const isApply = Boolean(options.apply ?? process.argv.includes("--apply"));

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB connection is not established.");
  }

  const collections = await db.listCollections().toArray();
  const collectionNames = new Set(collections.map((c) => c.name));

  const hasContributors = collectionNames.has("contributors");
  const hasPeople = collectionNames.has("people");

  const contributorsColl = db.collection("contributors");
  const peopleColl = db.collection("people");

  const contributorsCount = hasContributors
    ? await contributorsColl.countDocuments()
    : 0;
  const peopleCount = hasPeople ? await peopleColl.countDocuments() : 0;

  if (hasPeople && peopleCount > 0) {
    const err = new Error(
      `Refusing to rename: 'people' collection already exists and contains ${peopleCount} document(s).`
    );
    console.error(err.message);
    throw err;
  }

  if (!isApply) {
    console.log(
      `[DRY RUN] Found ${contributorsCount} document(s) in 'contributors' and ${peopleCount} document(s) in 'people'. To apply rename, run with --apply.`
    );
    return {
      contributorsCount,
      peopleCount,
      applied: false,
      renamed: false,
    };
  }

  if (!hasContributors) {
    console.log("Collection 'contributors' does not exist. Nothing to rename.");
    return {
      contributorsCount: 0,
      peopleCount,
      applied: true,
      renamed: false,
    };
  }

  await contributorsColl.rename("people");
  console.log(
    `[APPLIED] Successfully renamed 'contributors' (${contributorsCount} document(s)) to 'people'.`
  );

  return {
    contributorsCount,
    peopleCount,
    applied: true,
    renamed: true,
  };
}

if (require.main === module) {
  (async () => {
    try {
      await connectDB();
      await renameContributorsCollection();
    } catch (err) {
      console.error("Failed to run renameContributorsCollection:", err);
      process.exit(1);
    } finally {
      await disconnectDB();
    }
  })();
}
