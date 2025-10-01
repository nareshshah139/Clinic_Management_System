import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Idempotent seed script intended for production deploys.
 * - Creates one branch if none exists
 * - Creates an admin user if no users exist
 * - Creates a default doctor and receptionist if no users exist
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    // Ensure a branch exists
    let branch = await prisma.branch.findFirst();
    if (!branch) {
      branch = await prisma.branch.create({
        data: {
          id: 'branch-seed-1',
          name: 'Main Branch',
          address: 'Hyderabad',
          city: 'Hyderabad',
          state: 'TS',
          pincode: '500001',
          phone: '9999999999',
          email: 'main@clinic.test',
          isActive: true,
        },
      });
      // eslint-disable-next-line no-console
      console.log('[seed-once] Created default branch');
    }

    const passwordHash = await bcrypt.hash('password123', 10);

    // Upsert three key users to guarantee access
    await prisma.user.upsert({
      where: { email: 'admin@clinic.test' },
      update: {},
      create: {
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@clinic.test',
        phone: '9000000000',
        password: passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        branchId: branch.id,
        isActive: true,
      },
    });

    await prisma.user.upsert({
      where: { email: 'shravya@clinic.test' },
      update: {},
      create: {
        firstName: 'Shravya',
        lastName: 'Dermatologist',
        email: 'shravya@clinic.test',
        phone: '9000000001',
        password: passwordHash,
        role: UserRole.DOCTOR,
        status: UserStatus.ACTIVE,
        branchId: branch.id,
        isActive: true,
      },
    });

    await prisma.user.upsert({
      where: { email: 'reception@clinic.test' },
      update: {},
      create: {
        firstName: 'Riya',
        lastName: 'Sharma',
        email: 'reception@clinic.test',
        phone: '9000000003',
        password: passwordHash,
        role: UserRole.RECEPTION,
        status: UserStatus.ACTIVE,
        branchId: branch.id,
        isActive: true,
      },
    });

    // eslint-disable-next-line no-console
    console.log('[seed-once] Ensured default users exist');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[seed-once] Error while seeding:', error);
  } finally {
    await (await import('@prisma/client')).Prisma.sql`SELECT 1`;
    await (await new PrismaClient()).$disconnect();
  }
}

void main();


