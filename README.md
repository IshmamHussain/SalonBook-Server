# SalonBook — Server (REST API)

Backend REST API for **SalonBook**, a role-based salon appointment booking platform with Better Auth authentication, Express JWT verification middleware, native MongoDB driver persistence, ImgBB image hosting, and verified Stripe Checkout webhooks.

## Important Features

- **Native MongoDB Driver (No Mongoose)** with 4 structured collections (`users`, `services`, `appointments`, `transactions`) plus Better Auth managed auth collections.
- **Better Auth + Express JWT Verification Middleware**: Supports Email/Password and Google OAuth, issues signed JWTs, verifies `Authorization: Bearer <token>` on all protected routes, enforces `admin`/`customer` role checks server-side, and immediately denies blocked users.
- **Salon Service Management**: Public active-service browsing with search by name, category filtering, and price sorting; Admin CRUD and Active/Inactive status toggles.
- **Conflict-Free Appointment Booking**: Enforces active-service checks, rejects past dates, blocks admin self-booking, and guarantees zero duplicate active appointments for the same date and time slot via both query check and MongoDB partial unique index.
- **Verified Stripe Checkout & Webhook Flow**: Customers can only pay for their own `confirmed` + `unpaid` appointments. Appointment `paymentStatus` is updated to `paid` and saved in `transactions` **exclusively** inside the cryptographically verified `POST /api/payments/webhook` handler.
- **ImgBB Upload Proxy**: Uploads service and profile images securely server-side so `IMGBB_API_KEY` is never exposed to clients.
- **Performance & Security**: `compression`, `helmet`, strict CORS with credentials, Zod input validation, and parallel `Promise.all` dashboard aggregations.

## Technology Stack

- Node.js & Express.js 5
- MongoDB (Official Native `mongodb` Driver)
- Better Auth (`better-auth` + MongoDB adapter + JWT plugin)
- `jsonwebtoken` & `jose` (Express JWT verification middleware)
- Stripe SDK (Checkout Sessions + Webhook Signature Verification)
- Multer + ImgBB API
- Zod, Helmet, CORS, Compression

## Installation Instructions

```bash
git clone <your-server-repo-url>
cd server
npm install
```

Create a `.env` file in `server/` based on `.env.example`.

## How to Run the Project Locally

```bash
# 1. Seed 8 curated active salon services and the initial Admin account
npm run seed

# 2. Start the development server with auto-reload
npm run dev

# Or start in production mode
npm start
```

For local Stripe webhook testing, forward events using the Stripe CLI:

```bash
stripe listen --forward-to http://localhost:5000/api/payments/webhook
```

## Required Environment Variables

Configure these variable names in `.env` (never commit actual secret values):

- `PORT`
- `NODE_ENV`
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `SERVER_URL`
- `CLIENT_URL`
- `TRUSTED_ORIGINS`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `JWT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `IMGBB_API_KEY`
- `SEED_ADMIN_NAME`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

## Links

- **Live Website**: https://salon-book-client-umber.vercel.app
- **Client Repository**: https://github.com/IshmamHussain/SalonBook-Client
- **Server Repository**: https://github.com/IshmamHussain/SalonBook-Server
