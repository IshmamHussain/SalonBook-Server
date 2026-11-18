import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { PREDEFINED_TIME_SLOTS, SERVICE_CATEGORIES, SERVICE_STATUSES } from './constants.js';

export function parseObjectId(raw) {
  if (typeof raw !== 'string' || !ObjectId.isValid(raw)) {
    return null;
  }
  return new ObjectId(raw);
}

export const createServiceSchema = z
  .object({
    serviceName: z.string().trim().min(2, 'Service name must be at least 2 characters').max(120),
    category: z.enum(SERVICE_CATEGORIES, { errorMap: () => ({ message: 'Invalid service category' }) }),
    description: z.string().trim().min(10, 'Description must be at least 10 characters').max(1500),
    price: z.coerce.number().positive('Price must be a positive number').max(50000),
    duration: z.coerce.number().int('Duration must be a whole number in minutes').positive('Duration must be a positive number').max(600),
    image: z.string().trim().url('A valid uploaded service image URL is required'),
    status: z.enum(SERVICE_STATUSES).optional().default('active'),
  })
  .strict();

export const updateServiceSchema = z
  .object({
    serviceName: z.string().trim().min(2).max(120).optional(),
    category: z.enum(SERVICE_CATEGORIES).optional(),
    description: z.string().trim().min(10).max(1500).optional(),
    price: z.coerce.number().positive('Price must be a positive number').max(50000).optional(),
    duration: z.coerce.number().int().positive('Duration must be a positive number').max(600).optional(),
    image: z.string().trim().url().optional(),
    status: z.enum(SERVICE_STATUSES).optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field must be provided for update' });

export const createAppointmentSchema = z
  .object({
    serviceId: z.string().trim().min(1, 'Service ID is required'),
    appointmentDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Appointment date must be in YYYY-MM-DD format'),
    timeSlot: z.enum(PREDEFINED_TIME_SLOTS, { errorMap: () => ({ message: 'Please select a valid predefined time slot' }) }),
    message: z.string().trim().max(500, 'Message cannot exceed 500 characters').optional().default(''),
  })
  .strict();

export const updateAppointmentStatusSchema = z
  .object({
    status: z.enum(['confirmed', 'cancelled']),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
    image: z
      .string()
      .trim()
      .refine((val) => val === '' || /^https?:\/\/.+/i.test(val), 'Profile image must be a valid URL')
      .optional(),
    phone: z.string().trim().max(30, 'Phone number is too long').optional().default(''),
  })
  .strict();

export const toggleBlockUserSchema = z
  .object({
    isBlocked: z.boolean(),
  })
  .strict();

export function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues?.[0];
      return res.status(400).json({
        success: false,
        message: firstIssue?.message || 'Invalid request payload',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.validatedBody = parsed.data;
    return next();
  };
}
