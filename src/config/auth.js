import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { jwt } from 'better-auth/plugins';
import { env } from './env.js';

let authInstance = null;

export function initAuth(db, client) {
  if (authInstance) return authInstance;

  const socialProviders = {};
  if (env.googleClientId && env.googleClientSecret) {
    socialProviders.google = {
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
    };
  }

  authInstance = betterAuth({
    secret: env.betterAuthSecret,
    baseURL: env.betterAuthUrl,
    trustedOrigins: env.trustedOrigins,
    database: mongodbAdapter(db, { client }),
    user: {
      modelName: 'users',
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'customer',
          input: false,
        },
        isBlocked: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false,
        },
        phone: {
          type: 'string',
          required: false,
          defaultValue: '',
          input: true,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    socialProviders,
    plugins: [
      jwt({
        jwks: {
          keyPairConfig: {
            alg: 'EdDSA',
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: {
              ...user,
              role: 'customer',
              isBlocked: false,
              phone: user.phone || '',
            },
          }),
        },
      },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: env.isProd ? 'none' : 'lax',
        secure: env.isProd,
        httpOnly: true,
        path: '/',
      },
      useSecureCookies: env.isProd,
    },
  });

  return authInstance;
}

export function getAuth() {
  if (!authInstance) {
    throw new Error('Better Auth has not been initialized. Call initAuth(db, client) first.');
  }
  return authInstance;
}
