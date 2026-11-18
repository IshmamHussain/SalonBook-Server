import { Router } from 'express';
import { getCollections } from '../config/db.js';
import { requireRole, verifyJWT } from '../middleware/auth.js';
import { SERVICE_CATEGORIES } from '../utils/constants.js';
import { createServiceSchema, parseObjectId, updateServiceSchema, validateBody } from '../utils/validators.js';

const router = Router();

const SERVICE_PROJECTION = {
  serviceName: 1,
  category: 1,
  description: 1,
  price: 1,
  duration: 1,
  image: 1,
  status: 1,
  createdAt: 1,
};

function serializeService(doc) {
  return {
    id: String(doc._id),
    serviceName: doc.serviceName,
    category: doc.category,
    description: doc.description,
    price: doc.price,
    duration: doc.duration,
    image: doc.image,
    status: doc.status,
    createdAt: doc.createdAt,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MAX_SEARCH_LENGTH = 100;

function sanitizeSearchQuery(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, MAX_SEARCH_LENGTH);
}

// Public: Browse active services with search, category filter, and price sort
router.get('/services', async (req, res, next) => {
  try {
    const { services } = getCollections();
    const { search = '', category = '', sort = 'newest', limit } = req.query;

    const filter = { status: 'active' };

    const safeSearch = sanitizeSearchQuery(search);
    if (safeSearch) {
      filter.serviceName = { $regex: escapeRegex(safeSearch), $options: 'i' };
    }

    if (typeof category === 'string' && category.trim() && category !== 'all') {
      filter.category = category.trim();
    }

    let sortSpec = { createdAt: -1 };
    if (sort === 'price_asc') sortSpec = { price: 1, createdAt: -1 };
    if (sort === 'price_desc') sortSpec = { price: -1, createdAt: -1 };

    const cursor = services.find(filter, { projection: SERVICE_PROJECTION }).sort(sortSpec);

    const parsedLimit = Number(limit);
    if (Number.isInteger(parsedLimit) && parsedLimit > 0 && parsedLimit <= 50) {
      cursor.limit(parsedLimit);
    }

    const docs = await cursor.toArray();
    res.vary('Origin');
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      count: docs.length,
      services: docs.map(serializeService),
    });
  } catch (error) {
    return next(error);
  }
});

// Public: Salon service categories with active counts
router.get('/services/categories', async (_req, res, next) => {
  try {
    const { services } = getCollections();
    const counts = await services
      .aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            minPrice: { $min: '$price' },
          },
        },
      ])
      .toArray();

    const countMap = new Map(counts.map((item) => [item._id, item]));
    const categories = SERVICE_CATEGORIES.map((name) => ({
      name,
      count: countMap.get(name)?.count || 0,
      minPrice: countMap.get(name)?.minPrice || null,
    }));

    res.vary('Origin');
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      categories,
    });
  } catch (error) {
    return next(error);
  }
});

// Protected: Service Details (requires authenticated non-blocked user)
router.get('/services/:id', verifyJWT, async (req, res, next) => {
  try {
    const serviceObjectId = parseObjectId(req.params.id);
    if (!serviceObjectId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid service ID format.',
      });
    }

    const { services } = getCollections();
    const doc = await services.findOne({ _id: serviceObjectId }, { projection: SERVICE_PROJECTION });

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Salon service not found.',
      });
    }

    if (doc.status !== 'active' && req.user.role !== 'admin') {
      return res.status(404).json({
        success: false,
        message: 'This salon service is currently unavailable.',
      });
    }

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      service: serializeService(doc),
    });
  } catch (error) {
    return next(error);
  }
});

// Admin: Get all services (active + inactive) with search, category, and sort
router.get('/admin/services', verifyJWT, requireRole('admin'), async (req, res, next) => {
  try {
    const { services } = getCollections();
    const { search = '', category = '', status = '', sort = 'newest' } = req.query;

    const filter = {};
    const safeSearch = sanitizeSearchQuery(search);
    if (safeSearch) {
      filter.serviceName = { $regex: escapeRegex(safeSearch), $options: 'i' };
    }
    if (typeof category === 'string' && category.trim() && category !== 'all') {
      filter.category = category.trim();
    }
    if (status === 'active' || status === 'inactive') {
      filter.status = status;
    }

    let sortSpec = { createdAt: -1 };
    if (sort === 'price_asc') sortSpec = { price: 1, createdAt: -1 };
    if (sort === 'price_desc') sortSpec = { price: -1, createdAt: -1 };

    const docs = await services.find(filter, { projection: SERVICE_PROJECTION }).sort(sortSpec).toArray();
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      count: docs.length,
      services: docs.map(serializeService),
    });
  } catch (error) {
    return next(error);
  }
});

// Admin: Create new salon service
router.post(
  '/admin/services',
  verifyJWT,
  requireRole('admin'),
  validateBody(createServiceSchema),
  async (req, res, next) => {
    try {
      const { services } = getCollections();
      const payload = req.validatedBody;
      const doc = {
        serviceName: payload.serviceName,
        category: payload.category,
        description: payload.description,
        price: Number(payload.price),
        duration: Number(payload.duration),
        image: payload.image,
        status: payload.status || 'active',
        createdAt: new Date(),
      };

      const result = await services.insertOne(doc);
      return res.status(201).json({
        success: true,
        message: 'Salon service created successfully.',
        service: serializeService({ ...doc, _id: result.insertedId }),
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Admin: Update service (details or activate/deactivate)
router.patch(
  '/admin/services/:id',
  verifyJWT,
  requireRole('admin'),
  validateBody(updateServiceSchema),
  async (req, res, next) => {
    try {
      const serviceObjectId = parseObjectId(req.params.id);
      if (!serviceObjectId) {
        return res.status(400).json({ success: false, message: 'Invalid service ID.' });
      }

      const { services } = getCollections();
      const updates = { ...req.validatedBody };
      if (updates.price !== undefined) updates.price = Number(updates.price);
      if (updates.duration !== undefined) updates.duration = Number(updates.duration);

      const updated = await services.findOneAndUpdate(
        { _id: serviceObjectId },
        { $set: updates },
        { returnDocument: 'after', projection: SERVICE_PROJECTION }
      );

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Service not found.' });
      }

      return res.status(200).json({
        success: true,
        message: 'Salon service updated successfully.',
        service: serializeService(updated),
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Admin: Delete service
router.delete('/admin/services/:id', verifyJWT, requireRole('admin'), async (req, res, next) => {
  try {
    const serviceObjectId = parseObjectId(req.params.id);
    if (!serviceObjectId) {
      return res.status(400).json({ success: false, message: 'Invalid service ID.' });
    }

    const { services } = getCollections();
    const result = await services.deleteOne({ _id: serviceObjectId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Salon service deleted successfully.',
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
