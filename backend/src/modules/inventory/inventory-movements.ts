import { BadRequestException } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';

export interface InventoryMovementQuery {
  search?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  itemId?: string;
  page?: string;
  limit?: string;
}

/**
 * @cc [owner:nareshshah139] branch-movement-query
 * Movement filters MUST retain the authenticated branch on both movements and items.
 */
/**
 * @cc [owner:nareshshah139] valid-movement-query
 * Invalid types, timestamps, date ranges or pagination MUST fail before querying stock.
 */
export function inventoryMovementQuery(
  branchId: string,
  query: InventoryMovementQuery,
) {
  if (!branchId) throw new BadRequestException('An active branch is required');
  for (const key of [
    'search',
    'type',
    'dateFrom',
    'dateTo',
    'itemId',
    'page',
    'limit',
  ] as const) {
    if (query[key] !== undefined && typeof query[key] !== 'string')
      throw new BadRequestException(`Invalid ${key} filter`);
  }
  const page = Number(query.page ?? 1),
    limit = Number(query.limit ?? 30);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger((page - 1) * limit)
  ) {
    throw new BadRequestException(
      'Use a positive page and a page size between 1 and 100',
    );
  }
  const where: Prisma.StockTransactionWhereInput = {
    branchId,
    item: { branchId },
  };
  if (query.type) {
    if (
      !Object.values(TransactionType).includes(query.type as TransactionType)
    ) {
      throw new BadRequestException('Choose a valid movement type');
    }
    where.type = query.type as TransactionType;
  }
  if (query.itemId) where.itemId = query.itemId;
  const search = query.search?.trim();
  if (search) {
    if (search.length > 200)
      throw new BadRequestException('Search must be 200 characters or fewer');
    where.OR = [
      { item: { name: { contains: search, mode: 'insensitive' } } },
      { item: { batchNumber: { contains: search, mode: 'insensitive' } } },
      { batchNumber: { contains: search, mode: 'insensitive' } },
      { reference: { contains: search, mode: 'insensitive' } },
    ];
  }
  const dates: { gte?: Date; lte?: Date } = {};
  for (const [key, value] of [
    ['gte', query.dateFrom],
    ['lte', query.dateTo],
  ] as const) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
      throw new BadRequestException(
        'Use a valid date and time for movement filters',
      );
    }
    dates[key] = date;
  }
  if (dates.gte && dates.lte && dates.gte > dates.lte)
    throw new BadRequestException('Start date must be on or before end date');
  if (dates.gte || dates.lte) where.createdAt = dates;
  return { where, page, limit };
}
