import mongoose from "mongoose";

let isConnected = false;

export const connectDB = async (): Promise<typeof mongoose> => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI environment variable is not defined");
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      dbName: "about_core",
    });
    isConnected = conn.connections[0].readyState === 1;
    return conn;
  } catch (error) {
    isConnected = false;
    throw error;
  }
};

export const disconnectDB = async (): Promise<void> => {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
  }
};
