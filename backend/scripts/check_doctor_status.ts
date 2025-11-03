/**
 * Script to check Dr. Praneeta Jain's account status
 * 
 * Usage: npx ts-node scripts/check_doctor_status.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDoctorStatus() {
  try {
    console.log('🔍 Searching for Dr. Praneeta Jain...\n');

    // Search by name (case-insensitive)
    const doctors = await prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: 'Praneeta', mode: 'insensitive' } },
          { lastName: { contains: 'Jain', mode: 'insensitive' } },
          { 
            AND: [
              { firstName: { contains: 'Praneeta', mode: 'insensitive' } },
              { lastName: { contains: 'Jain', mode: 'insensitive' } },
            ]
          },
        ],
        role: 'DOCTOR',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        isActive: true,
        branchId: true,
        employeeId: true,
        designation: true,
        department: true,
        statusReason: true,
        createdAt: true,
        updatedAt: true,
        branch: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    if (doctors.length === 0) {
      console.log('❌ No doctor found with name "Praneeta Jain"');
      console.log('\n📋 Let me show you all doctors in the system:\n');
      
      const allDoctors = await prisma.user.findMany({
        where: { role: 'DOCTOR' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
          isActive: true,
          branchId: true,
          branch: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { firstName: 'asc' },
      });

      console.log(`Found ${allDoctors.length} doctor(s):\n`);
      allDoctors.forEach((doc, idx) => {
        const fullName = `${doc.firstName} ${doc.lastName}`;
        const statusIcon = doc.isActive && doc.status === 'ACTIVE' ? '✅' : '❌';
        console.log(
          `${idx + 1}. ${statusIcon} ${fullName.padEnd(30)} | Email: ${doc.email.padEnd(35)} | Status: ${doc.status.padEnd(10)} | Active: ${doc.isActive} | Branch: ${doc.branch.name}`
        );
      });
      return;
    }

    console.log(`✅ Found ${doctors.length} doctor(s) matching "Praneeta Jain":\n`);

    doctors.forEach((doctor, idx) => {
      const fullName = `Dr. ${doctor.firstName} ${doctor.lastName}`;
      const statusIcon = doctor.isActive && doctor.status === 'ACTIVE' ? '✅' : '⚠️';
      
      console.log(`${statusIcon} Doctor #${idx + 1}: ${fullName}`);
      console.log('━'.repeat(80));
      console.log(`📧 Email:           ${doctor.email}`);
      console.log(`📱 Phone:           ${doctor.phone || 'N/A'}`);
      console.log(`🆔 ID:              ${doctor.id}`);
      console.log(`👤 Role:            ${doctor.role}`);
      console.log(`📊 Status:          ${doctor.status} ${doctor.status === 'ACTIVE' ? '✅' : '❌'}`);
      console.log(`🔓 Is Active:       ${doctor.isActive ? 'Yes ✅' : 'No ❌'}`);
      console.log(`🏥 Branch:          ${doctor.branch.name} (${doctor.branchId})`);
      console.log(`🏢 Branch Active:   ${doctor.branch.isActive ? 'Yes ✅' : 'No ❌'}`);
      console.log(`💼 Employee ID:     ${doctor.employeeId || 'N/A'}`);
      console.log(`👔 Designation:     ${doctor.designation || 'N/A'}`);
      console.log(`🏛️  Department:      ${doctor.department || 'N/A'}`);
      
      if (doctor.statusReason) {
        console.log(`⚠️  Status Reason:   ${doctor.statusReason}`);
      }
      
      console.log(`📅 Created:         ${doctor.createdAt.toISOString()}`);
      console.log(`🔄 Last Updated:    ${doctor.updatedAt.toISOString()}`);
      console.log('━'.repeat(80));

      // Diagnosis
      console.log('\n🔍 DIAGNOSIS:\n');
      
      const issues: string[] = [];
      const canBookAppointments = doctor.isActive && 
                                   doctor.status === 'ACTIVE' && 
                                   doctor.branch.isActive;

      if (!doctor.isActive) {
        issues.push('❌ Doctor account is INACTIVE (isActive = false)');
      }
      if (doctor.status !== 'ACTIVE') {
        issues.push(`❌ Doctor status is "${doctor.status}" (should be "ACTIVE")`);
      }
      if (!doctor.branch.isActive) {
        issues.push('❌ Doctor\'s branch is INACTIVE');
      }

      if (issues.length > 0) {
        console.log('⚠️  ISSUES FOUND:');
        issues.forEach(issue => console.log(`   ${issue}`));
        console.log('\n💡 SOLUTION: Appointments cannot be booked because of the above issues.');
        console.log('   Fix by running:');
        console.log(`   
   UPDATE users 
   SET "isActive" = true, 
       status = 'ACTIVE', 
       "updatedAt" = NOW()
   WHERE id = '${doctor.id}';
        `);
      } else {
        console.log('✅ All checks passed! This doctor SHOULD be bookable.');
        console.log('   If appointments still cannot be booked, the issue might be:');
        console.log('   1. Frontend not showing the doctor (refresh browser/clear cache)');
        console.log('   2. Receptionist account permissions issue');
        console.log('   3. Branch mismatch (receptionist in different branch)');
      }

      console.log(`\n📊 Can book appointments: ${canBookAppointments ? '✅ YES' : '❌ NO'}\n`);
    });

    // Check for appointments
    console.log('\n📅 Recent Appointments for this doctor:\n');
    const recentAppointments = await prisma.appointment.findMany({
      where: {
        doctorId: { in: doctors.map(d => d.id) },
      },
      include: {
        patient: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 5,
    });

    if (recentAppointments.length > 0) {
      console.log(`Found ${recentAppointments.length} recent appointment(s):\n`);
      recentAppointments.forEach((apt, idx) => {
        const patientName = apt.patient.name;
        console.log(
          `${idx + 1}. ${apt.date.toISOString().split('T')[0]} at ${apt.slot} | ` +
          `Patient: ${patientName.padEnd(25)} | Status: ${apt.status.padEnd(12)} | Type: ${apt.visitType}`
        );
      });
    } else {
      console.log('No appointments found for this doctor.');
    }

  } catch (error) {
    console.error('❌ Error checking doctor status:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkDoctorStatus()
  .then(() => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

