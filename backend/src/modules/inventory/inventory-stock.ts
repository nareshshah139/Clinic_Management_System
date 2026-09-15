import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

export const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
export const jsonObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && !Array.isArray(parsed) && typeof parsed === 'object'
      ? parsed
      : {};
  } catch {
    return {};
  }
};
export function stockStatus(item: any, quantity = item.currentStock) {
  if (
    item.expiryDate &&
    new Date(item.expiryDate) <
      new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z')
  )
    return 'EXPIRED';
  if (quantity <= 0) return 'OUT_OF_STOCK';
  return quantity <= (item.reorderLevel ?? item.minStockLevel ?? -1)
    ? 'LOW_STOCK'
    : 'IN_STOCK';
}
export function movementDelta(row: any): number | null {
  if (Number.isFinite(row.quantityDelta)) return row.quantityDelta;
  const info = jsonObject(row.notes);
  if (Number.isFinite(info.delta)) return info.delta;
  if (['PURCHASE', 'RETURN'].includes(row.type)) return row.quantity;
  if (['SALE', 'DAMAGED', 'EXPIRED'].includes(row.type)) return -row.quantity;
  // Historical ambiguous adjustments cannot be reconstructed by guessing their direction.
  return null;
}

/**
 * @cc [owner:nareshshah139,label:product] inventory-balance-cas
 * Each stock mutation MUST compare the branch item's previous on-hand and held balances;
 * insufficient available units or a concurrent change MUST fail before a movement is returned.
 * The caller MUST run this function inside the same transaction as its document transition.
 */
export async function writeStockMovement(
  tx: any,
  input: {
    branchId: string;
    userId: string;
    itemId: string;
    delta: number;
    type: string;
    reason?: string;
    reference?: string;
    unitPrice?: number;
    notes?: string;
    location?: string;
    consumeHeld?: number;
    metadata?: Record<string, unknown>;
  },
) {
  if (!input.userId || !input.branchId)
    throw new BadRequestException('Authenticated branch and user are required');
  if (!Number.isSafeInteger(input.delta) || input.delta === 0)
    throw new BadRequestException(
      'Stock change must be a nonzero whole number',
    );
  const item = await tx.inventoryItem.findFirst({
    where: { id: input.itemId, branchId: input.branchId },
  });
  if (!item)
    throw new NotFoundException('Inventory batch not found in this branch');
  const held = Number(item.heldStock || 0);
  const release = input.consumeHeld || 0;
  if (!Number.isSafeInteger(release) || release < 0 || release > held)
    throw new BadRequestException('Invalid held stock quantity');
  const afterStock = item.currentStock + input.delta;
  if (!Number.isSafeInteger(afterStock) || afterStock < held - release)
    throw new BadRequestException(
      'Insufficient available stock; inspect the batch balance and holds',
    );
  const unitPrice = input.unitPrice ?? item.costPrice;
  if (!Number.isFinite(unitPrice) || unitPrice < 0)
    throw new BadRequestException('Unit price must be a nonnegative number');
  try {
    await tx.inventoryItem.update({
      where: {
        id: item.id,
        branchId: input.branchId,
        currentStock: item.currentStock,
        heldStock: held,
      },
      data: {
        currentStock: afterStock,
        heldStock: held - release,
        stockStatus: stockStatus(item, afterStock),
      },
    });
  } catch (error) {
    if ((error as any)?.code === 'P2025')
      throw new ConflictException(
        'Stock changed. Refresh the batch and retry.',
      );
    throw error;
  }
  return tx.stockTransaction.create({
    data: {
      branchId: input.branchId,
      userId: input.userId,
      itemId: item.id,
      type: input.type,
      quantity: Math.abs(input.delta),
      quantityDelta: input.delta,
      unitPrice: money(unitPrice),
      totalAmount: money(Math.abs(input.delta) * unitPrice),
      reference: input.reference,
      reason: input.reason,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      supplier: item.supplier,
      location: input.location ?? item.storageLocation,
      notes: JSON.stringify({
        costPerStockUnit: money(item.costPrice),
        accountingCategory:
          input.type === 'SALE'
            ? 'SALE'
            : ['DAMAGED', 'EXPIRED'].includes(input.type)
              ? 'LOSS'
              : undefined,
        ...input.metadata,
        text: input.notes,
        delta: input.delta,
        beforeStock: item.currentStock,
        afterStock,
        quantityUnit: item.unit,
      }),
    },
  });
}
