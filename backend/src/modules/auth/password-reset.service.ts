import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../shared/database/prisma.service';

export const RESET_CODE_TTL_MS = 24 * 60 * 60 * 1000;
/** No 0/O, 1/I/L, so a code read aloud or handwritten is unambiguous. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROLE_RANK: Record<string, number> = { OWNER: 3, ADMIN: 2, DOCTOR: 1 };

const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');

/** Codes are typed by hand: ignore case, spaces and dashes. */
export function normalizeResetCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * @cc [owner:nareshshah139,label:security] admin-reset-code
 * Passwords are reset only with a one-time code issued by a manager in person (or by the server
 * operator's issue-reset-code script). A manager MAY issue a code for staff in their branch who
 * do not outrank them (only an OWNER may reset an OWNER). Codes are shown once, expire in 24
 * hours, replace any earlier code, are stored only as SHA-256, and every issue is audit-logged
 * without the code.
 */
@Injectable()
export class PasswordResetService {
  constructor(private readonly prisma: PrismaService) {}

  async issueResetCode(actor: { id: string; branchId: string; role: string }, userId: string) {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, branchId: actor.branchId, isActive: true },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('User not found');
    const actorRank = ROLE_RANK[actor.role] ?? 0;
    const targetRank = ROLE_RANK[target.role] ?? 0;
    if (actorRank === 0 || (targetRank >= actorRank && actor.role !== 'OWNER')) {
      throw new ForbiddenException('You cannot reset the password of a user at or above your role.');
    }
    return this.storeCode(target.id, { issuedBy: actor.id, branchId: actor.branchId });
  }

  /** For the server operator when no manager can sign in (e.g. the only owner is locked out). */
  async issueResetCodeAsOperator(email: string) {
    const target = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' }, isActive: true },
      select: { id: true },
    });
    if (!target) throw new NotFoundException(`No active user with email ${email}`);
    return this.storeCode(target.id, { issuedBy: null, via: 'server-script' });
  }

  async resetPassword(code: string, password: string, confirmPassword: string) {
    if (password !== confirmPassword) throw new BadRequestException('Password and confirmation do not match');
    const hashed = await bcrypt.hash(password, 10);
    // Matching on the unexpired code hash and clearing it in one write makes the code single-use.
    const { count } = await this.prisma.user.updateMany({
      where: { resetToken: hashCode(normalizeResetCode(code)), resetTokenExpiry: { gt: new Date() }, isActive: true },
      data: { password: hashed, resetToken: null, resetTokenExpiry: null },
    });
    if (count !== 1) throw new BadRequestException('This reset code is invalid or has expired. Ask an admin for a new one.');
    return { message: 'Password updated. You can now sign in.' };
  }

  private async storeCode(userId: string, audit: { issuedBy: string | null; branchId?: string; via?: string }) {
    const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { resetToken: hashCode(code), resetTokenExpiry: expiresAt } }),
      this.prisma.auditLog.create({ data: {
        userId: audit.issuedBy, action: 'PASSWORD_RESET_CODE_ISSUED', entity: 'User', entityId: userId,
        newValues: JSON.stringify({ branchId: audit.branchId, via: audit.via, expiresAt }),
      } }),
    ]);
    return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt };
  }
}
