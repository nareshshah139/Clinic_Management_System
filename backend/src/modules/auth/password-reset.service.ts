import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ALLOWED_ORIGINS } from '../../shared/cors-origins';

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export const FORGOT_PASSWORD_REPLY = { message: 'If an account exists for that email, a reset link has been sent.' };

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

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

  async resetPassword(token: string, password: string, confirmPassword: string) {
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
