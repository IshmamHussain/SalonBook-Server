import { Router } from 'express';
import { getCollections } from '../config/db.js';
import { verifyJWT } from '../middleware/auth.js';
import { updateProfileSchema, validateBody } from '../utils/validators.js';

const router = Router();

// Get authenticated user's own profile
router.get('/', verifyJWT, async (req, res) => {
  return res.status(200).json({
    success: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      image: req.user.image,
      phone: req.user.phone,
      role: req.user.role,
      isBlocked: req.user.isBlocked,
    },
  });
});

// Update ONLY authenticated user's permitted profile fields (never role or isBlocked)
router.patch('/', verifyJWT, validateBody(updateProfileSchema), async (req, res, next) => {
  try {
    const { users } = getCollections();
    const { name, image, phone } = req.validatedBody;

    const updates = {
      name,
      phone: phone ?? '',
      updatedAt: new Date(),
    };
    if (image !== undefined) {
      updates.image = image;
    }

    const updated = await users.findOneAndUpdate(
      { _id: req.user.objectId },
      { $set: updates },
      {
        returnDocument: 'after',
        projection: {
          name: 1,
          email: 1,
          image: 1,
          phone: 1,
          role: 1,
          isBlocked: 1,
        },
      }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: String(updated._id),
        name: updated.name || '',
        email: updated.email || '',
        image: updated.image || '',
        phone: updated.phone || '',
        role: updated.role === 'admin' ? 'admin' : 'customer',
        isBlocked: Boolean(updated.isBlocked),
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
