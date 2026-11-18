import dotenv from 'dotenv';

dotenv.config();

const parseOrigins = (raw) => {
  if (!raw) return ['http://localhost:3000'];
  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDbName: process.env.MONGODB_DB_NAME || 'salonbook',
  serverUrl: (process.env.SERVER_URL || 'http://localhost:5000').replace(/\/+$/, ''),
  clientUrl: (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  trustedOrigins: parseOrigins(process.env.TRUSTED_ORIGINS || process.env.CLIENT_URL || 'http://localhost:3000'),
  betterAuthSecret: process.env.BETTER_AUTH_SECRET || '',
  betterAuthUrl: (process.env.BETTER_AUTH_URL || process.env.SERVER_URL || 'http://localhost:5000').replace(/\/+$/, ''),
  jwtSecret: process.env.JWT_SECRET || process.env.BETTER_AUTH_SECRET || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  imgbbApiKey: process.env.IMGBB_API_KEY || '',
  seedAdminName: process.env.SEED_ADMIN_NAME || 'SalonBook Admin',
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@salonbook.com',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
};

export function assertRequiredEnv() {
  const missing = [];
  if (!env.mongodbUri) missing.push('MONGODB_URI');
  if (!env.betterAuthSecret) missing.push('BETTER_AUTH_SECRET');
  if (!env.jwtSecret) missing.push('JWT_SECRET');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
