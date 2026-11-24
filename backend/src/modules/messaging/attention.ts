import { randomUUID } from 'crypto';
import { OutboundMessage, Prisma } from '@prisma/client';
import { auditRawWrite } from '../../shared/database/prisma.service';

type Tx = Prisma.TransactionClient;

const OPENED_FIELDS = ['branchId', 'kind', 'lastEventAt', 'patientId', 'phoneE164', 'reason', 'state', 'subjectKey'];

/** Audits the row an attention-item upsert wrote: CREATE when it inserted, else UPDATE of the bumped fields (PP-88). */
export async function auditAttentionUpsert(tx: Tx, written: { id: string; inserted: boolean }[], bumped: string[], opened = OPENED_FIELDS) {
  for (const row of written) {
    await auditRawWrite(tx, { entity: 'AttentionItem', entityId: row.id, action: row.inserted ? 'CREATE' : 'UPDATE', fields: row.inserted ? opened : bumped });
  }
}

/**
 * @cc [owner:nareshshah139,label:product] failed-send-reaches-staff
 * A failed send about a current subject MUST leave one open DELIVERY_FAILURE attention item for
 * that subject; a second failure moves the same item to the top.
 */
export async function openDeliveryFailure(tx: Tx, row: OutboundMessage, reason: string, now: Date) {
  const subjectKey = row.subjectType && row.subjectId ? `${row.subjectType}:${row.subjectId}` : `message:${row.id}`;
  const patient = row.patientId ? await tx.patient.findUnique({ where: { id: row.patientId }, select: { branchId: true } }) : null;
  const written = await tx.$queryRaw<{ id: string; inserted: boolean }[]>`
    INSERT INTO "attention_items" ("id", "kind", "state", "subjectKey", "patientId", "phoneE164", "branchId", "reason", "lastEventAt", "createdAt", "updatedAt")
    VALUES (${`att_${row.id}_${now.getTime()}`}, 'DELIVERY_FAILURE', 'OPEN', ${subjectKey}, ${row.patientId}, ${row.toE164}, ${patient?.branchId ?? null}, ${reason}, ${now}, ${now}, ${now})
    ON CONFLICT ("kind", "subjectKey") WHERE "state" <> 'RESOLVED'
    DO UPDATE SET "lastEventAt" = EXCLUDED."lastEventAt", "reason" = EXCLUDED."reason", "updatedAt" = EXCLUDED."updatedAt"
    RETURNING "id", (xmax = 0) AS "inserted"`;
  await auditAttentionUpsert(tx, written, ['lastEventAt', 'reason', 'updatedAt']);
}

/** One open PATIENT_MESSAGE item per patient, or per number when the sender is not known (PP-21). */
export async function openPatientMessageItem(tx: Tx, who: { patientId: string | null; phoneE164: string; branchId: string | null }, now: Date) {
  const subjectKey = who.patientId ? `patient:${who.patientId}` : `phone:${who.phoneE164}`;
  await tx.$executeRaw`
    INSERT INTO "attention_items" ("id", "kind", "state", "subjectKey", "patientId", "phoneE164", "branchId", "reason", "lastEventAt", "createdAt", "updatedAt")
    VALUES (${`att_${randomUUID()}`}, 'PATIENT_MESSAGE', 'OPEN', ${subjectKey}, ${who.patientId}, ${who.phoneE164}, ${who.branchId}, 'new-message', ${now}, ${now}, ${now})
    ON CONFLICT ("kind", "subjectKey") WHERE "state" <> 'RESOLVED'
    DO UPDATE SET "lastEventAt" = EXCLUDED."lastEventAt", "updatedAt" = EXCLUDED."updatedAt"`;
}
