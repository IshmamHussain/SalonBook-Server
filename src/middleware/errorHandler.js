import { env } from '../config/env.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err, req, res, _next) {
  if (err?.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'A conflicting record already exists for that date and time slot.',
    });
  }

  if (err?.name === 'MulterError') {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Image file exceeds the 5MB maximum size limit.'
        : 'Invalid file upload request.';
    return res.status(400).json({ success: false, message });
  }

  const statusCode = err?.statusCode || err?.status || 500;
  const message =
    statusCode >= 500 && env.isProd
      ? 'An unexpected server error occurred. Please try again shortly.'
      : err?.message || 'An unexpected error occurred.';

  if (statusCode >= 500) {
    console.error(`[API Error] ${req.method} ${req.originalUrl} ->`, err?.message || err);
  }

  return res.status(statusCode).json({
    success: false,
    message,
  });
}
