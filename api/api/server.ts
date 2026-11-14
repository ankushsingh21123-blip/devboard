import type { Express } from 'express';
import { connectDb } from '../server/src/db.js';
import { createApp } from '../server/src/index.js';

// Reuse one Express app + one MongoDB connection across warm invocations.
let appPromise: Promise<Express> | null = null;

function getApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = (async () => {
      const uri = process.env.MONGODB_URI;
      if (!uri) throw new Error('MONGODB_URI environment variable is not set');
      await connectDb(uri);
      return createApp();
    })();
  }
  return appPromise;
}

export default async function handler(req: any, res: any) {
  // Same-origin guard for writes: this public demo has no auth, so only
  // accept GraphQL mutations from pages served by this deployment.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (origin && host && origin !== `https://${host}` && origin !== `http://${host}`) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Same-origin requests only." }));
      return;
    }
  }
  // Vercel rewrites /graphql and /health to this function; give Express the
  // original path so its routes match.
  if (typeof req.url === 'string') {
    req.url = req.url.replace(/^\/api\/server/, '') || '/';
  }
  const app = await getApp();
  return app(req, res);
}
