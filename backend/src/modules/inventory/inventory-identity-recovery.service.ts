import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryWorkflowService } from './inventory-workflow.service';
import { WorkflowActor } from './inventory-workflow.types';

@Injectable()
export class InventoryIdentityRecoveryService {
  constructor(private readonly workflow: InventoryWorkflowService) {}

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

}
