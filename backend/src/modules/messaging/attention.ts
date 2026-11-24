import { OutboundMessage, Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * @cc [owner:nareshshah139,label:product] failed-send-reaches-staff
 * A failed send about a current subject MUST leave one open DELIVERY_FAILURE attention item for
 * that subject; a second failure moves the same item to the top.
 */
export async function openDeliveryFailure(tx: Tx, row: OutboundMessage, reason: string, now: Date) {
  const subjectKey = row.subjectType && row.subjectId ? `${row.subjectType}:${row.subjectId}` : `message:${row.id}`;
  const patient = row.patientId ? await tx.patient.findUnique({ where: { id: row.patientId }, select: { branchId: true } }) : null;
  await tx.$executeRaw`
    INSERT INTO "attention_items" ("id", "kind", "state", "subjectKey", "patientId", "phoneE164", "branchId", "reason", "lastEventAt", "createdAt", "updatedAt")
    VALUES (${`att_${row.id}_${now.getTime()}`}, 'DELIVERY_FAILURE', 'OPEN', ${subjectKey}, ${row.patientId}, ${row.toE164}, ${patient?.branchId ?? null}, ${reason}, ${now}, ${now}, ${now})
    ON CONFLICT ("kind", "subjectKey") WHERE "state" <> 'RESOLVED'
    DO UPDATE SET "lastEventAt" = EXCLUDED."lastEventAt", "reason" = EXCLUDED."reason", "updatedAt" = EXCLUDED."updatedAt"`;
}
