import { jsonObject } from '../inventory/inventory-stock';
import { money } from './gst-slabs';

/** Cost of one stock unit as recorded on the stock movement: the purchase rate before GST, plus the GST rate paid on it. */
export type UnitCost = { perUnit: number; gstRate: number };

/**
 * One sold (or returned, with negative quantity and amounts) batch quantity.
 * `cost` is null when no usable cost was recorded for the movement.
 */
export type MarginLine = {
  productKey: string;
  kind: 'SALE' | 'RETURN';
  quantity: number;
  salesAmount: number;
  outputGst: number;
  cost: UnitCost | null;
};

export type MarginBatch = {
  id: string;
  name: string;
  category: string | null;
  manufacturer: string | null;
  unit: string;
  packSize: number | null;
  packUnit: string | null;
  mrp: number | null;
  currentStock: number;
  gstRate: number | null;
  createdAt: Date;
  tags: string | null;
  type: string;
  drugs: { id: string; name: string; manufacturerName: string; packSizeLabel: string; category: string | null }[];
};

export type MarginProduct = {
  key: string;
  name: string;
  category: string | null;
  unitLabel: string;
  manufacturer: string | null;
  stock: number;
  mrp: number | null;
  itemId: string | null;
  tags: string[];
  itemType: string | null;
};

export type MarginRow = MarginProduct & {
  saleQuantity: number;
  averageSalePrice: number | null;
  salesAmount: number;
  purchase: number | null;
  netGst: number | null;
  profit: number | null;
  profitPercent: number | null;
  knownTaxableSales: number | null;
  unknownCost: { lineCount: number; quantity: number; salesAmount: number };
};

export const MARGIN_TYPES = ['NET', 'SALES', 'RETURNS'] as const;
export const MARGIN_SEARCH_FIELDS = ['ALL', 'NAME', 'CATEGORY', 'MANUFACTURER'] as const;
export const MARGIN_COST_STATUSES = ['ALL', 'MISSING_COST', 'LOSS'] as const;
export const MARGIN_ITEM_TYPES = ['MEDICINE', 'EQUIPMENT', 'SUPPLY', 'CONSUMABLE'] as const;

export type MarginType = (typeof MARGIN_TYPES)[number];
export type MarginSearchField = (typeof MARGIN_SEARCH_FIELDS)[number];
export type MarginCostStatus = (typeof MARGIN_COST_STATUSES)[number];
export type MarginItemType = (typeof MARGIN_ITEM_TYPES)[number];

export type MarginFilters = {
  type: MarginType;
  search?: string;
  searchField: MarginSearchField;
  tag?: string;
  category?: string;
  manufacturer?: string;
  itemType?: MarginItemType;
  costStatus: MarginCostStatus;
};

export const DEFAULT_MARGIN_FILTERS: MarginFilters = { type: 'NET', searchField: 'ALL', costStatus: 'ALL' };

export type MarginOptions = { tags: string[]; categories: string[]; manufacturers: string[]; itemTypes: string[] };

/** Trims the text filters and drops empty ones, so an empty box means no filter. */
export function marginFiltersFrom(query: Partial<Record<keyof MarginFilters, string | undefined>>): MarginFilters {
  const text = (value: string | undefined) => value?.trim().replace(/\s+/g, ' ') || undefined;
  return {
    type: (query.type as MarginType) ?? DEFAULT_MARGIN_FILTERS.type,
    searchField: (query.searchField as MarginSearchField) ?? DEFAULT_MARGIN_FILTERS.searchField,
    costStatus: (query.costStatus as MarginCostStatus) ?? DEFAULT_MARGIN_FILTERS.costStatus,
    itemType: query.itemType as MarginItemType | undefined,
    search: text(query.search),
    tag: text(query.tag),
    category: text(query.category),
    manufacturer: text(query.manufacturer),
  };
}

const normalize = (value: string | null | undefined) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Item tags are stored as a JSON array of strings; older rows hold a comma-separated list. */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    list = raw.split(',');
  }
  return Array.isArray(list) ? list.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean) : [];
}

function uniqueByNormalized(values: Iterable<string>) {
  const seen = new Map<string, string>();
  for (const value of values) if (!seen.has(normalize(value))) seen.set(normalize(value), value.trim());
  return Array.from(seen.values());
}

export function unitLabel(batch: Pick<MarginBatch, 'packSize' | 'packUnit' | 'unit'>, packSizeLabel?: string) {
  if (batch.packSize && batch.packUnit?.trim()) return `${batch.packSize} ${batch.packUnit.trim()}`;
  return packSizeLabel?.trim() || batch.unit;
}

export function productKey(batch: Pick<MarginBatch, 'name' | 'manufacturer' | 'packSize' | 'packUnit' | 'unit' | 'drugs'>) {
  if (batch.drugs.length === 1) return `drug:${batch.drugs[0].id}`;
  return `item:${[batch.name, batch.manufacturer, batch.packSize ?? '', batch.packUnit, batch.unit].map((v) => normalize(String(v ?? ''))).join('|')}`;
}

export function productCatalog(batches: MarginBatch[]): Map<string, MarginProduct> {
  const groups = new Map<string, MarginBatch[]>();
  for (const batch of batches) {
    const key = productKey(batch);
    groups.set(key, [...(groups.get(key) || []), batch]);
  }
  const catalog = new Map<string, MarginProduct>();
  for (const [key, group] of groups) {
    const latest = [...group].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0];
    const drug = latest.drugs.length === 1 ? latest.drugs[0] : null;
    catalog.set(key, {
      tags: uniqueByNormalized(group.flatMap((batch) => parseTags(batch.tags))),
      itemType: latest.type,
      key,
      name: drug?.name || latest.name,
      category: latest.category || drug?.category || null,
      unitLabel: unitLabel(latest, drug?.packSizeLabel),
      manufacturer: latest.manufacturer || drug?.manufacturerName || null,
      stock: group.reduce((sum, batch) => sum + Number(batch.currentStock || 0), 0),
      mrp: latest.mrp ?? null,
      itemId: latest.id,
    });
  }
  return catalog;
}

const ratio = (part: number, whole: number) => (whole ? money((part / whole) * 100) : null);

function marginRow(product: MarginProduct, lines: MarginLine[]): MarginRow {
  const known = lines.filter((line) => line.cost);
  const unknown = lines.filter((line) => !line.cost);
  const saleQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const salesAmount = money(lines.reduce((sum, line) => sum + line.salesAmount, 0));
  const unknownCost = {
    lineCount: unknown.length,
    quantity: unknown.reduce((sum, line) => sum + line.quantity, 0),
    salesAmount: money(unknown.reduce((sum, line) => sum + line.salesAmount, 0)),
  };
  const base = { ...product, saleQuantity, averageSalePrice: saleQuantity ? money(salesAmount / saleQuantity) : null, salesAmount, unknownCost };
  if (!known.length) return { ...base, purchase: null, netGst: null, profit: null, profitPercent: null, knownTaxableSales: null };

  const knownSales = money(known.reduce((sum, line) => sum + line.salesAmount, 0));
  const knownOutputGst = money(known.reduce((sum, line) => sum + line.outputGst, 0));
  const taxableCost = known.reduce((sum, line) => sum + line.quantity * line.cost!.perUnit, 0);
  const inputGst = money(known.reduce((sum, line) => sum + (line.quantity * line.cost!.perUnit * line.cost!.gstRate) / 100, 0));
  const purchase = money(taxableCost + inputGst);
  const netGst = money(knownOutputGst - inputGst);
  const profit = money(knownSales - purchase - netGst);
  const knownTaxableSales = money(knownSales - knownOutputGst);
  return { ...base, purchase, netGst, profit, profitPercent: ratio(profit, knownTaxableSales), knownTaxableSales };
}

const byMarginDesc = (a: MarginRow, b: MarginRow) =>
  (b.profitPercent ?? -Infinity) - (a.profitPercent ?? -Infinity) || (b.profit ?? 0) - (a.profit ?? 0) || a.name.localeCompare(b.name);

const LINE_KINDS_BY_TYPE: Record<MarginType, readonly MarginLine['kind'][]> = {
  NET: ['SALE', 'RETURN'],
  SALES: ['SALE'],
  RETURNS: ['RETURN'],
};

const SEARCH_FIELDS: Record<MarginSearchField, (row: MarginRow) => (string | null)[]> = {
  ALL: (row) => [row.name, row.category, row.manufacturer],
  NAME: (row) => [row.name],
  CATEGORY: (row) => [row.category],
  MANUFACTURER: (row) => [row.manufacturer],
};

function rowMatches(row: MarginRow, filters: MarginFilters) {
  const needle = normalize(filters.search);
  const tag = normalize(filters.tag);
  const category = normalize(filters.category);
  const manufacturer = normalize(filters.manufacturer);
  return (
    (!needle || SEARCH_FIELDS[filters.searchField](row).some((value) => normalize(value).includes(needle))) &&
    (!tag || row.tags.some((value) => normalize(value) === tag)) &&
    (!category || normalize(row.category) === category) &&
    (!manufacturer || normalize(row.manufacturer) === manufacturer) &&
    (!filters.itemType || row.itemType === filters.itemType) &&
    (filters.costStatus === 'ALL' ||
      (filters.costStatus === 'MISSING_COST' ? row.unknownCost.lineCount > 0 : (row.profit ?? 0) < 0))
  );
}

const sortedUnique = (values: Iterable<string>) => uniqueByNormalized(values).sort((a, b) => a.localeCompare(b));

export function marginOptions(rows: MarginRow[]): MarginOptions {
  return {
    tags: sortedUnique(rows.flatMap((row) => row.tags)),
    categories: sortedUnique(rows.flatMap((row) => (row.category ? [row.category] : []))),
    manufacturers: sortedUnique(rows.flatMap((row) => (row.manufacturer ? [row.manufacturer] : []))),
    itemTypes: sortedUnique(rows.flatMap((row) => (row.itemType ? [row.itemType] : []))),
  };
}

export function buildItemMarginReport(input: {
  lines: MarginLine[];
  catalog: Map<string, MarginProduct>;
  fallbackProducts: Map<string, MarginProduct>;
  filters?: Partial<MarginFilters>;
}) {
  const filters: MarginFilters = { ...DEFAULT_MARGIN_FILTERS, ...input.filters };
  const linesByProduct = new Map<string, MarginLine[]>();
  for (const line of input.lines) {
    if (!LINE_KINDS_BY_TYPE[filters.type].includes(line.kind)) continue;
    linesByProduct.set(line.productKey, [...(linesByProduct.get(line.productKey) || []), line]);
  }

  const periodRows = Array.from(linesByProduct, ([key, lines]) => marginRow(input.catalog.get(key) || input.fallbackProducts.get(key)!, lines));
  const rows = periodRows.filter((row) => rowMatches(row, filters)).sort(byMarginDesc);

  const sum = (pick: (row: MarginRow) => number | null) => money(rows.reduce((total, row) => total + (pick(row) ?? 0), 0));
  const profit = sum((row) => row.profit);
  return {
    rows,
    options: marginOptions(periodRows),
    totals: {
      salesAmount: sum((row) => row.salesAmount),
      purchase: sum((row) => row.purchase),
      netGst: sum((row) => row.netGst),
      profit,
      profitPercent: ratio(profit, sum((row) => row.knownTaxableSales)),
      itemCount: rows.length,
      unknownCost: {
        lineCount: rows.reduce((total, row) => total + row.unknownCost.lineCount, 0),
        itemCount: rows.filter((row) => row.unknownCost.lineCount > 0).length,
        salesAmount: sum((row) => row.unknownCost.salesAmount),
      },
    },
  };
}

export type MarginInvoice = {
  invoiceNumber: string;
  items: {
    drugId: string | null;
    packageId: string | null;
    quantity: number;
    totalAmount: number;
    taxAmount: number;
    drug?: { name: string; manufacturerName: string; packSizeLabel: string; category: string | null } | null;
    package?: { name: string } | null;
  }[];
};

export type MarginMovement = { id: string; itemId: string; type: string; quantity: number; reference: string | null; notes: string | null };

export type MarginWorkflowDocument = {
  kind: 'COUNTER_SALE' | 'SALES_RETURN';
  reference: string;
  payload: {
    lines: {
      id: string;
      inventoryId?: string;
      sourceLineId?: string;
      name: string;
      quantity: number;
      freeQuantity?: number;
      gstRate: number;
      tax: number;
      total: number;
    }[];
  };
};

/**
 * A recorded cost of 0 counts as missing: it is what an item without a purchase price carries
 * (the stock list flags it as "Purchase price missing"), and counting it would report the whole
 * sale as profit.
 */
function unitCost(perUnit: unknown, gstRate: unknown): UnitCost | null {
  const value = Number(perUnit);
  return perUnit != null && Number.isFinite(value) && value > 0 ? { perUnit: value, gstRate: Number(gstRate) || 0 } : null;
}

const product = (key: string, name: string, extra: Partial<MarginProduct> = {}): MarginProduct => ({
  key, name, category: null, unitLabel: '', manufacturer: null, stock: 0, mrp: null, itemId: null, tags: [], itemType: null, ...extra,
});

/**
 * Turns posted sales documents into per-batch margin lines.
 * Pharmacy invoices are read from their SALE stock movements, which split packages into drugs and
 * carry the per-unit sale terms and cost frozen at confirmation. An invoice without such movements
 * falls back to its own lines, with unknown cost. Counter sales and customer returns come from the
 * workflow document lines; a return takes the cost of the original sale it reverses.
 */
export function marginLinesFrom(input: {
  invoices: MarginInvoice[];
  documents: MarginWorkflowDocument[];
  movements: MarginMovement[];
  batches: MarginBatch[];
}) {
  const batchById = new Map(input.batches.map((batch) => [batch.id, batch]));
  const movementById = new Map(input.movements.map((movement) => [movement.id, movement]));
  const movementsByReference = new Map<string, MarginMovement[]>();
  for (const movement of input.movements) {
    if (movement.reference) movementsByReference.set(movement.reference, [...(movementsByReference.get(movement.reference) || []), movement]);
  }
  const fallbackProducts = new Map<string, MarginProduct>();
  const lines: MarginLine[] = [];

  const batchKey = (inventoryId: string | undefined, name: string) => {
    const batch = inventoryId ? batchById.get(inventoryId) : undefined;
    if (batch) return { key: productKey(batch), batch };
    const key = `item:${normalize(name)}`;
    if (!fallbackProducts.has(key)) fallbackProducts.set(key, product(key, name));
    return { key, batch: undefined };
  };

  for (const invoice of input.invoices) {
    const movements = (movementsByReference.get(`INV-${invoice.invoiceNumber}`) || []).filter(
      (movement) => movement.type === 'SALE' && Number.isFinite(jsonObject(movement.notes).saleTerms?.taxablePerUnit),
    );
    if (movements.length) {
      for (const movement of movements) {
        const notes = jsonObject(movement.notes);
        const { key, batch } = batchKey(movement.itemId, movement.itemId);
        const tax = movement.quantity * Number(notes.saleTerms.taxPerUnit || 0);
        lines.push({
          productKey: key,
          kind: 'SALE',
          quantity: movement.quantity,
          salesAmount: movement.quantity * notes.saleTerms.taxablePerUnit + tax,
          outputGst: tax,
          cost: unitCost(notes.costPerStockUnit, batch?.gstRate ?? notes.saleTerms.gstRate),
        });
      }
      continue;
    }
    for (const item of invoice.items) {
      const key = item.drugId ? `drug:${item.drugId}` : `package:${item.packageId}`;
      if (!fallbackProducts.has(key)) {
        fallbackProducts.set(key, item.drug
          ? product(key, item.drug.name, { manufacturer: item.drug.manufacturerName, unitLabel: item.drug.packSizeLabel, category: item.drug.category })
          : product(key, item.package?.name || 'Package'));
      }
      lines.push({ productKey: key, kind: 'SALE', quantity: item.quantity, salesAmount: Number(item.totalAmount), outputGst: Number(item.taxAmount || 0), cost: null });
    }
  }

  for (const doc of input.documents) {
    const sign = doc.kind === 'SALES_RETURN' ? -1 : 1;
    const docMovements = movementsByReference.get(`WF-${doc.reference}`) || [];
    for (const line of doc.payload.lines) {
      const { key, batch } = batchKey(line.inventoryId, line.name);
      const costMovement = doc.kind === 'SALES_RETURN'
        ? (line.sourceLineId ? movementById.get(line.sourceLineId) : undefined)
        : docMovements.find((movement) => jsonObject(movement.notes).workflowLineId === line.id);
      lines.push({
        productKey: key,
        kind: doc.kind === 'SALES_RETURN' ? 'RETURN' : 'SALE',
        quantity: sign * (line.quantity + (line.freeQuantity || 0)),
        salesAmount: sign * Number(line.total || 0),
        outputGst: sign * Number(line.tax || 0),
        cost: costMovement ? unitCost(jsonObject(costMovement.notes).costPerStockUnit, batch?.gstRate ?? line.gstRate) : null,
      });
    }
  }
  return { lines, fallbackProducts };
}
