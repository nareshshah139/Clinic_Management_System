import { PrismaClient } from '@prisma/client';
import { PasswordResetService } from '../modules/auth/password-reset.service';

/**
 * @cc [owner:nareshshah139,label:security] operator-reset-code-active-only
 * Without an email argument the script MUST exit 1 with usage before opening a database
 * connection. It MUST issue a code only for an active user whose email matches ignoring case and
 * surrounding spaces, store only the code's hash and audit it as server-script; any other email
 * MUST exit 1 without changing a user.
 */
async function main() {
  // Server-operator fallback when no manager can sign in, e.g. the only OWNER is locked out.
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
