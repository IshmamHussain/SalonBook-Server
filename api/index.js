import { createApp } from '../src/app.js';
import { initAuth } from '../src/config/auth.js';
import { connectToDatabase } from '../src/config/db.js';
import { assertRequiredEnv } from '../src/config/env.js';

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      assertRequiredEnv();
      const { client, db } = await connectToDatabase();
      initAuth(db, client);
      return createApp();
    })();
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
