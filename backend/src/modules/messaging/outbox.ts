import { OutboundMessagePurpose, Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaClient;

export type OutboundRequest = {
  dedupeKey: string;
  purpose: OutboundMessagePurpose;
  patientId?: string | null;
  toE164: string;
  templateKey: string;
  params?: Record<string, unknown>;
  subjectType?: string | null;
  subjectId?: string | null;
  notBefore?: Date;
};

/**
 * @cc [owner:nareshshah139,label:integrity] outbound-row-before-send
 * Every automated send MUST start as an OutboundMessage row whose dedupeKey names the event;
 * queuing the same event again is a no-op and returns false.
 */
export async function enqueueOutbound(tx: Tx, req: OutboundRequest): Promise<boolean> {
  const { count } = await tx.outboundMessage.createMany({
    data: [{ ...req, params: (req.params ?? undefined) as Prisma.InputJsonValue | undefined }],
    skipDuplicates: true,
  });
  return count === 1;
}
