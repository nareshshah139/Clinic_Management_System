export type SourceBox = [number, number, number, number, number];
export type PurchaseSourceMap = {
  version: 1;
  pages: { page: number; width: number; height: number; rotation: number }[];
  headers: Record<string, { value: string; box: SourceBox }>;
  rows: {
    index: number;
    values: Record<string, string>;
    regions: Record<string, SourceBox>;
  }[];
};
export type SourceTarget = {
  id: string;
  field: string;
  label: string;
  value: string;
  sourceRef?: string;
  row?: Record<string, string>;
};
const normalize = (value: unknown) =>
  String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "");
export function sourceRegion(
  map: PurchaseSourceMap | null,
  target: SourceTarget | undefined,
  documentId: string,
) {
  if (!map || !target) return;
  if (!target.row) return map.headers[target.field];
  let row;
  if (target.sourceRef) {
    const [id, index] = target.sourceRef.split(":");
    if (id !== documentId) return;
    row = map.rows.find((row) => row.index === Number(index));
  } else {
    // Older saved rows have no source reference. Only link an unambiguous match;
    // never use the current array index after rows have been removed/reordered.
    const matches = map.rows.filter(
      (row) =>
        normalize(row.values.batchNumber) ===
          normalize(target.row?.batchNumber) && !!row.values.batchNumber,
    );
    if (matches.length === 1) row = matches[0];
    else {
      const exact = matches.filter(
        (row) =>
          normalize(row.values.productName) ===
            normalize(target.row?.productName) &&
          normalize(row.values.packSize) === normalize(target.row?.packSize),
      );
      if (exact.length === 1) row = exact[0];
    }
  }
  const box = row?.regions[target.field];
  return box ? { box, value: row!.values[target.field] } : undefined;
}
export function sourceValueChanged(captured: string, current: string) {
  const a = captured.replace(/,/g, "").trim(),
    b = current.replace(/,/g, "").trim();
  if (/^-?\d+(\.\d+)?$/.test(a) && /^-?\d+(\.\d+)?$/.test(b))
    return Number(a) !== Number(b);
  return normalize(a) !== normalize(b);
}
export const HEADER_SOURCE_IDS: Record<string, string> = {
  distributorName: "distributor-name",
  distributorGstin: "distributor-gstin",
  distributorDlNo: "distributor-dl",
  distributorAddress: "distributor-address",
  distributorFoodLicense: "food-license",
  invoiceNumber: "invoice-number",
  invoiceDate: "invoice-date",
  goodsReceivedDate: "goods-date",
  billType: "bill-type",
  dueDate: "due-date",
  rounding: "rounding",
  tcsAmount: "tcs-amount",
};
export const LINE_SOURCE_IDS: Record<string, string> = {
  productName: "product",
  manufacturer: "manufacturer",
  packSize: "pack-size",
  packUnitType: "unit",
  hsnCode: "hsn",
  batchNumber: "batch",
  expiryMonth: "expiry-month",
  expiryYear: "expiry-year",
  quantityPurchased: "qty",
  freeQuantity: "free-qty",
  purchaseRate: "rate",
  mrp: "mrp",
  oldMrp: "old-mrp",
  discountPercent: "discount",
  cgstPercent: "cgst",
  sgstPercent: "sgst",
  igstPercent: "igst",
};
export const sourceFieldLabel = (field: string) =>
  (
    ({
      distributorName: "Supplier",
      distributorGstin: "Supplier GSTIN",
      quantityPurchased: "Paid quantity",
      freeQuantity: "Free quantity",
      purchaseRate: "Rate",
      packUnitType: "Stock unit",
      netPayable: "Invoice total",
      hsnCode: "HSN",
      mrp: "MRP",
    }) as Record<string, string>
  )[field] ||
  field.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
