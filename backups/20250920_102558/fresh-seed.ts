import { PrismaClient, UserRole, UserStatus, PaymentMode } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting fresh seed...');

  // Create branch
  let branch = await prisma.branch.findFirst();
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        id: 'branch-seed-1',
        name: 'Main Dermatology Clinic',
        address: 'Hyderabad, Telangana',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
        phone: '9000000000',
        email: 'info@dermclinic.com',
        isActive: true,
      },
    });
    console.log('Created branch');
  }

  // Users: create one per role
  const userCount = await prisma.user.count();
  let usersCreated = 0;
  
  if (userCount === 0) {
    const passwordHash = await bcrypt.hash('password123', 10);
    
    // Create Admin
    await prisma.user.create({
      data: {
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

    // Create Doctor 1 - Dr. Shravya
    await prisma.user.create({
      data: {
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

    // Create Doctor 2 - Dr. Praneeta
    await prisma.user.create({
      data: {
        firstName: 'Praneeta',
        lastName: 'Jain',
        email: 'praneeta@clinic.test',
        phone: '9000000002',
        password: passwordHash,
        role: UserRole.DOCTOR,
        status: UserStatus.ACTIVE,
        branchId: branch.id,
        isActive: true,
      },
    });

    // Create Receptionist
    await prisma.user.create({
      data: {
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

    usersCreated = 4;
    console.log('Created users: 1 Admin, 2 Doctors (Shravya, Praneeta), 1 Receptionist');
  }

  // Rooms: create specific configuration
  const roomCount = await prisma.room.count();
  let roomsCreated = 0;
  
  if (roomCount === 0) {
    const rooms = [
      // 2 Consultation Rooms
      { id: 'room-consult-1', name: 'Consultation Room 1', type: 'Consult', capacity: 3 },
      { id: 'room-consult-2', name: 'Consultation Room 2', type: 'Consult', capacity: 3 },
      // 3 Procedure Rooms
      { id: 'room-procedure-1', name: 'Procedure Room 1', type: 'Procedure', capacity: 2 },
      { id: 'room-procedure-2', name: 'Procedure Room 2', type: 'Procedure', capacity: 2 },
      { id: 'room-procedure-3', name: 'Procedure Room 3', type: 'Procedure', capacity: 2 },
      // 1 Telemedicine Room
      { id: 'room-telemedicine-1', name: 'Telemedicine Suite', type: 'Telemed', capacity: 1 },
    ];

    for (const roomData of rooms) {
      await prisma.room.create({
        data: {
          id: roomData.id,
          name: roomData.name,
          type: roomData.type,
          capacity: roomData.capacity,
          isActive: true,
          branchId: branch.id,
        },
      });
      roomsCreated++;
    }
    console.log(`Created ${roomsCreated} rooms: 2 Consultation, 3 Procedure, 1 Telemedicine`);
  }

  // Patients: create 10 dermatology patients with [TEST] tag
  const patientCount = await prisma.patient.count();
  let patientsCreated = 0;
  
  if (patientCount === 0) {
    const dermatologyPatients = [
      {
        id: 'patient-test-1',
        name: '[TEST] Rajesh Kumar',
        gender: 'M',
        dob: new Date('1985-03-15'),
        phone: '9876543210',
        email: 'rajesh.kumar@test.com',
        address: 'Banjara Hills, Hyderabad, Telangana 500034',
      },
      {
        id: 'patient-test-2',
        name: '[TEST] Priya Sharma',
        gender: 'F',
        dob: new Date('1992-07-22'),
        phone: '9876543211',
        email: 'priya.sharma@test.com',
        address: 'Jubilee Hills, Hyderabad, Telangana 500033',
      },
      {
        id: 'patient-test-3',
        name: '[TEST] Arjun Reddy',
        gender: 'M',
        dob: new Date('1988-11-10'),
        phone: '9876543212',
        email: 'arjun.reddy@test.com',
        address: 'Gachibowli, Hyderabad, Telangana 500032',
      },
      {
        id: 'patient-test-4',
        name: '[TEST] Kavya Patel',
        gender: 'F',
        dob: new Date('1995-01-08'),
        phone: '9876543213',
        email: 'kavya.patel@test.com',
        address: 'Kondapur, Hyderabad, Telangana 500084',
      },
      {
        id: 'patient-test-5',
        name: '[TEST] Vikram Singh',
        gender: 'M',
        dob: new Date('1980-09-25'),
        phone: '9876543214',
        email: 'vikram.singh@test.com',
        address: 'Madhapur, Hyderabad, Telangana 500081',
      },
      {
        id: 'patient-test-6',
        name: '[TEST] Ananya Gupta',
        gender: 'F',
        dob: new Date('1990-12-03'),
        phone: '9876543215',
        email: 'ananya.gupta@test.com',
        address: 'Hitech City, Hyderabad, Telangana 500081',
      },
      {
        id: 'patient-test-7',
        name: '[TEST] Rohit Agarwal',
        gender: 'M',
        dob: new Date('1987-06-18'),
        phone: '9876543216',
        email: 'rohit.agarwal@test.com',
        address: 'Begumpet, Hyderabad, Telangana 500016',
      },
      {
        id: 'patient-test-8',
        name: '[TEST] Deepika Nair',
        gender: 'F',
        dob: new Date('1993-04-12'),
        phone: '9876543217',
        email: 'deepika.nair@test.com',
        address: 'Kukatpally, Hyderabad, Telangana 500072',
      },
      {
        id: 'patient-test-9',
        name: '[TEST] Sanjay Mehta',
        gender: 'M',
        dob: new Date('1975-08-30'),
        phone: '9876543218',
        email: 'sanjay.mehta@test.com',
        address: 'Secunderabad, Telangana 500003',
      },
      {
        id: 'patient-test-10',
        name: '[TEST] Meera Krishnan',
        gender: 'F',
        dob: new Date('1991-10-05'),
        phone: '9876543219',
        email: 'meera.krishnan@test.com',
        address: 'Miyapur, Hyderabad, Telangana 500049',
      }
    ];

    for (const patientData of dermatologyPatients) {
      await prisma.patient.create({
        data: {
          id: patientData.id,
          name: patientData.name,
          gender: patientData.gender,
          dob: patientData.dob,
          phone: patientData.phone,
          email: patientData.email,
          address: patientData.address,
          branchId: branch.id,
        },
      });
      patientsCreated++;
    }
    console.log(`Created ${patientsCreated} dermatology test patients with [TEST] tags`);
  }

  // Create some sample services for invoicing
  const serviceCount = await prisma.service.count();
  let servicesCreated = 0;
  
  if (serviceCount === 0) {
    const services = [
      { name: 'Dermatology Consultation', price: 800, gstRate: 0 },
      { name: 'Acne Treatment', price: 1500, gstRate: 18 },
      { name: 'Skin Analysis', price: 1000, gstRate: 18 },
    ];

    for (const serviceData of services) {
      await prisma.service.create({
        data: {
          name: serviceData.name,
          type: 'Consult',
          taxable: serviceData.gstRate > 0,
          gstRate: serviceData.gstRate,
          priceMrp: serviceData.price,
          priceNet: serviceData.price,
          branchId: branch.id,
        },
      });
      servicesCreated++;
    }
    console.log(`Created ${servicesCreated} sample services`);
  }

  console.log('Fresh seed completed successfully!');
  console.log({
    branch: branch.id,
    usersCreated,
    roomsCreated,
    patientsCreated,
    servicesCreated
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 