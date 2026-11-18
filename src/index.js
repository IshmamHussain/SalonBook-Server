import { createApp } from './app.js';
import { initAuth } from './config/auth.js';
import { closeDatabase, connectToDatabase } from './config/db.js';
import { assertRequiredEnv, env } from './config/env.js';

async function bootstrap() {
  assertRequiredEnv();

  const { client, db } = await connectToDatabase();
  initAuth(db, client);

  const app = createApp();
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

bootstrap().catch((err) => {
  console.error('[SalonBook Server] Fatal startup error:', err.message);
  process.exit(1);
});
