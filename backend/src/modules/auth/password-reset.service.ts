import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ALLOWED_ORIGINS } from '../../shared/cors-origins';

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export const RESET_CODE_TTL_MS = 24 * 60 * 60 * 1000;
/** No 0/O, 1/I/L, so a code read aloud or handwritten is unambiguous. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROLE_RANK: Record<string, number> = { OWNER: 3, ADMIN: 2, DOCTOR: 1 };
export const FORGOT_PASSWORD_REPLY = { message: 'If an account exists for that email, a reset link has been sent.' };

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Reset codes are typed by hand: ignore case, spaces and dashes. Email tokens pass through unchanged. */
export function normalizeResetSecret(secret: string): string {
  const compact = secret.trim().replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z0-9]{8}$/.test(compact) ? compact : secret.trim();
}

/**
 * @cc [owner:nareshshah139,label:security] password-reset-flow
 * Requesting a reset MUST answer identically whether or not the email has an account. Reset
 * links MUST carry a random single-use token that expires after 30 minutes; only its SHA-256
 * is stored. Links MUST point at APP_BASE_URL or an allowlisted origin, never an arbitrary Host.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  async requestReset(email: string, requestOrigin?: string) {
    const baseUrl = resetLinkBase(requestOrigin);
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' }, isActive: true, status: 'ACTIVE' },
      select: { id: true, email: true, firstName: true },
    });
    if (!user || !baseUrl) {
      if (user) this.logger.warn('Password reset requested but no APP_BASE_URL or allowlisted origin is available');
      return FORGOT_PASSWORD_REPLY;
    }
    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: hashToken(token), resetTokenExpiry: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });
    const link = `${baseUrl}/reset-password?token=${token}`;
    try {
      await this.notifications.sendEmail({
        to: user.email,
        subject: 'Reset your clinic password',
        text: `Hi ${user.firstName},\n\nUse this link within 30 minutes to set a new password:\n${link}\n\nIf you did not ask for this, ignore this email; your password stays the same.`,
        html: `<p>Hi ${escapeHtml(user.firstName)},</p><p>Use this link within 30 minutes to set a new password:</p><p><a href="${link}">Set a new password</a></p><p>If you did not ask for this, ignore this email; your password stays the same.</p>`,
      });
    } catch (error) {
      this.logger.error(`Password reset email failed: ${(error as Error).message}`);
    }
    return FORGOT_PASSWORD_REPLY;
  }

  /**
   * @cc [owner:nareshshah139,label:security] admin-reset-code
   * A manager MAY issue a one-time reset code for a staff member in their branch who does not
   * outrank them (only an OWNER may reset an OWNER). The code is shown once, expires in 24 hours,
   * replaces any pending reset link, is stored only as SHA-256, and every issue is audit-logged
   * without the code.
   */
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
    const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: target.id }, data: { resetToken: hashToken(code), resetTokenExpiry: expiresAt } }),
      this.prisma.auditLog.create({ data: {
        userId: actor.id, action: 'PASSWORD_RESET_CODE_ISSUED', entity: 'User', entityId: target.id,
        newValues: JSON.stringify({ branchId: actor.branchId, expiresAt }),
      } }),
    ]);
    return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt };
  }

  async resetPassword(token: string, password: string, confirmPassword: string) {
    token = normalizeResetSecret(token);
    if (password !== confirmPassword) throw new BadRequestException('Password and confirmation do not match');
    const hashed = await bcrypt.hash(password, 10);
    // Matching on the unexpired token hash and clearing it in one write makes the link single-use.
    const { count } = await this.prisma.user.updateMany({
      where: { resetToken: hashToken(token), resetTokenExpiry: { gt: new Date() }, isActive: true },
      data: { password: hashed, resetToken: null, resetTokenExpiry: null },
    });
    if (count !== 1) throw new BadRequestException('This reset link is invalid or has expired. Request a new one.');
    return { message: 'Password updated. You can now sign in.' };
  }
}

export function resetLinkBase(requestOrigin?: string): string | null {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  return requestOrigin && ALLOWED_ORIGINS.some(pattern => pattern.test(requestOrigin)) ? requestOrigin : null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
