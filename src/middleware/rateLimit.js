/**
 * Lightweight, zero-dependency in-memory rate limiter for Express.
 * Uses `req.ip` (which relies on `app.set('trust proxy', 1)` to ignore spoofed X-Forwarded-For headers).
 */
export function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 60, methods, message } = {}) {
  const hits = new Map();
  let lastPrune = Date.now();
  const allowedMethods = methods ? new Set(methods.map((m) => m.toUpperCase())) : null;

  function pruneExpired(now) {
    if (now - lastPrune < windowMs) return;
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) {
        hits.delete(key);
      }
    }
    lastPrune = now;
  }

  return function rateLimitMiddleware(req, res, next) {
    if (allowedMethods && !allowedMethods.has(req.method.toUpperCase())) {
      return next();
    }

    const now = Date.now();
    pruneExpired(now);

    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(remaining));
    res.set('RateLimit-Reset', String(resetSeconds));

    if (entry.count > max) {
      res.set('Retry-After', String(resetSeconds));
      return res.status(429).json({
        success: false,
        message: message || 'Too many requests. Please wait a moment and try again.',
      });
    }

    return next();
  };
}
