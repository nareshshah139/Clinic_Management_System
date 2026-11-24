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
    where: { phoneE164: profile.phoneE164, direction: 'INBOUND' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!last || now.getTime() - last.createdAt.getTime() >= REPLY_WINDOW_MS) return blocked('window-closed');
  return { canReply: true, toE164: profile.phoneE164, windowClosesAt: new Date(last.createdAt.getTime() + REPLY_WINDOW_MS) };
}
