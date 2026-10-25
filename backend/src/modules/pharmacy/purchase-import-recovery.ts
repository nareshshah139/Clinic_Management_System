import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';

export type PurchaseImportFence = { id: string; branchId: string; userId: string };
const scope = (fence: PurchaseImportFence) => ({ id: fence.id, branchId: fence.branchId, userId: fence.userId });
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

/**
 * @cc [owner:nareshshah139,label:state] import-attempt-monotonic-fence
 * Each branch/actor-scoped attempt MUST execute at most once. NO_STOCK_WRITTEN is terminal;
 * draft creation MUST lock a RUNNING attempt and record its invoice in the same transaction.
 * Resolving an absent attempt MUST create a terminal tombstone before reporting no stock.
 */
export class PurchaseImportRecovery {
  constructor(private readonly prisma: PrismaService) {}

  private validate(fence: PurchaseImportFence) {
    if (!fence.branchId || !fence.userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fence.id || '')) {
      throw new BadRequestException('A valid import attempt ID and authenticated branch/user are required');
    }
  }

  async read(fence: PurchaseImportFence) {
    this.validate(fence);
    const attempt = await this.prisma.pharmacyPurchaseImportAttempt.findFirst({ where: scope(fence) });
    if (!attempt) throw new NotFoundException('Import attempt not found');
    const invoice = attempt.purchaseInvoiceId ? await this.prisma.pharmacyPurchaseInvoice.findFirst({
      where: { id: attempt.purchaseInvoiceId, branchId: fence.branchId }, select: { id: true, status: true, stockCommittedAt: true },
    }) : null;
    if (attempt.status === 'RETRY_REJECTED') return { attemptId: attempt.id, outcome: 'RETRY_REJECTED',
      invoiceId: attempt.purchaseInvoiceId, stockOutcome: 'UNVERIFIED', retained: attempt.result, message: attempt.message };
    // A missing linked record is not evidence of no stock. Preserve the lock.
    const outcome = attempt.status === 'INVOICE_SAVED'
      ? !invoice ? 'UNKNOWN' : invoice.stockCommittedAt || invoice.status === 'STOCK_COMMITTED' ? 'STOCK_COMMITTED' : 'DRAFT_SAVED'
      : attempt.status;
    return { attemptId: attempt.id, outcome, invoiceId: attempt.purchaseInvoiceId, message: attempt.message,
      ...(attempt.status === 'NO_STOCK_WRITTEN' && attempt.result ? { retained: attempt.result } : {}) };
  }

  /**
   * @cc [owner:nareshshah139,label:state] uncertain-import-rejection
   * Legacy and orphaned imports MUST either resume an exact branch-local invoice or permanently
   * reject further intake with an audit. Rejection MUST preserve unknown historical stock effects;
   * it MUST NOT claim no stock, remove evidence, or repeat invoice creation.
   */
  async recoverUnlinked(fence: PurchaseImportFence, input: { legacy: boolean; invoiceId?: string; sourceDocumentIds?: string[]; reason: string }) {
    this.validate(fence);
    if (!input.reason?.trim() || input.reason.trim().length > 500) throw new BadRequestException('A recovery reason is required (maximum 500 characters)');
    await this.prisma.$transaction(async tx => {
      await lockPurchaseRecovery(tx, fence.branchId);
      const prior = await tx.pharmacyPurchaseImportAttempt.findUnique({ where: { id: fence.id } });
      if (prior && (prior.branchId !== fence.branchId || prior.userId !== fence.userId)) throw new NotFoundException('Import attempt not found');
      if (!prior && !input.legacy) throw new NotFoundException('Import attempt not found');
      if (prior?.status === 'RUNNING') throw new ConflictException('Resolve the running attempt before recovering an unlinked import');
      if (prior && ['NO_STOCK_WRITTEN', 'RETRY_REJECTED'].includes(prior.status)) return;
      if (prior?.purchaseInvoiceId && input.invoiceId && prior.purchaseInvoiceId !== input.invoiceId) throw new ConflictException('The saved invoice identity cannot be replaced');
      const priorSources = (prior?.result as { sourceDocumentIds?: string[] } | null)?.sourceDocumentIds || [];
      const sourceIds = [...new Set([...priorSources, ...(input.sourceDocumentIds || [])])];
      if (sourceIds.length > 20 || sourceIds.some(id => typeof id !== 'string' || !id)) throw new BadRequestException('Invalid original document references');
      const documents = await tx.pharmacyPurchaseInvoiceDocument.findMany({ where: { id: { in: sourceIds }, branchId: fence.branchId }, select: { id: true, purchaseInvoiceId: true } });
      if (documents.length !== sourceIds.length) throw new NotFoundException('Original document not found in this branch');
      const invoiceId = prior?.purchaseInvoiceId || input.invoiceId || null;
      const candidates = [...new Set([invoiceId, ...documents.map(d => d.purchaseInvoiceId)].filter(Boolean))] as string[];
      const existing = candidates.length === 1 ? await tx.pharmacyPurchaseInvoice.findFirst({ where: { id: candidates[0], branchId: fence.branchId }, select: { id: true } }) : null;
      if (existing) {
        if (!prior) await tx.pharmacyPurchaseImportAttempt.create({ data: { ...scope(fence), status: 'INVOICE_SAVED', purchaseInvoiceId: existing.id } });
        return;
      }
      // Never guess an invoice from supplier/number similarity. Conflicting or missing links reject retry.
      const retained = { rejectedSourceDocumentIds: sourceIds, historicalInvoiceIds: candidates,
        recoveryKind: prior ? 'MISSING_LINK' : 'LEGACY', reason: input.reason.trim(), stockOutcome: 'UNVERIFIED' };
      const data = { status: 'RETRY_REJECTED', result: json(retained),
        message: 'Further intake rejected. Historical stock remains unverified; use physical inventory reconciliation. Accepted originals and history are retained.' };
      if (prior) await tx.pharmacyPurchaseImportAttempt.update({ where: { id: fence.id }, data });
      else await tx.pharmacyPurchaseImportAttempt.create({ data: { ...scope(fence), ...data } });
      await tx.auditLog.create({ data: { entity: 'PharmacyPurchaseImportAttempt', entityId: fence.id, userId: fence.userId,
        action: 'RETRY_REJECTED', newValues: JSON.stringify({ branchId: fence.branchId, ...retained, stockEffect: 0 }) } });
    });
    return this.read(fence);
  }

  /**
   * @cc [owner:nareshshah139,label:security] delegated-import-owner-boundary
   * Delegated recovery MUST preserve an existing attempt owner and stay within the authenticated
   * branch. An absent attempt MUST require a branch-local original actor; that supplied identity
   * is attribution, not proof of historical ownership. Original actor APIs MUST remain scoped.
   */
  /**
   * @cc [owner:nareshshah139,label:atomicity] delegated-import-recovery-atomicity
   * Recovery MUST serialize against purchase admission and atomically record its terminal decision
   * and the recovering actor's audit. A saved invoice MUST win by exact identity; a fenced worker
   * MUST NOT write later. Unknown history MUST stay UNVERIFIED and terminal replay MUST retain evidence.
   */
  async recoverDelegated(actor: { branchId: string; userId: string }, input: {
    attemptId: string; originalActorId?: string; invoiceId?: string; sourceDocumentIds?: string[]; reason: string;
  }) {
    this.validate({ id: input.attemptId, ...actor });
    const reason = input.reason?.trim();
    if (!reason || reason.length > 500) throw new BadRequestException('A recovery reason is required (maximum 500 characters)');
    let ownerId: string | undefined;
    for (let registrationRace = 0; registrationRace < 2; registrationRace += 1) {
      try {
        ownerId = await this.prisma.$transaction(async tx => {
          await lockPurchaseRecovery(tx, actor.branchId);
          await tx.$queryRaw`SELECT id FROM pharmacy_purchase_import_attempts WHERE id = ${input.attemptId}::uuid AND "branchId" = ${actor.branchId} FOR UPDATE`;
          const prior = await tx.pharmacyPurchaseImportAttempt.findUnique({ where: { id: input.attemptId } });
          if (prior && prior.branchId !== actor.branchId) throw new NotFoundException('Import attempt not found');
          if (prior && input.originalActorId && prior.userId !== input.originalActorId) throw new ConflictException('The original operator does not match this import attempt');
          const originalActorId = prior?.userId || input.originalActorId;
          if (!originalActorId) throw new BadRequestException('This attempt is not registered. Enter the original operator ID from the handoff before recovering it.');
          if (!prior && !await tx.user.findFirst({ where: { id: originalActorId, branchId: actor.branchId }, select: { id: true } })) {
            throw new NotFoundException('Original operator not found in this branch');
          }
          if (prior?.purchaseInvoiceId && input.invoiceId && prior.purchaseInvoiceId !== input.invoiceId) throw new ConflictException('The saved invoice identity cannot be replaced');
          const retained = (prior?.result || {}) as {
            sourceDocumentIds?: string[]; rejectedSourceDocumentIds?: string[];
            sourceDocument?: { id?: string }; sourceDocuments?: { id?: string }[];
          };
          const retainedSourceIds = [...new Set([
            ...(retained.sourceDocumentIds || []), ...(retained.rejectedSourceDocumentIds || []),
            ...(retained.sourceDocument?.id ? [retained.sourceDocument.id] : []),
            ...(retained.sourceDocuments || []).map(document => document.id).filter((id): id is string => !!id),
          ])];
          const sourceIds = [...new Set([...retainedSourceIds, ...(input.sourceDocumentIds || [])])];
          if (sourceIds.length > 20 || sourceIds.some(id => typeof id !== 'string' || !id)) throw new BadRequestException('Invalid original document references');
          const suppliedNewIds = (input.sourceDocumentIds || []).filter(id => !retainedSourceIds.includes(id));
          const newDocuments = await tx.pharmacyPurchaseInvoiceDocument.findMany({
            where: { id: { in: [...new Set(suppliedNewIds)] }, branchId: actor.branchId },
            select: { id: true, purchaseInvoiceId: true },
          });
          if (newDocuments.length !== new Set(suppliedNewIds).size) throw new NotFoundException('Original document not found in this branch');
          if (prior && ['NO_STOCK_WRITTEN', 'RETRY_REJECTED'].includes(prior.status)) return originalActorId;
          if (prior?.status === 'INVOICE_SAVED' && (prior.result as { recoveredBy?: string } | null)?.recoveredBy
            && prior.purchaseInvoiceId && newDocuments.length === 0
            && await tx.pharmacyPurchaseInvoice.findFirst({ where: { id: prior.purchaseInvoiceId, branchId: actor.branchId }, select: { id: true } })) {
            return originalActorId;
          }
          const documents = await tx.pharmacyPurchaseInvoiceDocument.findMany({
            where: { id: { in: sourceIds }, branchId: actor.branchId },
            select: { id: true, purchaseInvoiceId: true, fileName: true, mimeType: true, sizeBytes: true },
          });
          const invoiceIds = [...new Set([prior?.purchaseInvoiceId || input.invoiceId, ...documents.map(document => document.purchaseInvoiceId)].filter(Boolean))] as string[];
          const invoice = invoiceIds.length === 1 ? await tx.pharmacyPurchaseInvoice.findFirst({
            where: { id: invoiceIds[0], branchId: actor.branchId }, select: { id: true },
          }) : null;
          const noHistoricalWrite = (!prior || prior.status === 'RUNNING') && invoiceIds.length === 0 && documents.length === sourceIds.length;
          const status = invoice ? 'INVOICE_SAVED' : noHistoricalWrite ? 'NO_STOCK_WRITTEN' : 'RETRY_REJECTED';
          const recovery = { reason, originalActorId, originalActorAttribution: prior ? 'persisted' : 'supplied',
            recoveredBy: actor.userId, sourceDocumentIds: sourceIds, stockEffect: 0 };
          const result = status === 'RETRY_REJECTED'
            ? { ...retained, ...recovery, rejectedSourceDocumentIds: sourceIds, historicalInvoiceIds: invoiceIds,
              recoveryKind: 'DELEGATED_MISSING_LINK', stockOutcome: 'UNVERIFIED' }
            : { ...retained, ...recovery, sourceDocuments: documents };
          const message = status === 'RETRY_REJECTED'
            ? 'Further intake rejected. Historical stock remains unverified; use physical inventory reconciliation. Accepted originals and history are retained.'
            : status === 'NO_STOCK_WRITTEN' ? 'Interrupted import stopped safely before invoice creation.' : 'The exact saved invoice was recovered.';
          const data = { status, result: json(result), message, ...(invoice ? { purchaseInvoiceId: invoice.id } : {}) };
          if (prior) await tx.pharmacyPurchaseImportAttempt.update({ where: { id: prior.id }, data });
          else await tx.pharmacyPurchaseImportAttempt.create({ data: { id: input.attemptId, branchId: actor.branchId, userId: originalActorId, ...data } });
          await tx.auditLog.create({ data: {
            entity: 'PharmacyPurchaseImportAttempt', entityId: input.attemptId, userId: actor.userId, action: 'DELEGATED_RECOVERY',
            newValues: JSON.stringify({ branchId: actor.branchId, ...recovery, priorStatus: prior?.status || 'ABSENT',
              outcome: status, invoiceId: invoice?.id || prior?.purchaseInvoiceId || null,
              ...(status === 'RETRY_REJECTED' ? { historicalInvoiceIds: invoiceIds, stockOutcome: 'UNVERIFIED' } : {}) }),
          } });
          return originalActorId;
        });
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002' || registrationRace > 0) throw error;
      }
    }
    return this.read({ id: input.attemptId, branchId: actor.branchId, userId: ownerId! });
  }

  async execute(fence: PurchaseImportFence, requestHash: string, run: () => Promise<any>) {
    this.validate(fence);
    try {
      await this.prisma.pharmacyPurchaseImportAttempt.create({ data: { ...scope(fence), requestHash, status: 'RUNNING' } });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const prior = await this.prisma.pharmacyPurchaseImportAttempt.findFirst({ where: scope(fence) });
      if (!prior) throw new NotFoundException('Import attempt not found');
      if (prior.requestHash && prior.requestHash !== requestHash) throw new ConflictException('This import attempt belongs to different files or receipt details. Use a new attempt.');
      return { importAttempt: await this.read(fence) };
    }
    let result: any;
    try {
      result = await run();
      await this.prisma.pharmacyPurchaseImportAttempt.updateMany({ where: { ...scope(fence), status: 'RUNNING' }, data: {
        status: result.invoice?.id ? 'INVOICE_SAVED' : 'NO_STOCK_WRITTEN', purchaseInvoiceId: result.invoice?.id || null,
        result: json(result), message: result.automation?.issues?.join(' ') || null,
      } });
    } catch (error) {
      const response = typeof (error as any)?.getResponse === 'function' ? (error as any).getResponse() : null;
      await this.prisma.pharmacyPurchaseImportAttempt.updateMany({ where: { ...scope(fence), status: 'RUNNING' }, data: {
        status: 'NO_STOCK_WRITTEN', message: error instanceof Error ? error.message : 'Import stopped before saving.',
        ...((response?.sourceDocument || response?.sourceDocuments) ? { result: json({ sourceDocument: response.sourceDocument, sourceDocuments: response.sourceDocuments }) } : {}),
      } });
    }
    const importAttempt = await this.read(fence);
    // A cancelled worker must not return extracted data as though it still owns a live attempt.
    return { ...(result || {}), importAttempt };
  }

  /**
   * @cc [owner:nareshshah139,label:atomicity] import-resolution-no-late-writes
   * Resolution MUST fence not-yet-saved work, including requests delayed before registration.
   * A concurrently saved invoice MUST be returned by identity; it MUST NOT be reported as no stock.
   */
  async resolve(fence: PurchaseImportFence) {
    this.validate(fence);
    try {
      await this.prisma.pharmacyPurchaseImportAttempt.create({ data: { ...scope(fence), status: 'NO_STOCK_WRITTEN', message: 'Import stopped safely before invoice creation.' } });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      await this.prisma.pharmacyPurchaseImportAttempt.updateMany({ where: { ...scope(fence), status: 'RUNNING' },
        data: { status: 'NO_STOCK_WRITTEN', message: 'Interrupted import stopped safely before invoice creation.' } });
    }
    return this.read(fence);
  }
}

/**
 * @cc [owner:nareshshah139,label:atomicity] import-draft-fence
 * A stopped or foreign import MUST NOT create an invoice. The attempt row lock MUST be held
 * through invoice creation and binding; cancellation and creation cannot both win.
 */
export async function claimPurchaseImport(tx: Prisma.TransactionClient, fence: PurchaseImportFence) {
  const claimed = await tx.pharmacyPurchaseImportAttempt.updateMany({ where: { ...scope(fence), status: 'RUNNING' }, data: { updatedAt: new Date() } });
  if (claimed.count !== 1) throw new ConflictException('Import was stopped. Resolve its outcome before starting another attempt.');
}

/**
 * @cc [owner:nareshshah139,label:atomicity] import-invoice-binding
 * Binding MUST run in the transaction that claimed the attempt and created the invoice;
 * a committed draft MUST never leave its attempt without the saved invoice identity.
 */
export async function bindPurchaseImport(tx: Prisma.TransactionClient, fence: PurchaseImportFence, invoiceId: string, sourceDocumentIds: string[] = []) {
  await tx.pharmacyPurchaseImportAttempt.update({ where: { id: fence.id }, data: { status: 'INVOICE_SAVED', purchaseInvoiceId: invoiceId, result: { sourceDocumentIds } } });
}

/**
 * @cc [owner:nareshshah139,label:atomicity] purchase-recovery-serialization
 * Recovery decisions and purchase admission MUST serialize within the branch so rejection
 * cannot race a source link or stock commit. Database triggers enforce the same lock for old workers.
 */
export async function lockPurchaseRecovery(tx: Prisma.TransactionClient, branchId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'purchase-recovery:' + branchId}, 0))`;
}

/**
 * @cc [owner:nareshshah139,label:atomicity] purchase-write-protocol
 * New invoice creation and stock posting MUST opt into the recovery protocol within their
 * transaction. Unmodified workers MUST fail the database guard after migration.
 */
export async function preparePurchaseWrite(tx: Prisma.TransactionClient, branchId: string) {
  await lockPurchaseRecovery(tx, branchId);
  await tx.$executeRaw`SELECT set_config('app.purchase_recovery_protocol', '2', true)`;
}
