import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Create or get branch
    const branch = await prisma.branch.upsert({
      where: { id: 'branch-seed-1' },
      update: {},
      create: {
        id: 'branch-seed-1',
        name: 'Main Branch',
        address: 'Hyderabad',
        city: 'Hyderabad',
        state: 'TS',
        pincode: '500001',
        phone: '9999999999',
        email: 'main@clinic.test',
        website: 'https://clinic.test',
        isActive: true,
      },
    });

    // Create or get doctor user
    const passwordHash = await bcrypt.hash('password123', 10);
    const doctor = await prisma.user.upsert({
      where: { email: 'doctor1@clinic.test' },
      update: {},
      create: {
        firstName: 'Asha',
        lastName: 'Rao',
        email: 'doctor1@clinic.test',
        phone: '9000000001',
        password: passwordHash,
        role: UserRole.DOCTOR,
        status: UserStatus.ACTIVE,
        branchId: branch.id,
        isActive: true,
      },
    });

    // Create or get receptionist user for login
    const receptionist = await prisma.user.upsert({
      where: { email: 'reception@clinic.test' },
      update: {},
      create: {
        firstName: 'Riya',
        lastName: 'Sharma',
        email: 'reception@clinic.test',
        phone: '9000000002',
        password: await bcrypt.hash('password123', 10),
        role: UserRole.RECEPTION,
        status: UserStatus.ACTIVE,
        branchId: branch.id,
        isActive: true,
      },
    });

    // Create or get room
    const room = await prisma.room.upsert({
      where: { id: 'room-seed-1' },
      update: {},
      create: {
        id: 'room-seed-1',
        name: 'Consultation Room 1',
        type: 'Consultation',
        capacity: 1,
        isActive: true,
        branchId: branch.id,
      },
    });

    // Create or get patient
    const patient = await prisma.patient.upsert({
      where: { id: 'patient-seed-1' },
      update: {},
      create: {
        id: 'patient-seed-1',
        name: 'John Doe',
        gender: 'M',
        dob: new Date('1990-01-01'),
        phone: '9000001000',
        email: 'john.doe@patient.test',
        address: 'Hyderabad',
        branchId: branch.id,
      },
    });

    console.log('Seed complete:', { branch: branch.id, doctor: doctor.id, receptionist: receptionist.id, room: room.id, patient: patient.id });
  } finally {
    await (await import('@prisma/client')).Prisma.sql`SELECT 1`;
    await (await new PrismaClient()).$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}); 