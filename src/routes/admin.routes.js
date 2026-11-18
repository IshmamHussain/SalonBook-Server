import { Router } from 'express';
import { getCollections } from '../config/db.js';
import { requireRole, verifyJWT } from '../middleware/auth.js';
import { parseObjectId, toggleBlockUserSchema, validateBody } from '../utils/validators.js';

const router = Router();

// Customer Dashboard Overview
router.get('/dashboard/customer/overview', verifyJWT, requireRole('customer'), async (req, res, next) => {
  try {
    const { appointments } = getCollections();
    const customerId = req.user.objectId;

    const [totalRequests, pendingCount, confirmedCount, cancelledCount] = await Promise.all([
      appointments.countDocuments({ customerId }),
      appointments.countDocuments({ customerId, status: 'pending' }),
      appointments.countDocuments({ customerId, status: 'confirmed' }),
      appointments.countDocuments({ customerId, status: 'cancelled' }),
    ]);

    return res.status(200).json({
      success: true,
      overview: {
        totalAppointments: totalRequests,
        pendingAppointments: pendingCount,
        confirmedAppointments: confirmedCount,
        cancelledAppointments: cancelledCount,
      },
    });
  } catch (error) {
    return next(error);
  }
});

// Admin Dashboard Overview
router.get('/dashboard/admin/overview', verifyJWT, requireRole('admin'), async (_req, res, next) => {
  try {
    const { users, services, appointments, transactions } = getCollections();

    const [
      totalCustomers,
      totalActiveServices,
      totalAppointments,
      pendingAppointments,
      confirmedAppointments,
      paidTransactionsSummary,
    ] = await Promise.all([
      users.countDocuments({ role: { $ne: 'admin' } }),
      services.countDocuments({ status: 'active' }),
      appointments.countDocuments({}),
      appointments.countDocuments({ status: 'pending' }),
      appointments.countDocuments({ status: 'confirmed' }),
      transactions
        .aggregate([
          { $match: { status: 'paid' } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              totalRevenue: { $sum: '$amount' },
            },
          },
        ])
        .toArray(),
    ]);

    const paymentSummary = paidTransactionsSummary[0] || { count: 0, totalRevenue: 0 };

    return res.status(200).json({
      success: true,
      overview: {
        totalCustomers,
        totalActiveServices,
        totalAppointments,
        pendingAppointments,
        confirmedAppointments,
        totalSuccessfulPayments: paymentSummary.count,
        totalRevenue: Number((paymentSummary.totalRevenue || 0).toFixed(2)),
      },
    });
  } catch (error) {
    return next(error);
  }
});

// Admin: Manage Users — View all registered customers with booking counts
router.get('/admin/users', verifyJWT, requireRole('admin'), async (_req, res, next) => {
  try {
    const { users } = getCollections();
    const docs = await users
      .aggregate([
        { $match: { role: { $ne: 'admin' } } },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: 'appointments',
            localField: '_id',
            foreignField: 'customerId',
            as: 'bookings',
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            email: 1,
            image: 1,
            phone: 1,
            role: 1,
            isBlocked: 1,
            createdAt: 1,
            appointmentCount: { $size: '$bookings' },
          },
        },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      users: docs.map((u) => ({
        id: String(u._id),
        name: u.name || '',
        email: u.email || '',
        image: u.image || '',
        phone: u.phone || '',
        role: u.role || 'customer',
        isBlocked: Boolean(u.isBlocked),
        appointmentCount: u.appointmentCount || 0,
        createdAt: u.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

// Admin: Block or Unblock a registered customer
router.patch(
  '/admin/users/:id/block',
  verifyJWT,
  requireRole('admin'),
  validateBody(toggleBlockUserSchema),
  async (req, res, next) => {
    try {
      const targetUserId = parseObjectId(req.params.id);
      if (!targetUserId) {
        return res.status(400).json({ success: false, message: 'Invalid user ID.' });
      }

      if (String(targetUserId) === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Administrators cannot block their own account.',
        });
      }

      const { users } = getCollections();
      const target = await users.findOne(
        { _id: targetUserId },
        { projection: { role: 1, name: 1 } }
      );

      if (!target) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      if (target.role === 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Admin accounts cannot be blocked.',
        });
      }

      const { isBlocked } = req.validatedBody;
      await users.updateOne({ _id: targetUserId }, { $set: { isBlocked } });

      return res.status(200).json({
        success: true,
        message: isBlocked
          ? `${target.name || 'Customer'} has been blocked from protected features.`
          : `${target.name || 'Customer'} has been unblocked.`,
        isBlocked,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Admin: View Payment Transactions (strictly READ-ONLY — cannot be manually modified)
router.get('/admin/transactions', verifyJWT, requireRole('admin'), async (_req, res, next) => {
  try {
    const { transactions } = getCollections();
    const docs = await transactions
      .aggregate([
        { $sort: { createdAt: -1 } },
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
          $lookup: {
            from: 'appointments',
            localField: 'appointmentId',
            foreignField: '_id',
            as: 'appointment',
          },
        },
        { $unwind: { path: '$appointment', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'services',
            localField: 'appointment.serviceId',
            foreignField: '_id',
            as: 'service',
          },
        },
        { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            appointmentId: 1,
            customerId: 1,
            amount: 1,
            currency: 1,
            stripeSessionId: 1,
            status: 1,
            createdAt: 1,
            customerName: { $ifNull: ['$customer.name', 'Unknown Customer'] },
            customerEmail: { $ifNull: ['$customer.email', ''] },
            serviceName: { $ifNull: ['$service.serviceName', 'Salon Service'] },
            appointmentDate: { $ifNull: ['$appointment.appointmentDate', ''] },
            timeSlot: { $ifNull: ['$appointment.timeSlot', ''] },
          },
        },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      transactions: docs.map((t) => ({
        id: String(t._id),
        appointmentId: String(t.appointmentId),
        customerId: String(t.customerId),
        customerName: t.customerName,
        customerEmail: t.customerEmail,
        serviceName: t.serviceName,
        appointmentDate: t.appointmentDate,
        timeSlot: t.timeSlot,
        amount: t.amount,
        currency: t.currency,
        stripeSessionId: t.stripeSessionId,
        status: t.status,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
