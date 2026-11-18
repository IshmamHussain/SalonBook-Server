import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';

const router = Router();

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const err = new Error('Only JPG, PNG, WebP, GIF, and AVIF images are allowed.');
      err.statusCode = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

router.post('/image', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please attach an image file to upload.',
      });
    }

    if (!env.imgbbApiKey) {
      return res.status(503).json({
        success: false,
        message: 'Image hosting is not configured. Add IMGBB_API_KEY in server environment variables.',
      });
    }

    const base64Image = req.file.buffer.toString('base64');
    const formData = new FormData();
    formData.append('key', env.imgbbApiKey);
    formData.append('image', base64Image);

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (!response.ok || !data?.success || !data?.data?.display_url) {
      return res.status(502).json({
        success: false,
        message: data?.error?.message || 'ImgBB image upload failed. Please try again.',
      });
    }

    return res.status(200).json({
      success: true,
      url: data.data.display_url,
      thumbUrl: data.data.thumb?.url || data.data.display_url,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
