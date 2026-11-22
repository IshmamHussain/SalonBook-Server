import { initAuth } from './config/auth.js';
import { closeDatabase, connectToDatabase, ensureIndexes, getCollections } from './config/db.js';
import { assertRequiredEnv, env } from './config/env.js';

const SEED_SERVICES = [
  {
    serviceName: 'Precision Architectural Haircut & Blowout',
    category: 'Haircut & Styling',
    description:
      'Bespoke structural dry-and-wet cut tailored to face geometry and natural growth patterns, finished with a luminous brush blowout and botanical gloss serum.',
    price: 85,
    duration: 60,
    image:
      'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: 'Dimensional Lived-In Balayage',
    category: 'Hair Coloring',
    description:
      'Hand-painted custom ribbons crafted for seamless grow-out and sunlit depth, paired with an ammonia-free gloss toner and bond-building rinse.',
    price: 210,
    duration: 150,
    image:
      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: 'Silk Keratin & Bond Restoration Ritual',
    category: 'Hair Treatment',
    description:
      'Deep molecular repair infusion using cold-pressed botanical oils and micro-keratin peptides to restore mirror shine, elasticity, and frizz resistance.',
    price: 135,
    duration: 75,
    image:
      'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: 'Sculpting Lymphatic & LED Glow Facial',
    category: 'Facial & Skincare',
    description:
      'Buccal and lymphatic drainage facial combined with enzymatic exfoliation, cryo-glass globes, and red-light phototherapy for immediate skin clarity.',
    price: 145,
    duration: 75,
    image:
      'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: 'Editorial Soft-Focus Event Makeup',
    category: 'Makeup',
    description:
      'Skin-first complexion artistry and long-wear editorial eye work designed to photograph effortlessly under natural daylight and evening lighting.',
    price: 120,
    duration: 60,
    image:
      'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: 'Japanese Gloss Gel Manicure & Cuticle Care',
    category: 'Manicure & Pedicure',
    description:
      'Precision dry cuticle refinement, restorative nail-plate conditioning, and ultra-thin builder gel finish in neutral studio tones or high-gloss pigment.',
    price: 70,
    duration: 50,
    image:
      'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: 'Warm Basalt & Aromatherapy Restoration Massage',
    category: 'Spa & Massage',
    description:
      'Slow myofascial bodywork with heated volcanic basalt stones and custom cedar-bergamot oil blend to release deep shoulder and neck tension.',
    price: 160,
    duration: 90,
    image:
      'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: 'Signature Gloss Espresso Tint & Styling',
    category: 'Hair Coloring',
    description:
      'Rich tonal glaze for multi-dimensional brunette, copper, or cool-blonde vibrancy, completed with a sculpted wave finish.',
    price: 125,
    duration: 90,
    image:
      'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: 'Editorial Blowout & Velvet Wave Styling',
    category: 'Haircut & Styling',
    description:
      'Volume-lifted round-brush blowout and soft cinema waves locked in with weightless thermal botanical mist for multi-day polish.',
    price: 75,
    duration: 45,
    image:
      'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: 'Botanical Scalp Detox & Steam Therapy',
    category: 'Hair Treatment',
    description:
      'Micro-exfoliating rosemary scalp renewal paired with warm ozone micro-mist, pressure-point massage, and clarifying camellia tonic.',
    price: 110,
    duration: 60,
    image:
      'https://images.unsplash.com/photo-1522337094846-8a818192de1f?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: 'Hydra-Glow Vitamin C & Peptide Facial',
    category: 'Facial & Skincare',
    description:
      'Deep aqua-infusion cleansing followed by stabilized vitamin C serum, cooling peptide hydrogel mask, and barrier-sealing botanical mist.',
    price: 155,
    duration: 75,
    image:
      'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: 'Botanical Spa Pedicure & Warm Paraffin Ritual',
    category: 'Manicure & Pedicure',
    description:
      'Mineral soak, gentle volcanic pumice smoothing, restorative warm paraffin wrap, cuticle care, and long-wear lacquer or bare buffer shine.',
    price: 90,
    duration: 65,
    image:
      'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: "Gentlemen's Master Cut & Hot-Towel Beard Sculpt",
    category: 'Haircut & Styling',
    description:
      'Tailored scissor-over-comb master cut, precision neckline taper, straight-razor detailing, and restorative essential oil hot-towel beard treatment.',
    price: 65,
    duration: 50,
    image:
      'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: "Men's Botanical Grey Camo & Natural Blending",
    category: 'Hair Coloring',
    description:
      'Discreet matte demi-permanent color blending to seamlessly soften greys in 15 minutes, preserving natural dimension without warmth or brassiness.',
    price: 85,
    duration: 45,
    image:
      'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: "Men's Scalp Detox & Follicle Rejuvenation Therapy",
    category: 'Hair Treatment',
    description:
      'Clinical scalp exfoliating therapy with tea tree, peppermint micro-exfoliation, high-frequency stimulation, and follicle-fortifying peptide serum.',
    price: 95,
    duration: 50,
    image:
      'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1200&q=80',
    status: 'active',
  },
  {
    serviceName: "Gentlemen's Deep Pore Refining & Charcoal Facial",
    category: 'Facial & Skincare',
    description:
      'Targeted male skin clarifying facial: eucalyptus steam, ultrasonic pore extraction, activated charcoal mask, and cold-pressed antioxidant hydration.',
    price: 120,
    duration: 60,
    image:
      'https://i.ibb.co/5hrGrT3d/men-facial.jpg',
    status: 'active',
  },
  {
    serviceName: "Men's Deep Tissue & Myofascial Recovery Massage",
    category: 'Spa & Massage',
    description:
      'Intensive full-body pressure work focusing on neck, lower back, and shoulder mobility using arnica massage balm and warm therapeutic compresses.',
    price: 150,
    duration: 75,
    image:
      'https://i.ibb.co/qFcb2yYq/men-massage.jpg',
    status: 'active',
  },
];

async function seed() {
  assertRequiredEnv();
  const { client, db } = await connectToDatabase();
  await ensureIndexes(db);
  const auth = initAuth(db, client);
  const { users, services } = getCollections();

  // 1. Seed curated active salon services idempotently
  let insertedServices = 0;
  for (const item of SEED_SERVICES) {
    const existing = await services.findOne({ serviceName: item.serviceName });
    if (!existing) {
      await services.insertOne({ ...item, createdAt: new Date() });
      insertedServices += 1;
    }
  }
  console.log(`[Seed] Services checked. Inserted ${insertedServices} new services.`);

  // 2. Seed Admin account securely through Better Auth API, then elevate role in MongoDB
  if (!env.seedAdminEmail || !env.seedAdminPassword) {
    console.log('[Seed] Skipping admin creation (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env to seed an admin).');
  } else {
    const existingAdmin = await users.findOne({ email: env.seedAdminEmail.toLowerCase() });
    if (!existingAdmin) {
      await auth.api.signUpEmail({
        body: {
          name: env.seedAdminName,
          email: env.seedAdminEmail.toLowerCase(),
          password: env.seedAdminPassword,
        },
      });
      await users.updateOne(
        { email: env.seedAdminEmail.toLowerCase() },
        { $set: { role: 'admin', isBlocked: false } }
      );
      console.log(`[Seed] Created Admin account: ${env.seedAdminEmail}`);
    } else {
      await users.updateOne(
        { _id: existingAdmin._id },
        { $set: { role: 'admin', isBlocked: false } }
      );
      console.log(`[Seed] Verified Admin role for existing account: ${env.seedAdminEmail}`);
    }
  }

  await closeDatabase();
  console.log('[Seed] Done.');
}

seed().catch((err) => {
  console.error('[Seed] Failed:', err.message);
  process.exit(1);
});
