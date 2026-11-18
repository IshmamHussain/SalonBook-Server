import { Router } from 'express';
import Stripe from 'stripe';
import { getCollections } from '../config/db.js';
import { env } from '../config/env.js';
import { requireRole, verifyJWT } from '../middleware/auth.js';
import { parseObjectId } from '../utils/validators.js';

const router = Router();

let stripeClient = null;
function getStripe() {
  if (!env.stripeSecretKey) {
    const err = new Error('Stripe is not configured. Add STRIPE_SECRET_KEY in environment variables.');
    err.statusCode = 503;
    throw err;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.stripeSecretKey);
  }
  return stripeClient;
}

/**
 * Verified Stripe Webhook Handler (mounted with express.raw BEFORE express.json).
 * Appointment paymentStatus is ONLY updated to 'paid' here after cryptographic signature verification.
 */
export async function stripeWebhookHandler(req, res) {
  try {
    const stripe = getStripe();
    const signature = req.headers['stripe-signature'];

    if (!signature || !env.stripeWebhookSecret) {
      return res.status(400).json({
        success: false,
        message: 'Missing Stripe signature or webhook secret configuration.',
      });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, env.stripeWebhookSecret);
    } catch (err) {
      console.error('[Stripe Webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const { appointments, transactions } = getCollections();

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const appointmentIdStr = session.metadata?.appointmentId;
      const customerIdStr = session.metadata?.customerId;

      if (session.payment_status === 'paid' && appointmentIdStr && customerIdStr) {
        const appointmentObjectId = parseObjectId(appointmentIdStr);
        const customerObjectId = parseObjectId(customerIdStr);

        if (appointmentObjectId && customerObjectId) {
          await Promise.all([
            appointments.updateOne(
              { _id: appointmentObjectId, customerId: customerObjectId },
              { $set: { paymentStatus: 'paid' } }
            ),
            transactions.updateOne(
              { stripeSessionId: session.id },
              {
                $setOnInsert: {
                  appointmentId: appointmentObjectId,
                  customerId: customerObjectId,
                  amount: Number(((session.amount_total || 0) / 100).toFixed(2)),
                  currency: (session.currency || 'usd').toUpperCase(),
                  stripeSessionId: session.id,
                  status: 'paid',
                  createdAt: new Date(),
                },
              },
              { upsert: true }
            ),
          ]);
        }
      }
    } else if (
      event.type === 'checkout.session.async_payment_failed' ||
      event.type === 'checkout.session.expired'
    ) {
      const session = event.data.object;
      const appointmentIdStr = session.metadata?.appointmentId;
      const customerIdStr = session.metadata?.customerId;

      if (appointmentIdStr && customerIdStr) {
        const appointmentObjectId = parseObjectId(appointmentIdStr);
        const customerObjectId = parseObjectId(customerIdStr);
        if (appointmentObjectId && customerObjectId) {
          await transactions.updateOne(
            { stripeSessionId: session.id },
            {
              $setOnInsert: {
                appointmentId: appointmentObjectId,
                customerId: customerObjectId,
                amount: Number(((session.amount_total || 0) / 100).toFixed(2)),
                currency: (session.currency || 'usd').toUpperCase(),
                stripeSessionId: session.id,
                status: 'failed',
                createdAt: new Date(),
              },
            },
            { upsert: true }
          );
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Handler error:', error.message);
    return res.status(500).json({ success: false, message: 'Webhook processing failed.' });
  }
}

// Customer: Create Stripe Checkout Session for a confirmed, unpaid appointment
router.post(
  '/create-checkout-session',
  verifyJWT,
  requireRole('customer'),
  async (req, res, next) => {
    try {
      const { appointmentId } = req.body || {};
      const appointmentObjectId = parseObjectId(appointmentId);
      if (!appointmentObjectId) {
        return res.status(400).json({ success: false, message: 'Valid appointmentId is required.' });
      }

      const { appointments, services } = getCollections();
      const appointment = await appointments.findOne({
        _id: appointmentObjectId,
        customerId: req.user.objectId,
      });

      if (!appointment) {
        return res.status(404).json({ success: false, message: 'Appointment not found.' });
      }

      if (appointment.status !== 'confirmed') {
        return res.status(400).json({
          success: false,
          message: 'Only confirmed appointments can be paid.',
        });
      }

      if (appointment.paymentStatus === 'paid') {
        return res.status(400).json({
          success: false,
          message: 'This appointment has already been paid.',
        });
      }

      const service = await services.findOne(
        { _id: appointment.serviceId },
        { projection: { serviceName: 1, category: 1, image: 1 } }
      );

      const stripe = getStripe();
      const amountInCents = Math.round(Number(appointment.servicePrice) * 100);

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: req.user.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: amountInCents,
              product_data: {
                name: service?.serviceName || 'SalonBook Appointment',
                description: `${service?.category || 'Salon Service'} · ${appointment.appointmentDate} at ${appointment.timeSlot}`,
                images: service?.image ? [service.image] : [],
              },
            },
          },
        ],
        metadata: {
          appointmentId: String(appointment._id),
          customerId: String(req.user.objectId),
          serviceName: service?.serviceName || 'Salon Service',
        },
        success_url: `${env.clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.clientUrl}/payment/cancel?appointmentId=${String(appointment._id)}`,
      });

      return res.status(200).json({
        success: true,
        url: session.url,
        sessionId: session.id,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Customer: Read-only verification status for the Payment Success page (does NOT mutate paymentStatus)
router.get('/session/:sessionId', verifyJWT, requireRole('customer'), async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ success: false, message: 'Missing Stripe session ID.' });
    }

    const { transactions, appointments, services } = getCollections();
    const tx = await transactions.findOne({
      stripeSessionId: sessionId,
      customerId: req.user.objectId,
    });

    if (!tx) {
      return res.status(200).json({
        success: true,
        verified: false,
        message: 'Payment received by Stripe; waiting for verified webhook confirmation.',
      });
    }

    const appointment = await appointments.findOne({ _id: tx.appointmentId });
    const service = appointment
      ? await services.findOne(
          { _id: appointment.serviceId },
          { projection: { serviceName: 1, category: 1 } }
        )
      : null;

    return res.status(200).json({
      success: true,
      verified: tx.status === 'paid',
      transaction: {
        id: String(tx._id),
        amount: tx.amount,
        currency: tx.currency,
        stripeSessionId: tx.stripeSessionId,
        status: tx.status,
        createdAt: tx.createdAt,
        serviceName: service?.serviceName || 'Salon Service',
        appointmentDate: appointment?.appointmentDate || '',
        timeSlot: appointment?.timeSlot || '',
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
