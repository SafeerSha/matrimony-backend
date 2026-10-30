const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_SEED_EMAIL || 'admin@matrimony.com';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD || 'Admin@123456';

  console.log(`Hashing admin password for ${adminEmail}...`);
  const passwordHash = await argon2.hash(adminPassword);

  const existing = await prisma.user.findFirst({
    where: { email: adminEmail },
    include: { profile: true },
  });

  if (existing) {
    console.log(`Found existing user with email ${adminEmail}. Updating to ADMIN with active password...`);
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: 'ADMIN',
        status: 'ACTIVE',
        isBanned: false,
        passwordHash,
        isPasswordEnabled: true,
        isEmailVerified: true,
      },
    });
    console.log('Admin user updated successfully:', {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      isPasswordEnabled: updated.isPasswordEnabled,
    });
  } else {
    console.log(`Creating new ADMIN user for ${adminEmail}...`);
    const created = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        isPasswordEnabled: true,
        firstName: 'System',
        lastName: 'Administrator',
        role: 'ADMIN',
        status: 'ACTIVE',
        isEmailVerified: true,
        isPhoneVerified: true,
        profile: {
          create: {
            gender: 'Other',
            bio: 'System Administrator Account',
            city: 'Bangalore',
            country: 'India',
            category: 'Marriage',
            profileFor: 'Myself',
          },
        },
      },
      include: { profile: true },
    });
    console.log('Admin user created successfully:', {
      id: created.id,
      email: created.email,
      role: created.role,
      status: created.status,
      isPasswordEnabled: created.isPasswordEnabled,
    });
  }

  // Verify argon2 hash immediately
  const adminCheck = await prisma.user.findFirst({ where: { email: adminEmail } });
  const matches = await argon2.verify(adminCheck.passwordHash, adminPassword);
  console.log(`Password verification test for '${adminPassword}':`, matches ? 'SUCCESS (MATCH)' : 'FAILED (NO MATCH)');
}

main()
  .catch((err) => {
    console.error('Error seeding admin user:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
