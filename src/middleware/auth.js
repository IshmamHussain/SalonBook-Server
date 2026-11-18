import { fromNodeHeaders } from 'better-auth/node';
import { importJWK, jwtVerify } from 'jose';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getAuth } from '../config/auth.js';
import { getCollections, getDb } from '../config/db.js';
import { env } from '../config/env.js';

const JWT_ISSUER = 'salonbook-api';
const JWT_AUDIENCE = 'salonbook-client';
const JWT_EXPIRES_IN = '2h';

export function issueAccessToken(user) {
  const userId = String(user._id || user.id);
  return jwt.sign(
    {
      sub: userId,
      email: user.email,
      role: user.role || 'customer',
    },
    env.jwtSecret,
    {
      algorithm: 'HS256',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: JWT_EXPIRES_IN,
    }
  );
}

export async function findUserById(userId) {
  if (!userId) return null;
  const { users } = getCollections();
  const idStr = String(userId);
  const query = ObjectId.isValid(idStr)
    ? { $or: [{ _id: new ObjectId(idStr) }, { id: idStr }] }
    : { $or: [{ _id: idStr }, { id: idStr }] };

  return users.findOne(query, {
    projection: {
      name: 1,
      email: 1,
      image: 1,
      role: 1,
      isBlocked: 1,
      phone: 1,
      createdAt: 1,
    },
  });
}

function readBearerToken(authHeader) {
  if (typeof authHeader !== 'string' || authHeader.length > 8192) {
    return null;
  }
  const match = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authHeader.trim());
  return match ? match[1] : null;
}

async function verifyBetterAuthJwt(token) {
  const db = getDb();
  const keys = await db.collection('jwks').find({}).limit(5).toArray();
  for (const keyDoc of keys) {
    try {
      const publicJwk = typeof keyDoc.publicKey === 'string' ? JSON.parse(keyDoc.publicKey) : keyDoc.publicKey;
      const key = await importJWK(publicJwk, publicJwk.alg || 'EdDSA');
      const { payload } = await jwtVerify(token, key, {
        issuer: env.betterAuthUrl,
      });
      if (payload && typeof payload.sub === 'string' && payload.sub) {
        return payload.sub;
      }
    } catch {
      // Try next stored JWK
    }
  }
  return null;
}

export async function verifyJWT(req, res, next) {
  try {
    const token = readBearerToken(req.headers.authorization);
    let subjectId = null;

    if (token) {
      try {
        const claims = jwt.verify(token, env.jwtSecret, {
          algorithms: ['HS256'],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        });
        if (claims && typeof claims === 'object' && typeof claims.sub === 'string' && claims.sub) {
          subjectId = claims.sub;
        }
      } catch {
        subjectId = await verifyBetterAuthJwt(token);
      }
    }

    if (!subjectId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please sign in with a valid token.',
      });
    }

    const userDoc = await findUserById(subjectId);
    if (!userDoc) {
      return res.status(401).json({
        success: false,
        message: 'User account not found.',
      });
    }

    if (userDoc.isBlocked) {
      return res.status(403).json({
        success: false,
        code: 'USER_BLOCKED',
        message: 'Your account has been blocked by the salon administrator.',
      });
    }

    req.user = {
      id: String(userDoc._id),
      objectId: userDoc._id,
      name: userDoc.name || '',
      email: userDoc.email || '',
      image: userDoc.image || '',
      phone: userDoc.phone || '',
      role: userDoc.role === 'admin' ? 'admin' : 'customer',
      isBlocked: Boolean(userDoc.isBlocked),
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_ROLE',
        message: 'You do not have permission to access this resource.',
      });
    }

    return next();
  };
}

export async function getSessionUserFromRequest(req) {
  const auth = getAuth();
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session?.user?.id) {
    return null;
  }
  return findUserById(session.user.id);
}
