import { Prisma, PrismaClient } from '@prisma/client';

type Db = Prisma.TransactionClient | PrismaClient;

export const REPLY_WINDOW_MS = 24 * 3600 * 1000;

export type ReplyBlock = 'unknown-sender' | 'archived' | 'opted-out' | 'number-not-confirmed' | 'window-closed';

export type ReplyStatus =
  | { canReply: true; toE164: string; windowClosesAt: Date }
  | { canReply: false; reason: ReplyBlock; message: string };

export const REPLY_BLOCK_TEXT: Record<ReplyBlock, string> = {
  'unknown-sender': 'This number is not assigned to a patient. Assign the message to a patient before replying.',
  archived: 'The patient is archived.',
  'opted-out': 'The patient opted out of WhatsApp messages.',
  'number-not-confirmed': "The patient's WhatsApp number is not confirmed.",
  'window-closed': 'The patient has not written in the last 24 hours, so WhatsApp allows no free-text reply.',
};

const blocked = (reason: ReplyBlock): ReplyStatus => ({ canReply: false, reason, message: REPLY_BLOCK_TEXT[reason] });

/**
 * @cc [owner:nareshshah139,label:product] staff-reply-window
 * A staff free-text reply MUST go only to the patient's current confirmed number with consent
 * OPTED_IN, and only while the last inbound message from that number is under 24 hours old
 * (PP-51). The worklist and the send pass both decide with this function.
 */
export async function staffReplyStatus(db: Db, patientId: string | null, now: Date): Promise<ReplyStatus> {
  if (!patientId) return blocked('unknown-sender');
  const profile = await db.patientPortalProfile.findUnique({ where: { patientId }, include: { patient: { select: { isArchived: true } } } });
  if (!profile) return blocked('number-not-confirmed');
  if (profile.patient.isArchived) return blocked('archived');
  if (profile.consentState === 'OPTED_OUT') return blocked('opted-out');
  if (profile.consentState !== 'OPTED_IN' || !profile.phoneConfirmedAt || !profile.phoneE164) return blocked('number-not-confirmed');
  const last = await db.patientMessage.findFirst({
    where: { phoneE164: profile.phoneE164, direction: 'INBOUND', channel: 'WHATSAPP' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!last || now.getTime() - last.createdAt.getTime() >= REPLY_WINDOW_MS) return blocked('window-closed');
  return { canReply: true, toE164: profile.phoneE164, windowClosesAt: new Date(last.createdAt.getTime() + REPLY_WINDOW_MS) };
}

export type ReplyRoute =
  | { via: 'whatsapp'; toE164: string; windowClosesAt: Date }
  | { via: 'portal'; toE164: string; message: string }
  | { via: null; reason: ReplyBlock; message: string };

export const PORTAL_REPLY_TEXT =
  'The WhatsApp window is closed. Your reply goes to the patient portal, and the patient gets a WhatsApp notice to read it there.';

/**
 * @cc [owner:nareshshah139,label:product] closed-window-reply-goes-to-portal
 * When the only block on a staff reply is the closed 24-hour window and the patient's portal is on,
 * the reply MUST be kept in the portal thread and one templated notice with the portal link queued
 * (PP-65); every other block stays a block.
 */
export async function staffReplyRoute(db: Db, patientId: string | null, now: Date): Promise<ReplyRoute> {
  const status = await staffReplyStatus(db, patientId, now);
  if (status.canReply) return { via: 'whatsapp', toE164: status.toE164, windowClosesAt: status.windowClosesAt };
  if (status.reason === 'window-closed' && patientId) {
    const profile = await db.patientPortalProfile.findUnique({ where: { patientId }, select: { portalEnabled: true, phoneE164: true } });
    if (profile?.portalEnabled && profile.phoneE164) return { via: 'portal', toE164: profile.phoneE164, message: PORTAL_REPLY_TEXT };
  }
  return { via: null, reason: status.reason, message: status.message };
}
