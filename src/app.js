import { toNodeHandler } from 'better-auth/node';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { getAuth } from './config/auth.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import adminRoutes from './routes/admin.routes.js';
import appointmentsRoutes from './routes/appointments.routes.js';
import authTokenRoutes from './routes/authToken.routes.js';
import paymentsRoutes, { stripeWebhookHandler } from './routes/payments.routes.js';
import profileRoutes from './routes/profile.routes.js';
import servicesRoutes from './routes/services.routes.js';
import uploadRoutes from './routes/upload.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const normalized = origin.replace(/\/+$/, '');
        if (env.trustedOrigins.includes(normalized)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} is not allowed by CORS policy.`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature'],
    })
  );

  app.use(compression());

  // 1. Stripe Webhook MUST receive the raw unparsed request body before express.json()
  app.post(
    '/api/payments/webhook',
    express.raw({ type: 'application/json' }),
    stripeWebhookHandler
  );

  // 2. Better Auth handler MUST be mounted before express.json()
  const authHandler = toNodeHandler(getAuth());
  app.all('/api/auth/*splat', (req, res) => authHandler(req, res));

  // 3. Parse JSON payloads for all remaining REST API endpoints
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.get('/', (_req, res) => {
    res.status(200).json({
      success: true,
      name: 'SalonBook API',
      status: 'operational',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      success: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', authTokenRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api', servicesRoutes);
  app.use('/api', appointmentsRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api', adminRoutes);
  app.use('/api/profile', profileRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
