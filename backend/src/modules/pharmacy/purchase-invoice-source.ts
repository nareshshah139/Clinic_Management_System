// Source locations are approximate visual evidence, never stock validation input.
export const SOURCE_HEADER_FIELDS = [
  'distributorName',
  'distributorAddress',
  'distributorGstin',
  'distributorDlNo',
  'distributorFoodLicense',
  'invoiceNumber',
  'invoiceDate',
  'goodsReceivedDate',
  'billType',
  'dueDate',
  'grossAmount',
  'taxableAmount',
  'totalCgst',
  'totalSgst',
  'totalIgst',
  'totalGst',
  'netPayable',
  'rounding',
  'tcsAmount',
] as const;
export const SOURCE_LINE_FIELDS = [
  'productName',
  'manufacturer',
  'packSize',
  'packUnitType',
  'hsnCode',
  'batchNumber',
  'expiryMonth',
  'expiryYear',
  'quantityPurchased',
  'freeQuantity',
  'mrp',
  'oldMrp',
  'purchaseRate',
  'discountPercent',
  'cgstPercent',
  'sgstPercent',
  'igstPercent',
  'taxableAmount',
  'gstAmount',
  'lineTotal',
] as const;
export type SourceBox = [number, number, number, number, number];
export type PurchaseSourceMap = {
  version: 1;
  pages: Array<{
    page: number;
    width: number;
    height: number;
    rotation: number;
  }>;
  headers: Record<string, { value: string; box: SourceBox }>;
  rows: Array<{
    index: number;
    values: Record<string, string>;
    regions: Record<string, SourceBox>;
  }>;
};

// Join a separate image-only location read to the original extraction locally.
// The locator's transcribed identifiers are used only for alignment, never as values.
export function matchingSourceRows(
  items: any[],
  located: any[],
): Array<number | undefined> {
  const identity = (value: unknown) =>
    String(value ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  const same = (a: any, b: any) =>
    ['batchNumber', 'productName', 'packSize'].every(
      (field) => identity(a?.[field]) === identity(b?.[field]),
    );
  const sequenceMatches =
    items.length === located.length &&
    items.every((item, index) => same(item, located[index]));
  return items.map((item, index) => {
    const batch = identity(item.batchNumber);
    const matches = located.filter(
      (candidate) => batch && identity(candidate.batchNumber) === batch,
    );
    const exact = matches.filter((candidate) => same(item, candidate));
    const uniqueBatch =
      items.filter(
        (candidate) => batch && identity(candidate.batchNumber) === batch,
      ).length === 1;
    const uniqueIdentity =
      items.filter((candidate) => same(item, candidate)).length === 1;
    const match =
      matches.length === 1 && uniqueBatch
        ? matches[0]
        : exact.length === 1 && uniqueIdentity
          ? exact[0]
          : sequenceMatches
            ? located[index]
            : undefined;
    return match ? located.indexOf(match) : undefined;
  });
}

export function alignPurchaseSource(
  raw: any,
  locations: any,
  pages: Array<{ width: number; height: number }>,
): PurchaseSourceMap {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  const located = Array.isArray(locations?.items) ? locations.items : [];
  const indexes = matchingSourceRows(items, located);
  return normalizePurchaseSource(
    {
      ...raw,
      sourceRegions: locations?.sourceRegions,
      pageRotations: locations?.pageRotations,
      items: items.map((item: any, index: number) => ({
        ...item,
        sourceRegions:
          indexes[index] === undefined
            ? undefined
            : located[indexes[index]!]?.sourceRegions,
      })),
    },
    pages,
  );
}
export function normalizePurchaseSource(
  raw: any,
  pages: Array<{ width: number; height: number }>,
): PurchaseSourceMap {
  const box = (value: unknown): SourceBox | undefined => {
    if (
      !Array.isArray(value) ||
      value.length !== 5 ||
      value.some((v) => typeof v !== 'number' || !Number.isFinite(v))
    )
      return;
    const [page, x1, y1, x2, y2] = value;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > pages.length ||
      x1 < 0 ||
      y1 < 0 ||
      x2 > 1000 ||
      y2 > 1000 ||
      x2 <= x1 ||
      y2 <= y1
    )
      return;
    return value as SourceBox;
  };
  const printed = (value: unknown) =>
    (typeof value === 'string' || typeof value === 'number') &&
    String(value).trim() !== '';
  const headers: PurchaseSourceMap['headers'] = {};
  for (const field of SOURCE_HEADER_FIELDS) {
    const region = box(raw?.sourceRegions?.[field]);
    if (region && printed(raw[field]))
      headers[field] = {
        value: String(raw[field]).slice(0, 1000),
        box: region,
      };
  }
  const rows = (Array.isArray(raw?.items) ? raw.items.slice(0, 500) : []).map(
    (item: any, index: number) => {
      const values: Record<string, string> = {},
        regions: Record<string, SourceBox> = {};
      for (const field of SOURCE_LINE_FIELDS) {
        if (printed(item[field]))
          values[field] = String(item[field]).slice(0, 1000);
        const region = box(item?.sourceRegions?.[field]);
        if (region && printed(item[field])) regions[field] = region;
      }
      return { index, values, regions };
    },
  );
  return {
    version: 1,
    pages: pages.map((size, index) => ({
      ...size,
      page: index + 1,
      rotation: [0, 90, 180, 270].includes(raw?.pageRotations?.[index])
        ? raw.pageRotations[index]
        : 0,
    })),
    headers,
    rows,
  };
}

// Bound each annotation request to one original page. Dense multi-page invoices
// otherwise exceed the model deadline even when their financial extraction succeeds.
export async function readPurchaseSourcePages(
  images: string[],
  read: (image: string) => Promise<any>,
) {
  const results: any[] = [];
  for (let offset = 0; offset < images.length; offset += 2) {
    const batch = await Promise.allSettled(
      images.slice(offset, offset + 2).map((image) => read(image)),
    );
    batch.forEach((result, index) => {
      results[offset + index] =
        result.status === 'fulfilled' ? result.value : undefined;
    });
  }
  const totals = new Set([
    'grossAmount',
    'taxableAmount',
    'totalCgst',
    'totalSgst',
    'totalIgst',
    'totalGst',
    'netPayable',
    'rounding',
    'tcsAmount',
  ]);
  const merged: any = { sourceRegions: {}, items: [], pageRotations: [] };
  results.forEach((result, index) => {
    const regions = (values: any) =>
      Object.fromEntries(
        Object.entries(values || {}).flatMap(([field, box]) =>
          Array.isArray(box) && box.length === 5 && box[0] === 1
            ? [[field, [index + 1, ...box.slice(1)]]]
            : [],
        ),
      );
    for (const [field, box] of Object.entries(regions(result?.sourceRegions))) {
      if (!merged.sourceRegions[field] || totals.has(field))
        merged.sourceRegions[field] = box;
    }
    merged.items.push(
      ...(Array.isArray(result?.items) ? result.items : []).map(
        (item: any) => ({
          ...item,
          sourceRegions: regions(item?.sourceRegions),
        }),
      ),
    );
    merged.pageRotations[index] = result?.pageRotations?.[0] || 0;
  });
  return merged;
}
