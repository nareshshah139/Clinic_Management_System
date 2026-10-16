import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';

type OperationRow = { rowId: string; fingerprint: string };
type Operation = { branchId: string; userId: string; operationId: string; kind: string; rows: OperationRow[] };

export function stockRequestFingerprint(kind: string, payload: Record<string, unknown>): string {
  const fields = Object.keys(payload).filter(key => payload[key] !== undefined).sort();
  return createHash('sha256').update(JSON.stringify([kind, fields.map(key => [key, payload[key]])])).digest('hex');
}

export function requireStockOperationId(value: string, label = 'Operation ID'): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new BadRequestException(`${label} must be a stable identifier of up to 128 letters, numbers, dots, colons, underscores or hyphens`);
  }
  return value;
}

/**
 * @cc [owner:nareshshah139,label:product] stock-operation-manifest
 * One branch operation ID binds its submitted row IDs and fingerprints. A retry may select a
 * subset of those rows; changed or additional rows MUST fail before any new stock effect.
 */
export async function registerStockOperation(prisma: any, input: Operation): Promise<void> {
  requireStockOperationId(input.operationId);
  if (!input.branchId || !input.userId) throw new BadRequestException('Authenticated branch and user are required');
  if (!input.rows.length || input.rows.length > 100) throw new BadRequestException('Submit between 1 and 100 movement rows');
  const ids = input.rows.map(row => requireStockOperationId(row.rowId, 'Row ID'));
  if (new Set(ids).size !== ids.length) throw new BadRequestException('Each movement row needs a distinct stable row ID');
  const where = { branchId_operationId: { branchId: input.branchId, operationId: input.operationId } };
  let saved: any;
  try {
    saved = await prisma.inventoryStockOperation.upsert({ where, update: {},
      create: { branchId: input.branchId, operationId: input.operationId, kind: input.kind, rows: input.rows, createdBy: input.userId } });
  } catch (error) {
    if ((error as any)?.code !== 'P2002') throw error;
    saved = await prisma.inventoryStockOperation.findUnique({ where });
    if (!saved) throw error;
  }
  const savedRows = saved.rows as OperationRow[];
  if (saved.kind !== input.kind || input.rows.some(row => !savedRows.some(prior => prior.rowId === row.rowId && prior.fingerprint === row.fingerprint))) {
    throw new ConflictException('This operation ID already identifies different stock changes. Check its saved outcome before starting a new operation.');
  }
}

/**
 * @cc [owner:nareshshah139,label:product] stock-operation-atomic-replay
 * A movement and its retry identity MUST commit together. Identical retries return that movement;
 * conflicting fingerprints fail, and a losing concurrent attempt MUST roll back its stock effect.
 */
export async function performStockOperation(
  prisma: any,
  input: { branchId: string; operationId: string; rowId: string; fingerprint: string },
  mutate: (tx: any) => Promise<any>,
) {
  const where = { branchId_operationId_operationRowId: {
    branchId: input.branchId, operationId: input.operationId, operationRowId: input.rowId,
  } };
  const matching = (row: any) => {
    if (row.requestFingerprint !== input.fingerprint) throw new ConflictException('This stock row ID already identifies different changes');
    return row;
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        const prior = await tx.stockTransaction.findUnique({ where });
        if (prior) return matching(prior);
        const movement = await mutate(tx);
        return tx.stockTransaction.update({ where: { id: movement.id }, data: {
          operationId: input.operationId, operationRowId: input.rowId, requestFingerprint: input.fingerprint,
        } });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (!['P2002', 'P2034'].includes((error as any)?.code)) throw error;
      const prior = await prisma.stockTransaction.findUnique({ where });
      if (prior) return matching(prior);
      if (attempt === 2) throw new ConflictException('Stock is changing concurrently. Retry with the same operation ID.');
    }
  }
}
