import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  
  // Clean up existing data just in case
  await prisma.user.deleteMany({});
  
  const passwordHash = await argon2.hash('password123');
  
  // Seed Users
  const user1 = await prisma.user.create({
    data: {
      email: 'john.doe@example.com',
      passwordHash,
      firstName: 'John',
      lastName: 'Doe',
      profile: {
        create: {
          dateOfBirth: new Date('1990-05-15'),
          gender: 'Male',
          bio: 'Software engineer looking for a meaningful connection.',
          religion: 'Christian',
          caste: 'None',
          education: 'Master of Computer Science',
          occupation: 'Software Engineer',
          height: 180,
          maritalStatus: 'Never Married',
          city: 'New York',
          country: 'USA'
        }
      },
      preference: {
        create: {
          minAge: 25,
          maxAge: 35,
          minHeight: 160,
          maxHeight: 180,
          religions: JSON.stringify(['Christian', 'Catholic']),
          maritalStatuses: JSON.stringify(['Never Married'])
        }
      }
    }
  });

  const user2 = await prisma.user.create({
    data: {
      email: 'jane.smith@example.com',
      passwordHash,
      firstName: 'Jane',
      lastName: 'Smith',
      profile: {
        create: {
          dateOfBirth: new Date('1992-08-22'),
          gender: 'Female',
          bio: 'Marketing professional who loves traveling and reading.',
          religion: 'Christian',
          caste: 'None',
          education: 'Bachelor of Arts',
          occupation: 'Marketing Manager',
          height: 165,
          maritalStatus: 'Never Married',
          city: 'New York',
          country: 'USA'
        }
      },
      preference: {
        create: {
          minAge: 28,
          maxAge: 40,
          minHeight: 170,
          maxHeight: 190,
          religions: JSON.stringify(['Christian']),
          maritalStatuses: JSON.stringify(['Never Married'])
        }
      }
    }
  });

  const user3 = await prisma.user.create({
    data: {
      email: 'alice.johnson@example.com',
      passwordHash,
      firstName: 'Alice',
      lastName: 'Johnson',
      profile: {
        create: {
          dateOfBirth: new Date('1995-12-10'),
          gender: 'Female',
          bio: 'Doctor passionate about healthcare and family.',
          religion: 'Hindu',
          caste: 'Brahmin',
          education: 'MD',
          occupation: 'Doctor',
          height: 160,
          maritalStatus: 'Never Married',
          city: 'San Francisco',
          country: 'USA'
        }
      },
      preference: {
        create: {
          minAge: 28,
          maxAge: 38,
          minHeight: 165,
          maxHeight: 185,
          religions: JSON.stringify(['Hindu']),
          maritalStatuses: JSON.stringify(['Never Married'])
        }
      }
    }
  });

  const user4 = await prisma.user.create({
    data: {
      email: 'bob.williams@example.com',
      passwordHash,
      firstName: 'Bob',
      lastName: 'Williams',
      profile: {
        create: {
          dateOfBirth: new Date('1988-03-30'),
          gender: 'Male',
          bio: 'Entrepreneur looking for a supportive partner.',
          religion: 'Hindu',
          caste: 'Brahmin',
          education: 'MBA',
          occupation: 'Business Owner',
          height: 175,
          maritalStatus: 'Divorced',
          city: 'San Francisco',
          country: 'USA'
        }
      },
      preference: {
        create: {
          minAge: 25,
          maxAge: 35,
          minHeight: 150,
          maxHeight: 170,
          religions: JSON.stringify(['Hindu']),
          maritalStatuses: JSON.stringify(['Never Married', 'Divorced'])
        }
      }
    }
  });

  // Seed Admin User (dev/local verification only)
  const adminPasswordHash = await argon2.hash(process.env.ADMIN_SEED_PASSWORD || 'Admin@123456');
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@matrimony.com' },
    update: { role: 'ADMIN', status: 'ACTIVE', isBanned: false },
    create: {
      email: 'admin@matrimony.com',
      passwordHash: adminPasswordHash,
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
        },
      },
    },
  });

  console.log({ user1, user2, user3, user4, adminUser });
  console.log('Database seeded successfully! Admin: admin@matrimony.com / Admin@123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
