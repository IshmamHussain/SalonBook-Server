import { createApp, ensureBackendInitialized } from './app.js';
import { closeDatabase } from './config/db.js';
import { env } from './config/env.js';

const app = createApp();

if (!process.env.VERCEL) {
  ensureBackendInitialized()
    .then(() => {
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
    })
    .catch((err) => {
      console.error('[SalonBook Server] Fatal startup error:', err.message);
      process.exit(1);
    });
}

export default app;
