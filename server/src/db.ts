import mongoose from 'mongoose';

/**
 * Connect to MongoDB. Uses MONGODB_URI when set, otherwise a local
 * development database. Throws on failure — the server must not start
 * without a working database connection.
 */
export async function connectDb(uri: string): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(uri);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
