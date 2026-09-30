import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../src/config/db";

jest.mock("mongoose", () => {
  const original = jest.requireActual("mongoose");
  return {
    ...original,
    connect: jest.fn(),
    disconnect: jest.fn(),
    connection: {
      readyState: 0,
    },
  };
});

describe("Database Connection (src/config/db.ts)", () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    // Reset connection state
    await disconnectDB();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    (mongoose.connection as { readyState: number }).readyState = 0;
  });

  afterAll(async () => {
    await disconnectDB();
    process.env = originalEnv;
  });

  it("throws an error if MONGO_URI is missing", async () => {
    delete process.env.MONGO_URI;

    await expect(connectDB()).rejects.toThrow(
      "MONGO_URI environment variable is not defined"
    );
    expect(mongoose.connect).not.toHaveBeenCalled();
  });

  it("passes { dbName: 'about_core' } explicitly to mongoose.connect()", async () => {
    const fakeUri = "mongodb+srv://user:pass@cluster0.mongodb.net/?retryWrites=true";
    process.env.MONGO_URI = fakeUri;

    (mongoose.connect as jest.Mock).mockImplementation(async () => {
      (mongoose.connection as { readyState: number }).readyState = 1;
      return {
        connections: [{ readyState: 1 }],
      };
    });

    const conn = await connectDB();

    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(mongoose.connect).toHaveBeenCalledWith(fakeUri, {
      dbName: "about_core",
    });
    expect(conn).toBeDefined();
  });

  it("reuses cached connection when readyState is 1", async () => {
    process.env.MONGO_URI = "mongodb://localhost:27017/about_core";

    (mongoose.connect as jest.Mock).mockImplementation(async () => {
      (mongoose.connection as { readyState: number }).readyState = 1;
      return {
        connections: [{ readyState: 1 }],
      };
    });

    const firstCall = await connectDB();
    expect(mongoose.connect).toHaveBeenCalledTimes(1);

    const secondCall = await connectDB();
    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(secondCall).toBe(firstCall);
  });

  it("calls mongoose.disconnect when disconnectDB is executed", async () => {
    process.env.MONGO_URI = "mongodb://localhost:27017/about_core";

    (mongoose.connect as jest.Mock).mockImplementation(async () => {
      (mongoose.connection as { readyState: number }).readyState = 1;
      return {
        connections: [{ readyState: 1 }],
      };
    });

    await connectDB();
    await disconnectDB();

    expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
  });
});
