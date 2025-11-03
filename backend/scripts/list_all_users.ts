/**
 * Script to list all users in the system by role
 * 
 * Usage: npx ts-node scripts/list_all_users.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listAllUsers() {
  try {
    console.log('🔍 Listing all users in the system...\n');

    // Get all users grouped by role
    const allUsers = await prisma.user.findMany({
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
        createdAt: true,
        branch: {
          select: {
            name: true,
            isActive: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' },
        { firstName: 'asc' },
      ],
    });

    if (allUsers.length === 0) {
      console.log('❌ No users found in the system.');
      return;
    }

    console.log(`✅ Found ${allUsers.length} user(s) in the system:\n`);
    console.log('═'.repeat(120));

    // Group by role
    const byRole: Record<string, typeof allUsers> = {};
    allUsers.forEach(user => {
      if (!byRole[user.role]) {
        byRole[user.role] = [];
      }
      byRole[user.role].push(user);
    });

    // Display by role
    Object.keys(byRole).sort().forEach(role => {
      const users = byRole[role];
      const activeCount = users.filter(u => u.isActive && u.status === 'ACTIVE').length;
      
      console.log(`\n📋 ${role} (${users.length} total, ${activeCount} active)`);
      console.log('─'.repeat(120));

      users.forEach((user, idx) => {
        const fullName = `${user.firstName} ${user.lastName}`;
        const statusIcon = user.isActive && user.status === 'ACTIVE' ? '✅' : '❌';
        const branchIcon = user.branch.isActive ? '✅' : '❌';

        console.log(`${statusIcon} ${(idx + 1).toString().padStart(2)}. ${fullName.padEnd(30)} | ${user.email.padEnd(35)} | ${user.phone || 'N/A'.padEnd(15)}`);
        console.log(`      Status: ${user.status.padEnd(10)} | Active: ${user.isActive.toString().padEnd(5)} | Branch: ${branchIcon} ${user.branch.name}`);
      });
    });

    console.log('\n' + '═'.repeat(120));
    console.log('\n📊 SUMMARY BY ROLE:\n');

    Object.keys(byRole).sort().forEach(role => {
      const users = byRole[role];
      const active = users.filter(u => u.isActive && u.status === 'ACTIVE').length;
      const inactive = users.length - active;
      
      console.log(`   ${role.padEnd(15)} Total: ${users.length.toString().padStart(3)}  |  Active: ${active.toString().padStart(3)}  |  Inactive: ${inactive.toString().padStart(3)}`);
    });

    // Check appointment booking capabilities
    console.log('\n' + '═'.repeat(120));
    console.log('\n🎫 APPOINTMENT BOOKING CAPABILITIES:\n');

    const canBookRoles = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTION'];
    const canBookUsers = allUsers.filter(u => 
      canBookRoles.includes(u.role) && 
      u.isActive && 
      u.status === 'ACTIVE'
    );

    console.log(`   Users who CAN book appointments: ${canBookUsers.length}`);
    console.log('   Breakdown:');
    canBookRoles.forEach(role => {
      const count = canBookUsers.filter(u => u.role === role).length;
      if (count > 0) {
        console.log(`     - ${role.padEnd(10)}: ${count}`);
      }
    });

    const receptionCount = canBookUsers.filter(u => u.role === 'RECEPTION').length;
    if (receptionCount === 0) {
      console.log('\n   ⚠️  WARNING: No active RECEPTION users found!');
      console.log('   To create a receptionist, use the Users Management page:');
      console.log('     1. Go to Dashboard → Users');
      console.log('     2. Click "New User"');
      console.log('     3. Fill in details and select Role: "Receptionist"');
      console.log('     4. The receptionist will be automatically assigned to your branch');
    }

    // Show which users can book for Dr. Praneeta Jain
    const drPraneeta = allUsers.find(u => 
      u.firstName.toLowerCase().includes('praneeta') && 
      u.lastName.toLowerCase().includes('jain') &&
      u.role === 'DOCTOR'
    );

    if (drPraneeta) {
      console.log(`\n\n👨‍⚕️ USERS WHO CAN BOOK FOR DR. PRANEETA JAIN:\n`);
      const canBookForPraneeta = canBookUsers.filter(u => u.branchId === drPraneeta.branchId);
      
      if (canBookForPraneeta.length > 0) {
        console.log(`   ${canBookForPraneeta.length} user(s) in "${drPraneeta.branch.name}" branch:\n`);
        canBookForPraneeta.forEach((user, idx) => {
          console.log(`   ${idx + 1}. ${user.firstName} ${user.lastName} (${user.role}) - ${user.email}`);
        });

        const receptionistsCanBook = canBookForPraneeta.filter(u => u.role === 'RECEPTION');
        if (receptionistsCanBook.length === 0) {
          console.log(`\n   ⚠️  No RECEPTION users in "${drPraneeta.branch.name}" branch!`);
          console.log('   This is why receptionists cannot book for Dr. Praneeta Jain.');
          console.log('\n   SOLUTION: Create a receptionist account in the Users Management page.');
        } else {
          console.log(`\n   ✅ ${receptionistsCanBook.length} receptionist(s) can book for Dr. Praneeta.`);
        }
      } else {
        console.log(`   ❌ No active users in "${drPraneeta.branch.name}" branch can book appointments!`);
      }
    }

  } catch (error) {
    console.error('❌ Error listing users:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

listAllUsers()
  .then(() => {
    console.log('\n✅ Check complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

