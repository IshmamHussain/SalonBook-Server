import { MongoClient } from 'mongodb';
import { env } from './env.js';

let client = null;
let database = null;

export async function connectToDatabase() {
  if (database && client) {
    return { client, db: database };
  }

  if (!env.mongodbUri) {
    throw new Error('MONGODB_URI is not configured in environment variables.');
  }

  client = new MongoClient(env.mongodbUri, {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10000,
  });

  await client.connect();
  database = client.db(env.mongodbDbName);

  // Skip blocking index creation on Vercel serverless cold starts (indexes are created by seed.js / local startup)
  if (!process.env.VERCEL) {
    await ensureIndexes(database);
  }

  return { client, db: database };
}

export function getDb() {
  if (!database) {
    throw new Error('Database has not been initialized. Call connectToDatabase() first.');
  }
  return database;
}

export function getClient() {
  if (!client) {
    throw new Error('MongoClient has not been initialized.');
  }
  return client;
}

export function getCollections() {
  const db = getDb();
  return {
    users: db.collection('users'),
    services: db.collection('services'),
    appointments: db.collection('appointments'),
    transactions: db.collection('transactions'),
  };
}

export async function ensureIndexes(db) {
  await Promise.all([
    db.collection('services').createIndexes([
      { key: { status: 1, category: 1, price: 1 }, name: 'services_status_category_price' },
      { key: { status: 1, createdAt: -1 }, name: 'services_status_created' },
      { key: { serviceName: 'text' }, name: 'services_name_text' },
    ]),
    db.collection('appointments').createIndexes([
      { key: { customerId: 1, createdAt: -1 }, name: 'appointments_customer_created' },
      { key: { status: 1, createdAt: -1 }, name: 'appointments_status_created' },
      {
        key: { appointmentDate: 1, timeSlot: 1 },
        name: 'appointments_unique_active_slot',
        unique: true,
        partialFilterExpression: { status: { $in: ['pending', 'confirmed'] } },
      },
    ]),
    db.collection('transactions').createIndexes([
      { key: { stripeSessionId: 1 }, name: 'transactions_stripe_session_unique', unique: true },
      { key: { customerId: 1, createdAt: -1 }, name: 'transactions_customer_created' },
      { key: { appointmentId: 1 }, name: 'transactions_appointment' },
    ]),
  ]);
}

export async function closeDatabase() {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
}
