import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import { InventoryWorkflowService } from './inventory-workflow.service';
import { WorkflowActor } from './inventory-workflow.types';
import { prescriptionNameKey } from '../pharmacy/pharmacy-stock-identity';

@Injectable()
export class InventoryIdentityMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: InventoryWorkflowService,
  ) {}

  private async snapshot(
    db: any,
    branchId: string,
    targetId: string,
    sourceId: string,
  ) {
    if (!targetId || !sourceId || targetId === sourceId)
      throw new BadRequestException('Choose two different product records');
    const selected = await db.inventoryItem.findMany({
      where: { id: { in: [targetId, sourceId] }, branchId, status: 'ACTIVE' },
      include: { drugs: true },
    });
    const target = selected.find((i: any) => i.id === targetId),
      source = selected.find((i: any) => i.id === sourceId);
    if (!target || !source)
      throw new NotFoundException(
        'Both inventory items must belong to this branch',
      );
    if (
      [target, source].some(
        (i) =>
          i.drugs.length !== 1 ||
          i.drugs[0].branchId !== branchId ||
          !i.drugs[0].isActive,
      )
    )
      throw new BadRequestException(
        'Each selected item must have one active product link',
      );
    if (target.drugs[0].id === source.drugs[0].id)
      throw new BadRequestException(
        'These batches already belong to the same product',
      );
    const drugIds = [target.drugs[0].id, source.drugs[0].id];
    const batches = await db.inventoryItem.findMany({
      where: { branchId, drugs: { some: { id: { in: drugIds } } } },
      include: { drugs: true },
      orderBy: { id: 'asc' },
    });
    if (
      batches.some(
        (i: any) =>
          i.drugs.length !== 1 ||
          i.unit !== target.unit ||
          i.packSize !== target.packSize ||
          i.packUnit !== target.packUnit,
      )
    )
      throw new BadRequestException(
        'Stock units and pack sizes must match. Loose and strip quantities need a reviewed conversion before merging.',
      );
    const revision = createHash('sha256')
      .update(JSON.stringify(batches))
      .digest('hex');
    return { target, source, batches, revision };
  }

  /**
   * @cc [owner:nareshshah139] ambiguous-batch-identity-recovery
   * Resolving multiple product links MUST require count authority, a current batch revision,
   * explicit physical identity confirmation and a reason. Only an existing active branch product
   * may be retained; links and the before/after audit commit together without quantity conversion.
   */
  async resolveBatch(actor: WorkflowActor, body: { itemId: string; productId: string; updatedAt: string; confirmed: boolean; reason: string }) {
    await this.workflow.authorize(actor, 'COUNT', true);
    if (body.confirmed !== true || !body.reason?.trim() || body.reason.trim().length > 500)
      throw new BadRequestException('Confirm the physical product and stock unit and enter a reason');
    return this.workflow.transaction(async tx => {
      const item = await tx.inventoryItem.findFirst({ where: { id: body.itemId, branchId: actor.branchId }, include: { drugs: true } });
      if (!item) throw new NotFoundException('Batch not found');
      if (body.updatedAt !== item.updatedAt.toISOString()) throw new ConflictException('Batch changed. Reload before resolving its identity.');
      if (item.drugs.length < 2 || !item.drugs.some((d: any) => d.id === body.productId && d.isActive && d.branchId === actor.branchId))
        throw new BadRequestException('Choose an existing active product linked to this ambiguous batch');
      const updated = await tx.inventoryItem.update({ where: { id: item.id, branchId: actor.branchId, updatedAt: item.updatedAt },
        data: { drugs: { set: [{ id: body.productId }] }, updatedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: actor.id, action: 'INVENTORY_IDENTITY_RESOLVED', entity: 'InventoryItem', entityId: item.id,
        oldValues: JSON.stringify({ branchId: actor.branchId, productIds: item.drugs.map((d: any) => d.id), unit: item.unit, packSize: item.packSize, packUnit: item.packUnit }),
        newValues: JSON.stringify({ branchId: actor.branchId, productId: body.productId, reason: body.reason.trim(), physicalIdentityAndUnitConfirmed: true }) } });
      return updated;
    });
  }

  async preview(actor: WorkflowActor, targetId: string, sourceId: string) {
    await this.workflow.authorize(actor, 'COUNT', true);
    return this.snapshot(this.prisma, actor.branchId, targetId, sourceId);
  }

  /**
   * @cc [owner:nareshshah139,label:product] duplicate-product-reviewed-merge
   * Merging product identities requires explicit confirmation of an unchanged preview, a reason,
   * one active product per batch, and identical stock units/packs. All branch batch links, legacy
   * mappings and the actor audit MUST commit atomically; balances, batches and historical bills
   * MUST be retained. Incompatible units MUST fail rather than silently convert quantities.
   */
  async merge(
    actor: WorkflowActor,
    body: {
      targetId: string;
      sourceId: string;
      revision: string;
      confirmed: boolean;
      reason: string;
    },
  ) {
    await this.workflow.authorize(actor, 'COUNT', true);
    if (body.confirmed !== true || !body.reason?.trim())
      throw new BadRequestException(
        'Confirm the clinic-approved merge and enter a reason',
      );
    return this.workflow.transaction(async (tx) => {
      const snapshot = await this.snapshot(
        tx,
        actor.branchId,
        body.targetId,
        body.sourceId,
      );
      if (snapshot.revision !== body.revision)
        throw new ConflictException(
          'Product records changed. Review a fresh preview.',
        );
      const { target, source, batches } = snapshot;
      const sourceDrug = source.drugs[0],
        targetDrug = target.drugs[0];
      for (const batch of batches.filter(
        (b: any) => b.drugs[0].id === sourceDrug.id,
      )) {
        await tx.inventoryItem.update({
          where: {
            id: batch.id,
            branchId: actor.branchId,
            updatedAt: batch.updatedAt,
          },
          data: {
            drugs: {
              disconnect: { id: sourceDrug.id },
              connect: { id: targetDrug.id },
            },
          },
        });
      }
      for (const key of new Set([
        `drug:${sourceDrug.id}`,
        `name:${prescriptionNameKey(source.name)}`,
        `name:${prescriptionNameKey(sourceDrug.name)}`,
      ])) {
        const where = {
          branchId_sourceKey: { branchId: actor.branchId, sourceKey: key },
        };
        const old = await tx.prescriptionInventoryLink.findUnique({ where });
        if (old && !batches.some((b: any) => b.id === old.inventoryItemId))
          throw new ConflictException(
            'An existing remembered match points to another product. Review that match first.',
          );
        await tx.prescriptionInventoryLink.upsert({
          where,
          create: {
            branchId: actor.branchId,
            sourceKey: key,
            sourceName: sourceDrug.name,
            inventoryItemId: target.id,
            linkedBy: actor.id,
          },
          update: { inventoryItemId: target.id, linkedBy: actor.id },
        });
      }
      await tx.drug.update({
        where: { id: sourceDrug.id, branchId: actor.branchId },
        data: { isActive: false },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'INVENTORY_PRODUCT_MERGED',
          entity: 'Drug',
          entityId: targetDrug.id,
          oldValues: JSON.stringify({ branchId: actor.branchId, ...snapshot }),
          newValues: JSON.stringify({
            branchId: actor.branchId,
            canonicalDrugId: targetDrug.id,
            retiredDrugId: sourceDrug.id,
            reason: body.reason.trim(),
            balancesUnchanged: true,
          }),
        },
      });
      return {
        canonicalDrugId: targetDrug.id,
        retiredDrugId: sourceDrug.id,
        batchesRetained: batches.length,
      };
    });
  }
}
