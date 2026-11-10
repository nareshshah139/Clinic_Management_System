import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { inventoryRegimenDefaults } from './inventory-regimen-defaults';
import { jsonObject, stockStatus } from './inventory-stock';
import { retainPreviousInventoryName, withStandardName } from './inventory-names';
import { MEDICINE_FORM_KEYS, medicineNameProblems, strengthUnitMissing } from './medicine-names';
import type { WorkflowActor } from './inventory-workflow.types';

/**
 * @cc [owner:nareshshah139,label:product;security] item-metadata-revision
 * Edits MUST match the actor's branch and current item revision. The caller MUST authenticate
 * the actor and authorize inventory:item:update before invoking this command.
 */
/**
 * @cc [owner:nareshshah139,label:product] item-metadata-stock-preservation
 * Metadata edits MUST reject changes to on-hand or held stock, unit basis and purchase cost.
 */
/**
 * @cc [owner:nareshshah139,label:product] item-metadata-correction-validation
 * Changed batch labels, expiry or manual targets require a reason; invalid dates, conflicting
 * codes, minimum above maximum and archiving remaining stock MUST reject without an edit.
 * Naming edits MUST keep the standard name in step with form, name and strength, and MUST NOT
 * clear a saved form or strength; a strength that was never known may stay blank (Q17).
 */
/**
 * @cc [owner:nareshshah139,label:product] item-metadata-atomic-audit
 * Metadata edits MUST commit an actor, reason and before/after audit with the changed item.
 * The caller MUST run this command in its database transaction.
 */
export async function saveInventoryItemMetadata(
  tx: any,
  actor: Pick<WorkflowActor, 'id' | 'branchId'>,
  id: string,
  input: Record<string, any>,
) {
  if (!actor.id || !actor.branchId)
    throw new BadRequestException('Authenticated branch and user are required');
  try {
    const item = await tx.inventoryItem.findFirst({
      where: { id, branchId: actor.branchId },
    });
    if (!item) throw new NotFoundException('Batch not found');
    for (const field of [
      'currentStock',
      'heldStock',
      'costPrice',
      'unit',
      'packSize',
      'packUnit',
    ]) {
      if (input[field] !== undefined && input[field] !== item[field])
        throw new BadRequestException(
          'Posted stock quantity, unit basis and purchase cost require a linked stock or purchase correction',
        );
    }
    if (input.updatedAt !== item.updatedAt.toISOString())
      throw new ConflictException(
        'Batch details changed. Reload before saving.',
      );
    const data: any = inventoryRegimenDefaults(input, item),
      meta = jsonObject(item.metadata),
      reason = String(input.reason || '').trim();
    if (input.batchNumber !== undefined) {
      const batch = String(input.batchNumber).trim();
      if (!batch)
        throw new BadRequestException(
          'Enter the batch number shown on the pack',
        );
      if (batch !== item.batchNumber) data.batchNumber = batch;
    }
    if (input.expiryDate !== undefined) {
      const date = String(input.expiryDate),
        parsed = new Date(`${date}T23:59:59.999Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date
      )
        throw new BadRequestException(
          'Enter a valid expiry date shown on the pack',
        );
      if (date !== item.expiryDate?.toISOString().slice(0, 10))
        data.expiryDate = parsed;
    }
    if (
      (data.batchNumber !== undefined || data.expiryDate !== undefined) &&
      !reason
    )
      throw new BadRequestException(
        'Enter a reason for correcting the batch number or expiry',
      );
    for (const f of [
      'description',
      'name',
      'genericName',
      'brandName',
      'category',
      'subCategory',
      'manufacturer',
      'supplier',
      'hsnCode',
      'storageLocation',
      'storageConditions',
      'barcode',
      'sku',
      'strength',
      'itemCode',
    ])
      if (input[f] !== undefined) data[f] = String(input[f] ?? '').trim() || null;
    if (input.name !== undefined && !data.name)
      throw new BadRequestException('Product name is required');
    if (input.form !== undefined) {
      if (input.form !== null && input.form !== '' && !MEDICINE_FORM_KEYS.includes(input.form))
        throw new BadRequestException('Choose a listed form');
      data.form = input.form || null;
    }
    if (input.isCombination !== undefined) {
      if (typeof input.isCombination !== 'boolean')
        throw new BadRequestException('isCombination must be true or false');
      data.isCombination = input.isCombination;
    }
    const naming = ['name', 'form', 'brandName', 'strength', 'isCombination'].some((f) => input[f] !== undefined);
    if (naming) {
      const next = (f: string) => (Object.prototype.hasOwnProperty.call(data, f) ? data[f] : item[f]);
      const named = withStandardName({ type: next('type'), name: next('name'), brandName: next('brandName'), form: next('form'), strength: next('strength'), isCombination: next('isCombination') });
      const problems = medicineNameProblems({ ...named, name: named.brandName || named.name }).filter((p) =>
        p.field === 'name' || (p.field === 'form' && item.form) || (p.field === 'strength' && ((item.strength || '').trim() || strengthUnitMissing(named))));
      if (problems.length) throw new BadRequestException(problems.map((p) => p.message).join(' '));
      for (const f of ['name', 'brandName', 'strength', 'isCombination'] as const)
        if (named[f] !== item[f]) data[f] = named[f];
    }
    if (data.name && data.name !== item.name)
      retainPreviousInventoryName(meta, item.name, Boolean(data.form ?? item.form));
    for (const f of ['barcode', 'sku'])
      if (
        data[f] &&
        data[f] !== item[f] &&
        (await tx.inventoryItem.findFirst({
          where: { [f]: data[f], id: { not: id } },
          select: { id: true },
        }))
      )
        throw new ConflictException(
          `This ${f.toUpperCase()} is already assigned. Choose a unique code.`,
        );
    for (const f of [
      'gstRate',
      'minStockLevel',
      'maxStockLevel',
      'reorderLevel',
      'reorderQuantity',
    ])
      if (input[f] !== undefined) {
        data[f] =
          input[f] === '' || input[f] === null ? null : Number(input[f]);
        if (
          data[f] != null &&
          (!Number.isFinite(data[f]) ||
            data[f] < 0 ||
            (f !== 'gstRate' && !Number.isSafeInteger(data[f])))
        )
          throw new BadRequestException(`${f} must be nonnegative`);
      }
    const value = (f: string) =>
      Object.prototype.hasOwnProperty.call(data, f) ? data[f] : item[f];
    if (
      value('minStockLevel') != null &&
      value('maxStockLevel') != null &&
      value('minStockLevel') > value('maxStockLevel')
    )
      throw new BadRequestException('Minimum cannot exceed maximum');
    const targetsChanged = [
      'minStockLevel',
      'maxStockLevel',
      'reorderLevel',
      'reorderQuantity',
    ].some((f) => input[f] !== undefined && data[f] !== item[f]);
    if (targetsChanged && !reason)
      throw new BadRequestException(
        'Enter a reason for changing manual replenishment targets',
      );
    if (targetsChanged) meta.manualTargets = true;
    for (const f of ['dosageForm', 'schedule', 'composition'])
      if (input[f] !== undefined) meta[f] = String(input[f]).trim();
    if (input.status !== undefined) {
      if (!['ACTIVE', 'INACTIVE', 'DISCONTINUED'].includes(input.status))
        throw new BadRequestException('Invalid item status');
      if (input.status !== 'ACTIVE' && (item.currentStock || item.heldStock))
        throw new BadRequestException(
          'Dispose or return remaining stock before archiving the batch',
        );
      data.status = input.status;
    }
    for (const field of ['sellingPrice', 'mrp'])
      if (input[field] !== undefined) {
        if (!Number.isFinite(input[field]) || input[field] < 0)
          throw new BadRequestException(`${field} must be nonnegative`);
        data[field] = input[field];
      }
    if (input.type !== undefined) {
      if (
        !['MEDICINE', 'SUPPLY', 'EQUIPMENT', 'CONSUMABLE'].includes(input.type)
      )
        throw new BadRequestException('Invalid inventory type');
      data.type = input.type;
    }
    for (const field of ['requiresPrescription', 'isControlled'])
      if (input[field] !== undefined) {
        if (typeof input[field] !== 'boolean')
          throw new BadRequestException(`${field} must be true or false`);
        data[field] = input[field];
      }
    if (input.tags !== undefined) {
      if (
        !Array.isArray(input.tags) ||
        input.tags.some((tag: unknown) => typeof tag !== 'string')
      )
        throw new BadRequestException('Tags must be text');
      data.tags = JSON.stringify(input.tags);
    }
    data.metadata = JSON.stringify(meta);
    data.stockStatus = stockStatus({ ...item, ...data });
    const saved = await tx.inventoryItem.update({
      where: { id, branchId: actor.branchId, updatedAt: item.updatedAt },
      data,
    });
    const before = Object.fromEntries(
      Object.keys(data).map((k) => [k, item[k]]),
    );
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'INVENTORY_METADATA_UPDATED',
        entity: 'InventoryItem',
        entityId: id,
        oldValues: JSON.stringify({ branchId: actor.branchId, ...before }),
        newValues: JSON.stringify({
          branchId: actor.branchId,
          ...data,
          reason: reason || 'Item metadata update',
        }),
      },
    });
    return saved;
  } catch (error: any) {
    if (error?.code === 'P2002')
      throw new ConflictException(
        'This SKU or barcode is already assigned. Choose a unique code.',
      );
    if (error?.code === 'P2025')
      throw new ConflictException(
        'Batch details changed. Reload before saving.',
      );
    throw error;
  }
}
