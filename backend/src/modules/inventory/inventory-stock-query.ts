import { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import {
  checkedProductQuery,
  matchProductSearch,
  ProductSearchMatch,
} from '../../shared/search/product-search';
import { inventoryNameAliases } from './inventory-names';
import { money } from './inventory-stock';

type StockDatabase = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'inventoryItem'
>;
type StockQuery = Record<string, any>;
const facetFields = [
  'category',
  'subCategory',
  'manufacturer',
  'supplier',
  'type',
  'unit',
  'storageLocation',
  'status',
];
const column = (name: string) => Prisma.raw(`i."${name}"`);
const presentDrugs = {
  select: {
    id: true,
    name: true,
    packSizeLabel: true,
    composition1: true,
    composition2: true,
    manufacturerName: true,
    strength: true,
    dosageForm: true,
  },
};
const available = Prisma.sql`(i."currentStock" - i."heldStock")`;
const margin = Prisma.sql`CASE WHEN i.mrp > 0 THEN floor(((i.mrp - i."costPrice") / i.mrp * 100 + 2.220446049250313e-16) * 100 + 0.5) / 100 END`;
const landing = Prisma.sql`inventory_read_number(i.meta->>'landingCostPerStockUnit')`;
const issues = {
  'Category missing': Prisma.sql`coalesce(i.category, '') = ''`,
  'HSN missing': Prisma.sql`coalesce(i."hsnCode", '') = ''`,
  'GST missing': Prisma.sql`i."gstRate" IS NULL`,
  'Location missing': Prisma.sql`coalesce(i."storageLocation", '') = ''`,
  'Minimum missing': Prisma.sql`i."minStockLevel" IS NULL`,
  'Maximum missing': Prisma.sql`i."maxStockLevel" IS NULL`,
  'Pack size missing': Prisma.sql`coalesce(i."packSize", 0) = 0`,
  'Batch missing': Prisma.sql`coalesce(i."batchNumber", '') = ''`,
  'Expiry missing': Prisma.sql`i."expiryDate" IS NULL`,
  'Purchase price missing': Prisma.sql`i."costPrice" = 0`,
  'MRP missing': Prisma.sql`coalesce(i.mrp, 0) = 0`,
};
const truthy = (value: Prisma.Sql) =>
  Prisma.sql`coalesce(${value}, 'null'::jsonb) NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb)`;
const totals = Prisma.sql`jsonb_build_object(
  'batches', count(*), 'units', coalesce(sum(i."currentStock"), 0),
  'PTR', coalesce(sum(i."currentStock" * i."costPrice"), 0),
  'MRP', coalesce(sum(i."currentStock" * coalesce(i.mrp, i."sellingPrice")), 0),
  'MRPExcludingTax', coalesce(sum(i."currentStock" * coalesce(i.mrp, i."sellingPrice") / (1 + i."gstRate" / 100)), 0),
  'MRPTaxUnknownBatches', count(*) FILTER (WHERE i."gstRate" IS NULL),
  'landingKnown', coalesce(sum(i."currentStock" * ${landing}), 0),
  'landingUnknownBatches', count(*) FILTER (WHERE i."currentStock" > 0 AND (i.meta->>'landingCostPerStockUnit') IS NULL)
)`;

/**
 * @cc [owner:nareshshah139,label:product] stock-sql-complete-filter-scope
 * Exact stock filters, valuation and counts MUST cover all eligible branch batches before
 * pagination. Missing prices, thresholds and tax values MUST remain distinct from zero.
 * Facets and quality counts MUST continue to describe the entire branch.
 */
/**
 * @cc [owner:nareshshah139,label:performance] stock-bounded-hydration
 * Only the requested page may load full inventory rows. Fuzzy matching MUST examine all
 * eligible candidates in batches of at most 500 without a result cap. String sorts MUST
 * preserve JavaScript locale ordering; numeric/date sorts and aggregates run in the database.
 */
export async function readStockPage(
  db: StockDatabase,
  branchId: string,
  q: StockQuery,
  present: (item: any) => any,
) {
  const batchView = q.batchView || 'ALL';
  if (!['ALL', 'ON_HAND', 'EMPTY'].includes(batchView))
    throw new BadRequestException('Unknown batch view');
  const search = checkedProductQuery(q.search);
  const now = new Date();
  const expiryStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const future = new Date(expiryStart),
    months = Number(q.expiryMonths || 0);
  if (![0, 1, 2, 3, 6].includes(months))
    throw new BadRequestException('Expiry window must be 1, 2, 3 or 6 months');
  const day = future.getUTCDate();
  future.setUTCDate(1);
  future.setUTCMonth(future.getUTCMonth() + months);
  future.setUTCDate(
    Math.min(
      day,
      new Date(
        Date.UTC(future.getUTCFullYear(), future.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  future.setUTCHours(23, 59, 59, 999);
  const priceBasis = q.priceBasis || 'PTR';
  if (!['PTR', 'MRP', 'SELLING', 'LANDING'].includes(priceBasis))
    throw new BadRequestException('Unknown price basis');
  for (const key of ['minPrice', 'maxPrice', 'minMargin', 'maxMargin']) {
    if (
      q[key] !== undefined &&
      q[key] !== '' &&
      (!Number.isFinite(Number(q[key])) || Number(q[key]) < 0)
    )
      throw new BadRequestException(`${key} must be a nonnegative number`);
  }
  const sortBy = q.sortBy || (search ? 'relevance' : 'name');
  if (
    ![
      'relevance',
      'name',
      'currentStock',
      'available',
      'costPrice',
      'mrp',
      'expiryDate',
      'storageLocation',
      'updatedAt',
    ].includes(sortBy) ||
    (q.sortOrder && !['asc', 'desc'].includes(q.sortOrder))
  )
    throw new BadRequestException('Invalid stock sort');
  const sortOrder = q.sortOrder || (sortBy === 'relevance' ? 'desc' : 'asc');
  const page = Math.max(1, Math.floor(Number(q.page) || 1)),
    limit = Math.min(100, Math.max(1, Math.floor(Number(q.limit) || 30)));
  const base = Prisma.sql`WITH branch_items AS (
    SELECT i.*, inventory_read_json(i.metadata) AS meta FROM inventory_items i WHERE i."branchId" = ${branchId}
  )`;
  const [summary] = await db.$queryRaw<
    { facets: Record<string, string[]>; quality: Record<string, number> }[]
  >(Prisma.sql`${base}
    SELECT jsonb_build_object(${Prisma.join(facetFields.flatMap((field) => [Prisma.sql`${field}`, Prisma.sql`coalesce(jsonb_agg(DISTINCT ${column(field)}::text) FILTER (WHERE coalesce(${column(field)}::text, '') <> ''), '[]'::jsonb)`]))}) AS facets,
      jsonb_build_object(${Prisma.join(Object.entries(issues).flatMap(([name, condition]) => [Prisma.sql`${name}`, Prisma.sql`count(*) FILTER (WHERE ${condition})`]))}) AS quality
    FROM branch_items i`);
  const filters: Prisma.Sql[] = [];
  if (batchView === 'ON_HAND') filters.push(Prisma.sql`i."currentStock" > 0`);
  if (batchView === 'EMPTY') filters.push(Prisma.sql`i."currentStock" = 0`);
  if (q.saleEligible === 'true')
    filters.push(
      Prisma.sql`i.status = 'ACTIVE' AND ${available} > 0 AND (i."expiryDate" IS NULL OR i."expiryDate" >= ${expiryStart})`,
    );
  if (search.startsWith('inventory:'))
    filters.push(Prisma.sql`i.id = ${search.slice('inventory:'.length)}`);
  for (const field of facetFields)
    if (q[field])
      filters.push(
        Prisma.sql`lower(coalesce(${column(field)}::text, '')) = ${String(q[field]).toLowerCase()}`,
      );
  for (const field of ['dosageForm', 'schedule'])
    if (q[field])
      filters.push(
        Prisma.sql`lower(coalesce(i.meta->>${field}, '')) = ${String(q[field]).toLowerCase()}`,
      );
  if (q.gst)
    filters.push(
      q.gst === 'MISSING'
        ? Prisma.sql`i."gstRate" IS NULL`
        : Prisma.sql`i."gstRate" = ${Number(q.gst)}`,
    );
  if (q.hsn)
    filters.push(
      q.hsn === 'MISSING'
        ? Prisma.sql`coalesce(i."hsnCode", '') = ''`
        : Prisma.sql`strpos(lower(coalesce(i."hsnCode", '')), ${String(q.hsn).toLowerCase()}) > 0`,
    );
  const stockFilters: Record<string, Prisma.Sql> = {
    LOW: Prisma.sql`${available} <= coalesce(i."minStockLevel", i."reorderLevel", -1)`,
    ZERO: Prisma.sql`i."currentStock" = 0`,
    AVAILABLE: Prisma.sql`${available} > 0`,
    HIGH: Prisma.sql`i."maxStockLevel" IS NOT NULL AND i."currentStock" > i."maxStockLevel"`,
    POSITIVE: Prisma.sql`i."currentStock" > 0`,
    NEGATIVE: Prisma.sql`i."currentStock" < 0`,
    HELD: Prisma.sql`i."heldStock" <> 0`,
    EXPIRED: Prisma.sql`i."expiryDate" < ${expiryStart}`,
  };
  if (stockFilters[q.stock]) filters.push(stockFilters[q.stock]);
  if (q.expiryMonths)
    filters.push(
      Prisma.sql`i."currentStock" > 0 AND i."expiryDate" >= ${expiryStart} AND i."expiryDate" <= ${future}`,
    );
  if (q.mapping)
    filters.push(Prisma.sql`CASE WHEN i.meta->>'mappingStatus' = 'PENDING' OR ${truthy(Prisma.sql`i.meta->'mappingPending'`)} THEN 'PENDING'
    WHEN EXISTS (SELECT 1 FROM "_DrugToInventoryItem" link WHERE link."B" = i.id) THEN 'MAPPED' ELSE 'UNMAPPED' END = ${q.mapping}`);
  if (q.missing) {
    const matching = Object.entries(issues)
      .filter(([name]) =>
        name.toLowerCase().includes(String(q.missing).toLowerCase()),
      )
      .map(([, condition]) => condition);
    filters.push(
      matching.length
        ? Prisma.sql`(${Prisma.join(matching, ' OR ')})`
        : Prisma.sql`false`,
    );
  }
  const price =
    priceBasis === 'PTR'
      ? column('costPrice')
      : priceBasis === 'MRP'
        ? column('mrp')
        : priceBasis === 'SELLING'
          ? column('sellingPrice')
          : landing;
  for (const [key, value, operator] of [
    ['minPrice', price, '>='],
    ['maxPrice', price, '<='],
    ['minMargin', margin, '>='],
    ['maxMargin', margin, '<='],
  ] as const) {
    if (q[key] !== undefined && q[key] !== '')
      filters.push(
        Prisma.sql`${value} ${Prisma.raw(operator)} ${Number(q[key])}`,
      );
  }
  if (q.audit === 'MISSING')
    filters.push(
      Prisma.sql`NOT (${truthy(Prisma.sql`i.meta->'lastCountAt'`)})`,
    );
  if (q.audit === 'COUNTED')
    filters.push(truthy(Prisma.sql`i.meta->'lastCountAt'`));
  const audit = ['PENDING', 'COMPLETED', 'BLOCKED'].includes(q.audit);
  const auditState = Prisma.sql`coalesce((SELECT CASE WHEN doc.status = 'POSTED' THEN 'COMPLETED' WHEN doc.status IN ('AWAITING_APPROVAL', 'REJECTED') THEN 'BLOCKED'
    WHEN doc.status IN ('CANCELLED', 'REVERSED') THEN 'NONE' ELSE 'PENDING' END
    FROM inventory_workflow_documents doc WHERE doc."branchId" = ${branchId} AND doc.kind = 'COUNT'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(doc.payload->'lines', '[]'::jsonb)) line WHERE line->>'inventoryId' = i.id)
    ORDER BY doc."createdAt" DESC, doc.id DESC LIMIT 1), 'NONE')`;
  if (audit) filters.push(Prisma.sql`${auditState} = ${q.audit}`);
  const filtered = () =>
    Prisma.sql`${base}, filtered AS (SELECT i.* FROM branch_items i WHERE ${filters.length ? Prisma.join(filters, ' AND ') : Prisma.sql`true`})`;
  const matches = new Map<string, ProductSearchMatch>();
  const fuzzy = search && !search.startsWith('inventory:');
  if (fuzzy) {
    let cursor = '';
    for (;;) {
      const candidates = await db.$queryRaw<any[]>(Prisma.sql`${filtered()}
        SELECT i.id, i.name, i."brandName", i."genericName", i.manufacturer, i.category, i."packSize", i."packUnit",
          i."batchNumber", i.barcode, i.sku, i.meta AS metadata,
          coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'packSizeLabel', d."packSizeLabel", 'composition1', d.composition1,
            'composition2', d.composition2, 'manufacturerName', d."manufacturerName", 'strength', d.strength, 'dosageForm', d."dosageForm") ORDER BY d.id)
            FROM "_DrugToInventoryItem" link JOIN drugs d ON d.id = link."A" WHERE link."B" = i.id), '[]'::jsonb) AS drugs
        FROM filtered i WHERE i.id > ${cursor} ORDER BY i.id LIMIT 500`);
      for (const candidate of candidates) {
        const i = present(candidate),
          drugs = i.drugs;
        const match = matchProductSearch(search, {
          names: [
            i.name,
            i.productName,
            i.brandName,
            ...drugs.map((d: any) => d.name),
          ].filter(Boolean),
          aliases: inventoryNameAliases(i.metadata),
          ingredients: [
            i.genericName,
            ...drugs.flatMap((d: any) => [d.composition1, d.composition2]),
          ].filter(Boolean),
          manufacturer: i.manufacturer || drugs[0]?.manufacturerName,
          category: i.category,
          strength: drugs.length === 1 ? drugs[0].strength : undefined,
          details: [
            i.packLabel,
            ...drugs.flatMap((d: any) => [
              d.packSizeLabel,
              d.strength,
              d.dosageForm,
            ]),
          ],
          codes: [
            i.id,
            i.batchNumber,
            i.barcode,
            i.sku,
            i.metadata.sourceItemCode,
          ],
        });
        if (match) matches.set(i.id, match);
      }
      if (candidates.length < 500) break;
      cursor = candidates[candidates.length - 1].id;
    }
    filters.push(Prisma.sql`i.id = ANY(${[...matches.keys()]}::text[])`);
  }
  const [aggregate] = await db.$queryRaw<
    { total: number; current: any; expired: any }[]
  >(Prisma.sql`${filtered()}
    SELECT (SELECT count(*)::int FROM filtered) AS total,
      (SELECT ${totals} FROM filtered i WHERE i."expiryDate" IS NULL OR i."expiryDate" >= ${expiryStart}) AS current,
      (SELECT ${totals} FROM filtered i WHERE i."expiryDate" < ${expiryStart}) AS expired`);
  let ids: string[];
  if (['name', 'storageLocation', 'relevance'].includes(sortBy)) {
    const values: { id: string; value: string | null; name: string }[] = [];
    let cursor = '';
    for (;;) {
      const chunk = await db.$queryRaw<typeof values>(Prisma.sql`${filtered()}
        SELECT i.id, ${sortBy === 'storageLocation' ? column('storageLocation') : column('name')} AS value, i.name
        FROM filtered i WHERE i.id > ${cursor} ORDER BY i.id LIMIT 500`);
      values.push(...chunk);
      if (chunk.length < 500) break;
      cursor = chunk[chunk.length - 1].id;
    }
    values.sort((a, b) => {
      const av =
        sortBy === 'relevance' ? matches.get(a.id)?.score || 0 : a.value;
      const bv =
        sortBy === 'relevance' ? matches.get(b.id)?.score || 0 : b.value;
      const cmp =
        av == null
          ? bv == null
            ? 0
            : 1
          : bv == null
            ? -1
            : typeof av === 'number'
              ? av - Number(bv)
              : String(av).localeCompare(String(bv));
      return (
        (sortOrder === 'desc' ? -cmp : cmp) ||
        (sortBy === 'relevance' ? a.name.localeCompare(b.name) : 0) ||
        a.id.localeCompare(b.id)
      );
    });
    ids = values.slice((page - 1) * limit, page * limit).map((row) => row.id);
  } else {
    const order = Prisma.raw(
      sortOrder === 'desc' ? 'DESC NULLS FIRST' : 'ASC NULLS LAST',
    );
    ids = (
      await db.$queryRaw<{ id: string }[]>(Prisma.sql`${filtered()}
      SELECT i.id FROM filtered i ORDER BY ${sortBy === 'available' ? available : column(sortBy)} ${order}, i.id ASC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`)
    ).map((row) => row.id);
  }
  const hydrated = await db.inventoryItem.findMany({
    where: { branchId, id: { in: ids } },
    include: { drugs: presentDrugs, _count: { select: { drugs: true } } },
  });
  const byId = new Map(hydrated.map((item) => [item.id, present(item)]));
  const rows = ids.map((id) => ({
    ...byId.get(id),
    ...(matches.has(id) ? { searchMatch: matches.get(id) } : {}),
    ...(audit ? { auditState: q.audit } : {}),
  }));
  for (const valuation of [aggregate.current, aggregate.expired])
    for (const key of ['PTR', 'MRP', 'MRPExcludingTax', 'landingKnown'])
      valuation[key] = money(valuation[key]);
  return {
    filterScope: {
      batchView,
      asOf: now.toISOString(),
      expiryStart: expiryStart.toISOString(),
      expiryEnd: future.toISOString(),
      expiryBoundary:
        'Expiry dates remain valid through the entire UTC calendar day. Expired before expiryStart; upcoming through inclusive expiryEnd using clamped calendar months',
      priceBasis,
      sortBy,
      sortOrder,
    },
    rows,
    total: aggregate.total,
    page,
    limit,
    totalPages: Math.ceil(aggregate.total / limit),
    facets: Object.fromEntries(
      Object.entries(summary.facets).map(([field, values]) => [
        field,
        values.sort(),
      ]),
    ),
    valuation: { current: aggregate.current, expired: aggregate.expired },
    quality: Object.fromEntries(
      Object.entries(summary.quality).filter(([, count]) => count > 0),
    ),
  };
}
