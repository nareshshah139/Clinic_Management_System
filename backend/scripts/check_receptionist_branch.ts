/**
 * Script to check if receptionist accounts are in the correct branch
 * 
 * Usage: npx ts-node scripts/check_receptionist_branch.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkReceptionistBranches() {
  try {
    console.log('🔍 Checking all RECEPTION users and their branches...\n');

    // Get all receptionists
    const receptionists = await prisma.user.findMany({
      where: {
        role: 'RECEPTION',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        isActive: true,
        branchId: true,
        createdAt: true,
        branch: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
      },
      orderBy: { firstName: 'asc' },
    });

    if (receptionists.length === 0) {
      console.log('❌ No receptionists found in the system.');
      return;
    }

    console.log(`✅ Found ${receptionists.length} receptionist(s):\n`);

    // Get Dr. Praneeta Jain's branch for comparison
    const drPraneeta = await prisma.user.findFirst({
      where: {
        firstName: { contains: 'Praneeta', mode: 'insensitive' },
        lastName: { contains: 'Jain', mode: 'insensitive' },
        role: 'DOCTOR',
      },
      select: {
        branchId: true,
        branch: {
          select: {
            name: true,
          },
        },
      },
    });

    const praneetaBranchId = drPraneeta?.branchId;
    const praneetaBranchName = drPraneeta?.branch.name;

    console.log(`📌 Dr. Praneeta Jain is in branch: "${praneetaBranchName}" (${praneetaBranchId})\n`);
    console.log('━'.repeat(100));

    receptionists.forEach((receptionist, idx) => {
      const fullName = `${receptionist.firstName} ${receptionist.lastName}`;
      const statusIcon = receptionist.isActive && receptionist.status === 'ACTIVE' ? '✅' : '⚠️';
      const branchMatch = receptionist.branchId === praneetaBranchId;
      const matchIcon = branchMatch ? '✅' : '❌';

      console.log(`\n${statusIcon} Receptionist #${idx + 1}: ${fullName}`);
      console.log(`   Email:           ${receptionist.email}`);
      console.log(`   Phone:           ${receptionist.phone || 'N/A'}`);
      console.log(`   Status:          ${receptionist.status} | Active: ${receptionist.isActive}`);
      console.log(`   Branch:          ${receptionist.branch.name} (${receptionist.branchId})`);
      console.log(`   Branch Active:   ${receptionist.branch.isActive ? 'Yes' : 'No'}`);
      console.log(`   ${matchIcon} Can book for Dr. Praneeta: ${branchMatch ? 'YES' : 'NO - DIFFERENT BRANCH'}`);
      console.log(`   Created:         ${receptionist.createdAt.toISOString().split('T')[0]}`);

      if (!branchMatch) {
        console.log(`\n   ⚠️  FIX: This receptionist needs to be moved to "${praneetaBranchName}"`);
        console.log(`   SQL to fix:`);
        console.log(`   UPDATE users SET "branchId" = '${praneetaBranchId}', "updatedAt" = NOW() WHERE id = '${receptionist.id}';`);
      }
    });

    console.log('\n' + '━'.repeat(100));
    console.log('\n📊 SUMMARY:\n');
    
    const activeReceptionists = receptionists.filter(r => r.isActive && r.status === 'ACTIVE');
    const correctBranchReceptionists = activeReceptionists.filter(r => r.branchId === praneetaBranchId);
    const wrongBranchReceptionists = activeReceptionists.filter(r => r.branchId !== praneetaBranchId);

    console.log(`Total Receptionists:              ${receptionists.length}`);
    console.log(`Active Receptionists:             ${activeReceptionists.length}`);
    console.log(`✅ In correct branch (can book):   ${correctBranchReceptionists.length}`);
    console.log(`❌ In wrong branch (cannot book):  ${wrongBranchReceptionists.length}`);

    if (wrongBranchReceptionists.length > 0) {
      console.log('\n⚠️  ACTION REQUIRED:');
      console.log(`   ${wrongBranchReceptionists.length} receptionist(s) are in the wrong branch and cannot book for Dr. Praneeta Jain.`);
      console.log('   Review the SQL commands above to fix.');
    } else if (activeReceptionists.length > 0) {
      console.log('\n✅ All active receptionists are in the correct branch!');
      console.log('   If booking still fails, check:');
      console.log('   1. Receptionist account status (should be ACTIVE with isActive=true)');
      console.log('   2. Frontend cache (hard refresh browser)');
      console.log('   3. Any client-side errors in browser console');
    }

    // Show all doctors in the same branch
    console.log(`\n👨‍⚕️ All ACTIVE doctors in "${praneetaBranchName}" branch:\n`);
    const doctorsInBranch = await prisma.user.findMany({
      where: {
        branchId: praneetaBranchId,
        role: 'DOCTOR',
        isActive: true,
        status: 'ACTIVE',
      },
      select: {
        firstName: true,
        lastName: true,
        email: true,
      },
      orderBy: { firstName: 'asc' },
    });

    if (doctorsInBranch.length > 0) {
      doctorsInBranch.forEach((doc, idx) => {
        console.log(`   ${idx + 1}. Dr. ${doc.firstName} ${doc.lastName} (${doc.email})`);
      });
      console.log(`\n   Receptionists in this branch can book for all ${doctorsInBranch.length} of these doctors.`);
    }

  } catch (error) {
    console.error('❌ Error checking receptionist branches:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkReceptionistBranches()
  .then(() => {
    console.log('\n✅ Check complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

