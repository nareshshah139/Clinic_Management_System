import { Prisma } from '@prisma/client';
import { PrescriptionQueueStatus } from './dto/pharmacy-prescription-queue.dto';

export const queueFrequencyPerDay: Record<string, number> = {
  once_daily: 1,
  od: 1,
  daily: 1,
  twice_daily: 2,
  bid: 2,
  bd: 2,
  three_times_daily: 3,
  tid: 3,
  tds: 3,
  four_times_daily: 4,
  qid: 4,
  qds: 4,
  every_12_hours: 2,
  every_8_hours: 3,
  every_6_hours: 4,
  every_4_hours: 6,
  weekly: 1 / 7,
  monthly: 1 / 30,
};

export const queueDurationDays: Record<string, number> = {
  day: 1,
  days: 1,
  week: 7,
  weeks: 7,
  month: 30,
  months: 30,
  year: 365,
  years: 365,
};

const normalized = (value: Prisma.Sql) =>
  Prisma.sql`trim(both '_' from regexp_replace(lower(trim(${value})), '[^a-z0-9]+', '_', 'g'))`;
const positiveNumber = (value: Prisma.Sql) =>
  Prisma.sql`prescription_positive_number(${value})`;
const numericLookup = (
  values: Record<string, number>,
  key: Prisma.Sql,
) => Prisma.sql`
  CASE ${key} ${Prisma.join(
    Object.entries(values).map(
      ([name, value]) =>
        Prisma.sql`WHEN ${name} THEN ${value}::double precision`,
    ),
    ' ',
  )} END`;

/**
 * @cc [owner:nareshshah139,label:product] queue-live-status-selection
 * Status filtering and total MUST use all branch prescriptions, posted invoice coverage,
 * age and staff task overrides before LIMIT/OFFSET. Cancelled prescriptions and deleted visits MUST be excluded.
 * The selected IDs MUST have deterministic creation-time and ID ordering, including empty pages.
 */
export function queueStatusPage(
  branchId: string,
  status: PrescriptionQueueStatus | undefined,
  page: number,
  limit: number,
  now: Date,
): Prisma.Sql {
  const explicit = positiveNumber(
    Prisma.sql`coalesce(item->>'quantity', item->>'prescribedQuantity', item->>'totalQuantity', item->>'qty')`,
  );
  const duration = positiveNumber(Prisma.sql`item->>'duration'`);
  const frequency = numericLookup(
    queueFrequencyPerDay,
    normalized(Prisma.sql`coalesce(item->>'frequency', '')`),
  );
  const multiplier = numericLookup(
    queueDurationDays,
    normalized(Prisma.sql`coalesce(nullif(item->>'durationUnit', ''), 'days')`),
  );
  const medicationName = normalized(
    Prisma.sql`coalesce(nullif(item->>'drugName', ''), nullif(item->>'brandName', ''), nullif(item->>'genericName', ''), 'Unknown drug')`,
  );
  const invoiceName = normalized(Prisma.sql`coalesce(d.name, '')`);
  return Prisma.sql`
    WITH branch_prescriptions AS MATERIALIZED (
      SELECT p.id, p."createdAt", t.status::text AS task_status,
        inventory_read_json(p.items) AS items
      FROM prescriptions p
      JOIN visits v ON v.id = p."visitId"
      JOIN patients patient ON patient.id = v."patientId"
      LEFT JOIN pharmacy_dispense_tasks t ON t."prescriptionId" = p.id AND t."branchId" = ${branchId}
      WHERE patient."branchId" = ${branchId} AND coalesce(to_jsonb(p)->>'status', 'ACTIVE') <> 'CANCELLED'
        AND to_jsonb(v)->>'deletedAt' IS NULL
    ), medications AS (
      SELECT p.id, item, coalesce(${explicit}, ceil(${frequency} * ${duration} * ${multiplier})) AS quantity,
        ${medicationName} AS name
      FROM branch_prescriptions p
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.items) = 'array' THEN p.items ELSE '[]'::jsonb END) item
    ), coverage AS (
      SELECT m.id, m.quantity, coalesce((
        SELECT sum(ii.quantity) FROM pharmacy_invoices i
        JOIN pharmacy_invoice_items ii ON ii."invoiceId" = i.id
        LEFT JOIN drugs d ON d.id = ii."drugId"
        WHERE i."prescriptionId" = m.id AND i."branchId" = ${branchId}
          AND i.status IN ('CONFIRMED', 'DISPENSED', 'COMPLETED')
          AND CASE
            WHEN nullif(m.item->>'inventoryItemId', '') IS NOT NULL AND ii."inventoryItemId" IS NOT NULL
              THEN m.item->>'inventoryItemId' = ii."inventoryItemId"
            WHEN nullif(m.item->>'drugId', '') IS NOT NULL THEN m.item->>'drugId' = ii."drugId"
            ELSE m.name <> '' AND ${invoiceName} <> '' AND
              (strpos(m.name, ${invoiceName}) > 0 OR strpos(${invoiceName}, m.name) > 0)
          END
      ), 0) AS dispensed
      FROM medications m
    ), invoice_state AS (
      SELECT i."prescriptionId" AS id,
        bool_or(i.status IN ('CONFIRMED', 'DISPENSED', 'COMPLETED', 'CANCELLED')) AS has_posted_or_cancelled,
        bool_or(i.status IN ('DISPENSED', 'COMPLETED')) AS completed
      FROM pharmacy_invoices i JOIN branch_prescriptions p ON p.id = i."prescriptionId"
      WHERE i."branchId" = ${branchId} GROUP BY i."prescriptionId"
    ), coverage_state AS (
      SELECT id, count(*) FILTER (WHERE quantity IS NOT NULL) > 0
        AND bool_and(dispensed >= quantity) FILTER (WHERE quantity IS NOT NULL) AS covered
      FROM coverage GROUP BY id
    ), derived AS (
      SELECT p.*, CASE
        WHEN NOT coalesce(i.has_posted_or_cancelled, false) THEN
          CASE WHEN p."createdAt" < ${new Date(now.getTime() - 24 * 60 * 60 * 1000)} THEN 'expired' ELSE 'pending' END
        WHEN coalesce(i.completed, false) OR coalesce(c.covered, false) THEN 'dispensed'
        ELSE 'partial' END AS derived_status
      FROM branch_prescriptions p LEFT JOIN invoice_state i ON i.id = p.id LEFT JOIN coverage_state c ON c.id = p.id
    ), synced AS (
      SELECT *, CASE
        WHEN task_status IN ('CANCELLED', 'PAID', 'DISPENSED') THEN task_status
        WHEN derived_status = 'dispensed' THEN 'DISPENSED'
        WHEN task_status = 'QUEUED' AND derived_status = 'partial' THEN 'PARTIALLY_FILLED'
        WHEN task_status = 'QUEUED' AND derived_status = 'expired' THEN 'PAUSED'
        ELSE task_status END AS workflow_status
      FROM derived
    ), filtered AS MATERIALIZED (
      SELECT id, "createdAt" FROM synced WHERE ${status ?? null}::text IS NULL OR ${status ?? null} = CASE
        WHEN workflow_status = 'DISPENSED' THEN 'dispensed'
        WHEN workflow_status = 'PARTIALLY_FILLED' THEN 'partial'
        WHEN workflow_status IN ('PAUSED', 'CANCELLED') THEN 'expired'
        WHEN workflow_status IN ('READY_TO_BILL', 'PAID', 'IN_REVIEW') AND derived_status NOT IN ('partial', 'dispensed') THEN 'pending'
        ELSE derived_status END
    )
    SELECT (SELECT count(*)::int FROM filtered) AS total,
      ARRAY(SELECT id FROM filtered ORDER BY "createdAt" DESC, id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}) AS ids`;
}
