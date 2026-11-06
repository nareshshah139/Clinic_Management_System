import { PrismaClient } from '@prisma/client';
import { PasswordResetService } from '../modules/auth/password-reset.service';

/**
 * Server-operator fallback when no manager can sign in to issue a code (for example the only
 * OWNER is locked out). Run on the server: npm run reset-code -- someone@clinic.example
 */
async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run reset-code -- <user email>');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const { code, expiresAt } = await new PasswordResetService(prisma as any).issueResetCodeAsOperator(email);
    console.log(`Reset code for ${email}: ${code}`);
    console.log(`Valid once until ${expiresAt.toISOString()}. Enter it on the sign-in page under "enter your reset code" (/reset-password).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
