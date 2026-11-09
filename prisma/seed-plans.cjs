const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const plansToSeed = [
  {
    code: 'BASIC',
    name: '1 Month Chat Permit',
    badge: 'Basic',
    price: 500,
    formattedPrice: '₹500',
    period: 'per month',
    durationDays: 30,
    description: 'Active Premium for 30 days with verified contacts and daily interest quota.',
    features: [
      'Active Premium for 30 days',
      'Send "Interests" only 20 per day',
      'Unlimited messaging with matches',
      'Standard Profile Visibility',
      'Verified Contact Numbers - 20',
    ],
    contactCredits: 20,
    dailyInterestsLimit: 20,
    popular: false,
    isActive: true,
    displayOrder: 1,
  },
  {
    code: 'STANDARD',
    name: '3 Months Chat Permit',
    badge: 'Standard',
    price: 1250,
    formattedPrice: '₹1,250',
    period: 'for 90 days',
    durationDays: 90,
    description: 'Our most popular plan. Active matchmaking with verified connections.',
    features: [
      'Active Premium for 90 days',
      'Send "Interests" only 40/ day',
      'Unlimited messaging with matches',
      'Priority profile visibility',
      'Can View/Get Verified Contact Numbers',
    ],
    contactCredits: 60,
    dailyInterestsLimit: 40,
    popular: true,
    isActive: true,
    displayOrder: 2,
  },
  {
    code: 'PLUS',
    name: '6 Months Permit',
    badge: 'Plus',
    price: 2500,
    formattedPrice: '₹2,500',
    period: 'for 180 days',
    durationDays: 180,
    description: 'Serious about finding a match with extended priority connection time.',
    features: [
      'Active Premium for 180 days',
      'Send "Interests" - Unlimited',
      'Unlimited messaging with matches',
      'High profile visibility',
      'Can View/Get 120 verified Contact Numbers',
    ],
    contactCredits: 120,
    dailyInterestsLimit: 9999,
    popular: false,
    isActive: true,
    displayOrder: 3,
  },
  {
    code: 'ELITE',
    name: 'One year Chat permit',
    badge: 'Elite',
    price: 5000,
    formattedPrice: '₹5,000',
    period: 'for one year',
    durationDays: 365,
    description: 'Complete peace of mind with one year of full unlimited access.',
    features: [
      'Active premium for one year',
      'Send interests unlimited',
      'Unlimited chat with matches',
      'High profile visibility.',
      'Can get unlimited contact numbers.',
    ],
    contactCredits: 9999,
    dailyInterestsLimit: 9999,
    popular: false,
    isActive: true,
    displayOrder: 4,
  },
];

async function seedPlans() {
  console.log('Seeding modified subscription plans into Plan table...');
  for (const p of plansToSeed) {
    const upserted = await prisma.plan.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        badge: p.badge,
        price: p.price,
        formattedPrice: p.formattedPrice,
        period: p.period,
        durationDays: p.durationDays,
        description: p.description,
        features: p.features,
        contactCredits: p.contactCredits,
        dailyInterestsLimit: p.dailyInterestsLimit,
        popular: p.popular,
        isActive: p.isActive,
        displayOrder: p.displayOrder,
      },
      update: {
        name: p.name,
        badge: p.badge,
        price: p.price,
        formattedPrice: p.formattedPrice,
        period: p.period,
        durationDays: p.durationDays,
        description: p.description,
        features: p.features,
        contactCredits: p.contactCredits,
        dailyInterestsLimit: p.dailyInterestsLimit,
        popular: p.popular,
        isActive: p.isActive,
        displayOrder: p.displayOrder,
      },
    });
    console.log(`✓ Upserted plan [${upserted.code}]: ${upserted.name} (${upserted.formattedPrice}, ${upserted.durationDays}d, ${upserted.contactCredits} credits, ${upserted.dailyInterestsLimit} interests/day)`);
  }
  console.log('All plans successfully seeded into database!');
}

seedPlans()
  .catch((err) => {
    console.error('Error seeding plans:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

