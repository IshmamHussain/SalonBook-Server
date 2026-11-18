import { Router } from 'express';
import { getCollections } from '../config/db.js';
import { requireRole, verifyJWT } from '../middleware/auth.js';
import { PREDEFINED_TIME_SLOTS } from '../utils/constants.js';
import {
  createAppointmentSchema,
  parseObjectId,
  updateAppointmentStatusSchema,
  validateBody,
} from '../utils/validators.js';

const router = Router();

function isPastDate(dateStr) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return dateStr < `${yyyy}-${mm}-${dd}`;
}

// Protected: Get already booked active time slots for a date so UI can display availability
router.get('/appointments/booked-slots', verifyJWT, async (req, res, next) => {
  try {
    const { date } = req.query;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'A valid date (YYYY-MM-DD) query parameter is required.',
      });
    }

    const { appointments } = getCollections();
    const active = await appointments
      .find(
        {
          appointmentDate: date,
          status: { $in: ['pending', 'confirmed'] },
        },
        { projection: { timeSlot: 1 } }
      )
      .toArray();

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      date,
      timeSlots: PREDEFINED_TIME_SLOTS,
      bookedSlots: active.map((a) => a.timeSlot),
    });
  } catch (error) {
    return next(error);
  }
});

// Customer: Submit appointment request (admins cannot book)
router.post(
  '/appointments',
  verifyJWT,
  requireRole('customer'),
  validateBody(createAppointmentSchema),
  async (req, res, next) => {
    try {
      const { serviceId, appointmentDate, timeSlot, message } = req.validatedBody;

      if (isPastDate(appointmentDate)) {
        return res.status(400).json({
          success: false,
          message: 'Appointment date cannot be in the past.',
        });
      }

      const serviceObjectId = parseObjectId(serviceId);
      if (!serviceObjectId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid service ID.',
        });
      }

      const { services, appointments } = getCollections();
      const [service, conflict] = await Promise.all([
        services.findOne(
          { _id: serviceObjectId },
          { projection: { serviceName: 1, category: 1, price: 1, duration: 1, image: 1, status: 1 } }
        ),
        appointments.findOne(
          {
            appointmentDate,
            timeSlot,
            status: { $in: ['pending', 'confirmed'] },
          },
          { projection: { _id: 1 } }
        ),
      ]);

      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Selected salon service does not exist.',
        });
      }

      if (service.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Inactive services cannot be booked.',
        });
      }

      if (conflict) {
        return res.status(409).json({
          success: false,
          message: `The ${timeSlot} slot on ${appointmentDate} is already reserved. Please choose another time.`,
        });
      }

      const doc = {
        serviceId: serviceObjectId,
        customerId: req.user.objectId,
        appointmentDate,
        timeSlot,
        message: message || '',
        servicePrice: Number(service.price),
        paymentStatus: 'unpaid',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await appointments.insertOne(doc);

      return res.status(201).json({
        success: true,
        message: 'Appointment request submitted! Awaiting salon confirmation.',
        appointment: {
          id: String(result.insertedId),
          serviceId: String(serviceObjectId),
          serviceName: service.serviceName,
          serviceCategory: service.category,
          serviceImage: service.image,
          appointmentDate: doc.appointmentDate,
          timeSlot: doc.timeSlot,
          message: doc.message,
          servicePrice: doc.servicePrice,
          paymentStatus: doc.paymentStatus,
          status: doc.status,
          createdAt: doc.createdAt,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Customer: View own appointments
router.get('/appointments/my', verifyJWT, requireRole('customer'), async (req, res, next) => {
  try {
    const { appointments } = getCollections();
    const docs = await appointments
      .aggregate([
        { $match: { customerId: req.user.objectId } },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: 'services',
            localField: 'serviceId',
            foreignField: '_id',
            as: 'service',
          },
        },
        { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            serviceId: 1,
            appointmentDate: 1,
            timeSlot: 1,
            message: 1,
            servicePrice: 1,
            paymentStatus: 1,
            status: 1,
            createdAt: 1,
            serviceName: { $ifNull: ['$service.serviceName', 'Archived Service'] },
            serviceCategory: { $ifNull: ['$service.category', 'Salon Service'] },
            serviceImage: { $ifNull: ['$service.image', ''] },
            serviceDuration: { $ifNull: ['$service.duration', 60] },
          },
        },
      ])
      .toArray();

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      appointments: docs.map((d) => ({
        id: String(d._id),
        serviceId: String(d.serviceId),
        serviceName: d.serviceName,
        serviceCategory: d.serviceCategory,
        serviceImage: d.serviceImage,
        serviceDuration: d.serviceDuration,
        appointmentDate: d.appointmentDate,
        timeSlot: d.timeSlot,
        message: d.message || '',
        servicePrice: d.servicePrice,
        paymentStatus: d.paymentStatus,
        status: d.status,
        createdAt: d.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

// Customer: Cancel own pending appointment request only
router.patch('/appointments/:id/cancel', verifyJWT, requireRole('customer'), async (req, res, next) => {
  try {
    const appointmentObjectId = parseObjectId(req.params.id);
    if (!appointmentObjectId) {
      return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
    }

    const { appointments } = getCollections();
    const existing = await appointments.findOne(
      { _id: appointmentObjectId, customerId: req.user.objectId },
      { projection: { status: 1 } }
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found.',
      });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending appointment requests can be cancelled by customers.',
      });
    }

    const updated = await appointments.findOneAndUpdate(
      { _id: appointmentObjectId, customerId: req.user.objectId, status: 'pending' },
      { $set: { status: 'cancelled' } },
      { returnDocument: 'after', projection: { status: 1 } }
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: 'Appointment status changed before cancellation could complete.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Appointment request cancelled.',
      status: updated.status,
    });
  } catch (error) {
    return next(error);
  }
});

// Admin: View all appointments with customer + service details
router.get('/admin/appointments', verifyJWT, requireRole('admin'), async (req, res, next) => {
  try {
    const { status = '' } = req.query;
    const match = {};
    if (['pending', 'confirmed', 'cancelled'].includes(status)) {
      match.status = status;
    }

    const { appointments } = getCollections();
    const docs = await appointments
      .aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: 'services',
            localField: 'serviceId',
            foreignField: '_id',
            as: 'service',
          },
        },
        { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'users',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer',
          },
        },
        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            serviceId: 1,
            customerId: 1,
            appointmentDate: 1,
            timeSlot: 1,
            message: 1,
            servicePrice: 1,
            paymentStatus: 1,
            status: 1,
            createdAt: 1,
            serviceName: { $ifNull: ['$service.serviceName', 'Archived Service'] },
            serviceCategory: { $ifNull: ['$service.category', 'Salon Service'] },
            serviceImage: { $ifNull: ['$service.image', ''] },
            customerName: { $ifNull: ['$customer.name', 'Unknown Customer'] },
            customerEmail: { $ifNull: ['$customer.email', ''] },
            customerPhone: { $ifNull: ['$customer.phone', ''] },
            customerImage: { $ifNull: ['$customer.image', ''] },
          },
        },
      ])
      .toArray();

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      appointments: docs.map((d) => ({
        id: String(d._id),
        serviceId: String(d.serviceId),
        customerId: String(d.customerId),
        serviceName: d.serviceName,
        serviceCategory: d.serviceCategory,
        serviceImage: d.serviceImage,
        customerName: d.customerName,
        customerEmail: d.customerEmail,
        customerPhone: d.customerPhone,
        customerImage: d.customerImage,
        appointmentDate: d.appointmentDate,
        timeSlot: d.timeSlot,
        message: d.message || '',
        servicePrice: d.servicePrice,
        paymentStatus: d.paymentStatus,
        status: d.status,
        createdAt: d.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

// Admin: Confirm pending appointment OR cancel pending/confirmed appointment
router.patch(
  '/admin/appointments/:id/status',
  verifyJWT,
  requireRole('admin'),
  validateBody(updateAppointmentStatusSchema),
  async (req, res, next) => {
    try {
      const appointmentObjectId = parseObjectId(req.params.id);
      if (!appointmentObjectId) {
        return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
      }

      const targetStatus = req.validatedBody.status;
      const { appointments } = getCollections();

      const existing = await appointments.findOne(
        { _id: appointmentObjectId },
        { projection: { status: 1, paymentStatus: 1 } }
      );

      if (!existing) {
        return res.status(404).json({ success: false, message: 'Appointment not found.' });
      }

      if (targetStatus === 'confirmed' && existing.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Only pending appointments can be confirmed.',
        });
      }

      if (targetStatus === 'cancelled' && !['pending', 'confirmed'].includes(existing.status)) {
        return res.status(400).json({
          success: false,
          message: 'This appointment is already cancelled.',
        });
      }

      await appointments.updateOne({ _id: appointmentObjectId }, { $set: { status: targetStatus } });

      return res.status(200).json({
        success: true,
        message:
          targetStatus === 'confirmed'
            ? 'Appointment confirmed. Customer can now proceed with Stripe payment.'
            : 'Appointment cancelled.',
        status: targetStatus,
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
