import { createApp } from './app.js';
import { initAuth } from './config/auth.js';
import { closeDatabase, connectToDatabase } from './config/db.js';
import { assertRequiredEnv, env } from './config/env.js';

let appPromise = null;

export async function getInitializedApp() {
  if (!appPromise) {
    appPromise = (async () => {
      assertRequiredEnv();
      const { client, db } = await connectToDatabase();
      initAuth(db, client);
      return createApp();
    })().catch((err) => {
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getInitializedApp();
  return app(req, res);
}

async function bootstrap() {
  const app = await getInitializedApp();
  const server = app.listen(env.port, () => {
    console.log(`[SalonBook Server] Listening on port ${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal) => {
    console.log(`[SalonBook Server] Received ${signal}. Closing server gracefully...`);
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (!process.env.VERCEL) {
  bootstrap().catch((err) => {
    console.error('[SalonBook Server] Fatal startup error:', err.message);
    process.exit(1);
  });
}
