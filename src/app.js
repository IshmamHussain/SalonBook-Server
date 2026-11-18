import { toNodeHandler } from 'better-auth/node';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { getAuth, initAuth } from './config/auth.js';
import { connectToDatabase } from './config/db.js';
import { assertRequiredEnv, env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import adminRoutes from './routes/admin.routes.js';
import appointmentsRoutes from './routes/appointments.routes.js';
import authTokenRoutes from './routes/authToken.routes.js';
import paymentsRoutes, { stripeWebhookHandler } from './routes/payments.routes.js';
import profileRoutes from './routes/profile.routes.js';
import servicesRoutes from './routes/services.routes.js';
import uploadRoutes from './routes/upload.routes.js';

let initPromise = null;
let cachedAuthHandler = null;

export async function ensureBackendInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      assertRequiredEnv();
      const { client, db } = await connectToDatabase();
      const auth = initAuth(db, client);
      cachedAuthHandler = toNodeHandler(auth);
    })().catch((err) => {
      initPromise = null;
      cachedAuthHandler = null;
      throw err;
    });
  }
  await initPromise;
}

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

  // Root & health endpoints respond immediately without waiting for cold-start DB init
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

  // Lazily initialize MongoDB + Better Auth before any database or auth route
  app.use(async (_req, _res, next) => {
    try {
      await ensureBackendInitialized();
      return next();
    } catch (error) {
      return next(error);
    }
  });

  const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 40,
    methods: ['POST'],
    message: 'Too many authentication attempts. Please try again in a few minutes.',
  });

  const uploadLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Upload rate limit reached. Please wait a moment before uploading more images.',
  });

  const mutationLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many booking or checkout requests. Please try again shortly.',
  });

  // 1. Stripe Webhook MUST receive the raw unparsed request body before express.json()
  app.post(
    '/api/payments/webhook',
    express.raw({ type: 'application/json' }),
    stripeWebhookHandler
  );

  // 2. Better Auth handler MUST be mounted before express.json()
  app.all('/api/auth/*splat', authLimiter, (req, res) => {
    const authHandler = cachedAuthHandler || toNodeHandler(getAuth());
    return authHandler(req, res);
  });

  // 3. Parse JSON payloads for all remaining REST API endpoints
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use('/api', authTokenRoutes);
  app.use('/api/upload', uploadLimiter, uploadRoutes);
  app.use('/api', servicesRoutes);
  app.post('/api/appointments', mutationLimiter);
  app.post('/api/payments/create-checkout-session', mutationLimiter);
  app.use('/api', appointmentsRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api', adminRoutes);
  app.use('/api/profile', profileRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
