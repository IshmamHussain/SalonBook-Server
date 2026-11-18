import { Router } from 'express';
import { getSessionUserFromRequest, issueAccessToken } from '../middleware/auth.js';

const router = Router();

/**
 * Exchanges an active Better Auth session cookie for a signed JWT
 * verified by Express middleware on all protected API routes.
 */
router.get('/token', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const userDoc = await getSessionUserFromRequest(req);
    if (!userDoc) {
      return res.status(401).json({
        success: false,
        message: 'No active session found.',
      });
    }

    if (userDoc.isBlocked) {
      return res.status(403).json({
        success: false,
        code: 'USER_BLOCKED',
        message: 'Your account has been blocked by the salon administrator.',
        user: {
          id: String(userDoc._id),
          name: userDoc.name || '',
          email: userDoc.email || '',
          image: userDoc.image || '',
          phone: userDoc.phone || '',
          role: userDoc.role === 'admin' ? 'admin' : 'customer',
          isBlocked: true,
        },
      });
    }

    const token = issueAccessToken(userDoc);
    return res.status(200).json({
      success: true,
      token,
      user: {
        id: String(userDoc._id),
        name: userDoc.name || '',
        email: userDoc.email || '',
        image: userDoc.image || '',
        phone: userDoc.phone || '',
        role: userDoc.role === 'admin' ? 'admin' : 'customer',
        isBlocked: Boolean(userDoc.isBlocked),
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
