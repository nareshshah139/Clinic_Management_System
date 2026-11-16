"use client";

import { Spinner } from '@/components/ui/spinner';
import { PurchaseDocumentActions } from "@/components/inventory/PurchaseDocumentActions";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSearch,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Truck,
} from "lucide-react";
import {
  PurchaseSourceContext,
  PurchaseSourcePreview,
  SourceFieldLink,
} from "./PurchaseSourcePreview";
import {
  HEADER_SOURCE_IDS,
  LINE_SOURCE_IDS,
  sourceFieldLabel,
  type SourceTarget,
} from "@/lib/purchase-invoice-source";
import {
  PurchaseProductDetails,
  type PurchaseProductCatalog,
} from "./PurchaseProductDetails";
import { PurchaseManualMatchSearch } from "./PurchaseManualMatchSearch";
import { PurchaseSupplierReview } from "./PurchaseSupplierReview";
import { PurchaseOcrChecklist } from "./PurchaseOcrChecklist";
import { PurchaseReviewSummary } from "./PurchaseReviewSummary";
import { PurchaseHelp, PurchaseStatusCue } from "./PurchaseHelp";
import {
  focusPurchaseField,
  groupPurchaseOcrFlags,
  purchaseBlockingIssues,
  purchaseInvoiceStatusLabel,
  purchaseReviewIssue,
  uniquePurchaseReviewIssues,
} from "@/lib/purchase-invoice-review";
import { useDashboardUser } from "@/components/layout/dashboard-user-context";
import {
  preserveInvoiceTotals,
  reportedAmountErrors,
  reportedHeaderAmounts,
  reportedLineAmounts,
} from "@/lib/purchase-invoice-totals";
import { usePurchasePermissions } from "@/hooks/usePurchasePermissions";
import { apiClient } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirmation-provider";

type BillType = "CASH" | "CREDIT" | "";
type SourceType = "MANUAL" | "OCR" | "CSV" | "GMAIL";
type PurchaseStatus =
  | "DRAFT"
  | "OCR_REVIEW_REQUIRED"
  | "RECONCILIATION_FAILED"
  | "REVIEWED"
  | "STOCK_COMMITTED"
  | "CANCELLED";

type HeaderForm = {
  distributorName: string;
  distributorAddress: string;
  distributorGstin: string;
  distributorDlNo: string;
  distributorFoodLicense: string;
  invoiceNumber: string;
  invoiceDate: string;
  goodsReceivedDate: string;
  billType: BillType;
  dueDate: string;
  eWayBillNo: string;
  casesTransport: string;
  lrNo: string;
  salesmanName: string;
  salesmanContact: string;
  buyerCode: string;
  doctorNameOrRegNo: string;
  urcCode: string;
  handwrittenNotes: string;
  source: SourceType;
  tradeDiscount: string;
  specialDiscount: string;
  cashDiscount: string;
  damageAdjustment: string;
  visibilityAmount: string;
  creditDebitAdjustment: string;
  tcsAmount: string;
  rounding: string;
};

type LineForm = {
  productKind?: PurchaseProductCatalog["productKind"];
  ocrSourceRef?: string;
  localId: string;
  serialNumber: string;
  productName: string;
  manufacturer: string;
  packSize: string;
  packUnitType: string;
  hsnCode: string;
  batchNumber: string;
  expiryMonth: string;
  expiryYear: string;
  quantityPurchased: string;
  freeQuantity: string;
  mrp: string;
  oldMrp: string;
  discountPercent: string;
  specialDiscountPercent: string;
  schemeAmount: string;
  purchaseRate: string;
  cgstPercent: string;
  sgstPercent: string;
  igstPercent: string;
  ocrConfidence: string;
  ocrFlags: string;
};

type PurchaseInvoiceItem = {
  ocrSourceRef?: string;
  id?: string;
  lineNumber: number;
  ocrConfidence?: number | null;
  productName: string;
  manufacturer: string;
  packSize: string;
  hsnCode: string;
  batchNumber: string;
  expiryMonth: number;
  expiryYear: number;
  quantityPurchased: number;
  freeQuantity: number;
  mrp: number;
  purchaseRate: number;
  taxableAmount: number;
  gstAmount: number;
  lineTotal: number;
  ocrFlags?: string[];
};

type CommittedItem = {
  lineNumber: number;
  productName: string;
  inventoryItemId: string;
  quantityCommitted: number;
  purchasedQuantity: number;
  freeQuantity: number;
  batchNumber: string;
  expiryDate: string;
};

type OriginalDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  purchaseInvoiceId?: string | null;
};

type PurchaseInvoice = {
  id: string;
  updatedAt?: string;
  distributorName: string;
  distributorGstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  goodsReceivedDate?: string | null;
  billType: BillType;
  dueDate?: string | null;
  status: PurchaseStatus;
  grossAmount: number;
  taxableAmount: number;
  totalGst: number;
  netPayable: number;
  ocrFlags?: string[];
  unresolvedOcrFlags?: number;
  reconciliationIssues?: string[];
  handwrittenNotes?: string | null;
  stockCommitReference?: string | null;
  workflowReceiptId?: string | null;
  stockCommittedAt?: string | null;
  items?: PurchaseInvoiceItem[];
  committedItems?: CommittedItem[];
  documents?: OriginalDocument[];
};

type PurchaseListResponse = {
  data?: PurchaseInvoice[];
  pagination?: {
    total?: number;
    page?: number;
    limit?: number;
    pages?: number;
  };
};

type ExtractedPurchaseLine = Partial<{
  productKind: PurchaseProductCatalog["productKind"];
  ocrSourceRef: string;
  serialNumber: number | string;
  productName: string;
  manufacturer: string;
  packSize: string;
  packUnitType: string;
  hsnCode: string;
  batchNumber: string;
  expiryMonth: number | string;
  expiryYear: number | string;
  quantityPurchased: number | string;
  freeQuantity: number | string;
  mrp: number | string;
  oldMrp: number | string;
  discountPercent: number | string;
  specialDiscountPercent: number | string;
  schemeAmount: number | string;
  purchaseRate: number | string;
  cgstPercent: number | string;
  sgstPercent: number | string;
  igstPercent: number | string;
  ocrConfidence: number | string;
  ocrFlags: string[];
}>;

type ExtractedPurchaseDraft = Partial<HeaderForm> &
  Partial<{
    ocrFlags: string[];
    items: ExtractedPurchaseLine[];
    sourceDocumentId: string;
  }>;

type OcrExtractionResponse = {
  sourceDocument?: OriginalDocument;
  draft?: ExtractedPurchaseDraft;
  masterMatches?: MasterMatchResponse;
  invoice?: PurchaseInvoice | null;
  automation?: {
    status: "NOT_SAVED" | "SAVED_FOR_REVIEW" | "STOCK_COMMITTED" | "DUPLICATE";
    issues: string[];
  };
  extraction?: {
    fileName?: string;
    pageCount?: number;
    includedPageCount?: number;
    flags?: string[];
    extractedAt?: string;
  };
};

type MasterDrug = {
  type?: string;
  productKind?: PurchaseProductCatalog["productKind"];
  requiresPrescription?: boolean | null;
  catalogIssues?: string[];
  id: string;
  name: string;
  price: number;
  manufacturerName: string;
  packSizeLabel: string;
  composition1?: string | null;
  category?: string | null;
  brandName?: string | null; itemCode?: string | null; combinationProduct?: boolean; dispenseLoose?: boolean;
  dosageForm?: string | null;
  strength?: string | null;
};

type MasterCandidate = {
  drug: MasterDrug;
  inInventory?: boolean;
  sameBrand?: boolean;
  mismatches?: string[];
  score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons?: string[];
};

type MasterMatch = {
  matchLabel?: "Same product" | "Possible match" | "Not in inventory" | "Remembered match" | "Review existing item";
  alternatives?: MasterCandidate[];
  sameBrandExists?: boolean;
  automaticMatch?: { drug: MasterDrug; linePatch: MasterConfirmationResponse["linePatch"] };
  lineIndex: number;
  ocr: Record<string, unknown>;
  candidates: MasterCandidate[];
  recommendedAction: "MATCH_EXISTING" | "REVIEW_MATCHES" | "CREATE_NEW";
};

type MasterMatchResponse = {
  matches?: MasterMatch[];
};

type MasterConfirmationResponse = {
  action: "MATCH_EXISTING" | "CREATE_NEW";
  drug: MasterDrug;
  linePatch?: Partial<
    Record<keyof LineForm, string | number | null | undefined>
  >;
  message?: string;
};

type MasterStatus = {
  action: "MATCH_EXISTING" | "CREATE_NEW";
  drug: MasterDrug;
  message?: string;
};

type LineAmounts = {
  gross: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  gst: number;
  total: number;
};

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

const numberFormat = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

function makeLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateInputFromIso(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : toDateInput(parsed);
}

function todayInput() {
  return toDateInput(new Date());
}

function nextExpiryYear() {
  return String(new Date().getFullYear() + 1);
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function numeric(value: string | number | undefined | null) {
  if (value === "" || value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function formString(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function splitFlags(value: string) {
  const flags = purchaseBlockingIssues(
    value
      .split(",")
      .map((flag) => flag.trim())
      .filter(Boolean),
  );
  return flags.length ? flags : undefined;
}

function defaultHeader(): HeaderForm {
  const today = todayInput();
  return {
    distributorName: "",
    distributorAddress: "",
    distributorGstin: "",
    distributorDlNo: "",
    distributorFoodLicense: "",
    invoiceNumber: "",
    invoiceDate: today,
    goodsReceivedDate: today,
    billType: "CASH",
    dueDate: "",
    eWayBillNo: "",
    casesTransport: "",
    lrNo: "",
    salesmanName: "",
    salesmanContact: "",
    buyerCode: "",
    doctorNameOrRegNo: "",
    urcCode: "",
    handwrittenNotes: "",
    source: "MANUAL",
    tradeDiscount: "0",
    specialDiscount: "0",
    cashDiscount: "0",
    damageAdjustment: "0",
    visibilityAmount: "0",
    creditDebitAdjustment: "0",
    tcsAmount: "0",
    rounding: "0",
  };
}

function emptyLine(serialNumber: number): LineForm {
  return {
    localId: makeLocalId(),
    serialNumber: String(serialNumber),
    productName: "",
    manufacturer: "",
    packSize: "",
    packUnitType: "Strip",
    hsnCode: "",
    batchNumber: "",
    expiryMonth: "12",
    expiryYear: nextExpiryYear(),
    quantityPurchased: "1",
    freeQuantity: "0",
    mrp: "0",
    oldMrp: "",
    discountPercent: "0",
    specialDiscountPercent: "0",
    schemeAmount: "0",
    purchaseRate: "0",
    cgstPercent: "6",
    sgstPercent: "6",
    igstPercent: "0",
    ocrConfidence: "",
    ocrFlags: "",
  };
}

function calculateLine(line: LineForm): LineAmounts {
  const purchasedQty = numeric(line.quantityPurchased);
  const rate = numeric(line.purchaseRate);
  const discountPercent = Math.min(
    100,
    Math.max(0, numeric(line.discountPercent)),
  );
  const specialDiscountPercent = Math.min(
    100,
    Math.max(0, numeric(line.specialDiscountPercent)),
  );
  const discountMultiplier = Math.max(
    0,
    1 - (discountPercent + specialDiscountPercent) / 100,
  );
  const gross = money(purchasedQty * rate);
  const taxable = money(
    gross * discountMultiplier - numeric(line.schemeAmount),
  );
  const cgst = money((taxable * numeric(line.cgstPercent)) / 100);
  const sgst = money((taxable * numeric(line.sgstPercent)) / 100);
  const igst = money((taxable * numeric(line.igstPercent)) / 100);
  const gst = money(cgst + sgst + igst);
  return {
    gross,
    taxable,
    cgst,
    sgst,
    igst,
    gst,
    total: money(taxable + gst),
  };
}

function headerDiscountTotal(header: HeaderForm) {
  return money(
    numeric(header.tradeDiscount) +
      numeric(header.specialDiscount) +
      numeric(header.cashDiscount) +
      numeric(header.damageAdjustment) +
      numeric(header.visibilityAmount) +
      numeric(header.creditDebitAdjustment),
  );
}

function calculateTotals(header: HeaderForm, lines: LineForm[]) {
  const lineAmounts = lines.map(calculateLine);
  const taxableAmount = money(
    lineAmounts.reduce((sum, line) => sum + line.taxable, 0),
  );
  const totalCgst = money(
    lineAmounts.reduce((sum, line) => sum + line.cgst, 0),
  );
  const totalSgst = money(
    lineAmounts.reduce((sum, line) => sum + line.sgst, 0),
  );
  const totalIgst = money(
    lineAmounts.reduce((sum, line) => sum + line.igst, 0),
  );
  const totalGst = money(totalCgst + totalSgst + totalIgst);
  const adjustments = headerDiscountTotal(header);
  const grossAmount = money(taxableAmount + adjustments);
  const tcsAmount = money(numeric(header.tcsAmount));
  const rounding = money(numeric(header.rounding));
  const netPayable = money(taxableAmount + totalGst + tcsAmount + rounding);

  return {
    grossAmount,
    taxableAmount,
    totalCgst,
    totalSgst,
    totalIgst,
    totalGst,
    tcsAmount,
    rounding,
    netPayable,
  };
}

/**
 * @cc [owner:nareshshah139,label:calculation] purchase-receipt-margin-basis
 * Quantity summaries MUST use paid plus free quantities in each declared stock unit, without
 * multiplying by pack contents. Indicative margin MUST compare tax-exclusive MRP sales for
 * those received units with taxable line cost; missing MRP MUST remain unknown.
 */
function calculateReceiptSummary(lines: LineForm[]) {
  const paid = lines.reduce(
    (sum, line) => sum + numeric(line.quantityPurchased),
    0,
  );
  const free = lines.reduce((sum, line) => sum + numeric(line.freeQuantity), 0);
  let expectedSales = 0;
  let taxableCost = 0;
  let marginKnown = lines.length > 0;
  for (const line of lines) {
    const quantity =
      Number(line.quantityPurchased) + Number(line.freeQuantity || 0);
    const mrp = Number(line.mrp);
    const gstRate =
      Number(line.cgstPercent || 0) +
      Number(line.sgstPercent || 0) +
      Number(line.igstPercent || 0);
    const cost = calculateLine(line).taxable;
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      Number(line.quantityPurchased) < 0 ||
      Number(line.freeQuantity || 0) < 0 ||
      !Number.isFinite(mrp) ||
      mrp <= 0 ||
      !Number.isFinite(gstRate) ||
      gstRate < 0 ||
      !Number.isFinite(cost) ||
      cost < 0
    ) {
      marginKnown = false;
      continue;
    }
    expectedSales += (quantity * mrp) / (1 + gstRate / 100);
    taxableCost += cost;
  }
  return {
    paid,
    free,
    received: paid + free,
    marginPercent:
      marginKnown && expectedSales > 0
        ? ((expectedSales - taxableCost) / expectedSales) * 100
        : null,
  };
}

function parseDateInput(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function isExpiredLine(line: LineForm) {
  const month = numeric(line.expiryMonth);
  const year = numeric(line.expiryYear);
  if (!Number.isInteger(month) || !Number.isInteger(year)) return false;
  const expiry = new Date(year, month, 0, 23, 59, 59, 999);
  return expiry.getTime() < Date.now();
}

function validateDraft(header: HeaderForm, lines: LineForm[]) {
  const errors: string[] = [];
  const requiredHeader: Array<[keyof HeaderForm, string]> = [
    ["distributorName", "Distributor name"],
    ["distributorGstin", "Distributor GSTIN"],
    ["invoiceNumber", "Invoice number"],
    ["invoiceDate", "Invoice date"],
  ];

  for (const [key, label] of requiredHeader) {
    if (!header[key].trim()) errors.push(`${label} is required`);
  }

  if (!["CASH", "CREDIT"].includes(header.billType))
    errors.push("Select the verified bill type");
  const gstin = header.distributorGstin.trim().toUpperCase();
  if (gstin && !GSTIN_PATTERN.test(gstin)) {
    errors.push("Distributor GSTIN must be a valid 15-character GSTIN");
  }

  const invoiceDate = parseDateInput(header.invoiceDate);
  const goodsDate = header.goodsReceivedDate
    ? parseDateInput(header.goodsReceivedDate)
    : undefined;
  const dueDate = header.dueDate ? parseDateInput(header.dueDate) : undefined;
  if (!invoiceDate) errors.push("Invoice date must be valid");
  if (header.goodsReceivedDate && !goodsDate) {
    errors.push("Goods received date must be valid");
  }
  if (header.dueDate && !dueDate) errors.push("Due date must be valid");
  if (invoiceDate && goodsDate && goodsDate < invoiceDate) {
    errors.push("Goods received date cannot be before invoice date");
  }
  if (invoiceDate && dueDate && dueDate < invoiceDate) {
    errors.push("Due date cannot be before invoice date");
  }
  if (Math.abs(numeric(header.rounding)) > 1) {
    errors.push("Rounding adjustment cannot exceed Rs. 1");
  }

  if (lines.length === 0) {
    errors.push("At least one purchase line is required");
  }

  lines.forEach((line, index) => {
    const prefix = `Line ${index + 1}`;
    const requiredLine: Array<[keyof LineForm, string]> = [
      ["productName", "product"],
    ];
    for (const [key, label] of requiredLine) {
      if (!line[key]?.trim()) errors.push(`${prefix}: ${label} is required`);
    }

    const purchased = numeric(line.quantityPurchased);
    const free = numeric(line.freeQuantity);
    if (!Number.isInteger(purchased) || !Number.isInteger(free)) {
      errors.push(
        `${prefix}: purchase and free quantities must be whole numbers`,
      );
    }
    if (purchased < 0 || free < 0)
      errors.push(`${prefix}: quantities cannot be negative`);
    if (purchased + free <= 0) {
      errors.push(
        `${prefix}: purchased plus free quantity must be greater than zero`,
      );
    }
    if (numeric(line.purchaseRate) < 0 || numeric(line.mrp) < 0) {
      errors.push(`${prefix}: purchase rate and MRP cannot be negative`);
    }
    const expiryMonth = numeric(line.expiryMonth);
    const expiryYear = numeric(line.expiryYear);
    if (
      !Number.isInteger(expiryMonth) ||
      expiryMonth < 1 ||
      expiryMonth > 12 ||
      !Number.isInteger(expiryYear) ||
      expiryYear < 2020 ||
      expiryYear > 2100
    ) {
      errors.push(`${prefix}: expiry month/year is invalid`);
    }
    if (numeric(line.schemeAmount) < 0 || calculateLine(line).taxable < 0)
      errors.push(
        `${prefix}: scheme amount must be nonnegative and cannot exceed discounted line value`,
      );
    const discount = numeric(line.discountPercent);
    const specialDiscount = numeric(line.specialDiscountPercent);
    if (
      discount < 0 ||
      discount > 100 ||
      specialDiscount < 0 ||
      specialDiscount > 100
    ) {
      errors.push(`${prefix}: discount percentages must be between 0 and 100`);
    }
    if (discount + specialDiscount > 100) {
      errors.push(`${prefix}: combined discounts cannot exceed 100%`);
    }
    for (const [field, label] of [
      [line.cgstPercent, "CGST"],
      [line.sgstPercent, "SGST"],
      [line.igstPercent, "IGST"],
    ] as Array<[string, string]>) {
      const rate = numeric(field);
      if (rate < 0 || rate > 100)
        errors.push(`${prefix}: ${label} must be 0 to 100`);
    }
    if (line.ocrConfidence.trim()) {
      const confidence = numeric(line.ocrConfidence);
      if (confidence < 0 || confidence > 1) {
        errors.push(`${prefix}: OCR confidence must be between 0 and 1`);
      }
    }
  });

  return errors;
}

function draftWarnings(lines: LineForm[]) {
  return lines
    .map((line, index) =>
      isExpiredLine(line)
        ? `Line ${index + 1}: expired batches can be saved for correction but cannot be reviewed or committed`
        : undefined,
    )
    .filter(Boolean) as string[];
}

function buildDraftPayload(header: HeaderForm, lines: LineForm[]) {
  const totals = calculateTotals(header, lines);
  const payload: Record<string, unknown> = {
    distributorName: header.distributorName.trim(),
    distributorAddress: optionalString(header.distributorAddress),
    distributorGstin: header.distributorGstin.trim().toUpperCase(),
    distributorDlNo: header.distributorDlNo.trim(),
    distributorFoodLicense: optionalString(header.distributorFoodLicense),
    invoiceNumber: header.invoiceNumber.trim(),
    invoiceDate: header.invoiceDate,
    goodsReceivedDate: optionalString(header.goodsReceivedDate),
    billType: header.billType,
    dueDate:
      header.billType === "CREDIT" ? optionalString(header.dueDate) : undefined,
    eWayBillNo: optionalString(header.eWayBillNo),
    casesTransport: optionalString(header.casesTransport),
    lrNo: optionalString(header.lrNo),
    salesmanName: optionalString(header.salesmanName),
    salesmanContact: optionalString(header.salesmanContact),
    buyerCode: optionalString(header.buyerCode),
    doctorNameOrRegNo: header.doctorNameOrRegNo.trim(),
    urcCode: optionalString(header.urcCode),
    handwrittenNotes: optionalString(header.handwrittenNotes),
    source: header.source,
    grossAmount: totals.grossAmount,
    tradeDiscount: money(numeric(header.tradeDiscount)),
    specialDiscount: money(numeric(header.specialDiscount)),
    cashDiscount: money(numeric(header.cashDiscount)),
    damageAdjustment: money(numeric(header.damageAdjustment)),
    visibilityAmount: money(numeric(header.visibilityAmount)),
    creditDebitAdjustment: money(numeric(header.creditDebitAdjustment)),
    taxableAmount: totals.taxableAmount,
    totalCgst: totals.totalCgst,
    totalSgst: totals.totalSgst,
    totalIgst: totals.totalIgst,
    totalGst: totals.totalGst,
    tcsAmount: totals.tcsAmount,
    rounding: totals.rounding,
    netPayable: totals.netPayable,
    items: lines.map((line, index) => {
      const amounts = calculateLine(line);
      return {
        ocrSourceRef: line.ocrSourceRef,
        serialNumber: Number(line.serialNumber || index + 1),
        productName: line.productName.trim(),
        manufacturer: line.manufacturer.trim(),
        packSize: line.packSize.trim(),
        packUnitType: line.packUnitType.trim(),
        hsnCode: line.hsnCode.trim(),
        batchNumber: line.batchNumber.trim(),
        expiryMonth: Number(line.expiryMonth),
        expiryYear: Number(line.expiryYear),
        quantityPurchased: money(numeric(line.quantityPurchased)),
        freeQuantity: money(numeric(line.freeQuantity)),
        mrp: money(numeric(line.mrp)),
        oldMrp: line.oldMrp.trim() ? money(numeric(line.oldMrp)) : undefined,
        discountPercent: money(numeric(line.discountPercent)),
        specialDiscountPercent: money(numeric(line.specialDiscountPercent)),
        schemeAmount: money(numeric(line.schemeAmount)),
        purchaseRate: money(numeric(line.purchaseRate)),
        taxableAmount: amounts.taxable,
        cgstPercent: money(numeric(line.cgstPercent)),
        sgstPercent: money(numeric(line.sgstPercent)),
        igstPercent: money(numeric(line.igstPercent)),
        gstAmount: amounts.gst,
        lineTotal: amounts.total,
        ocrConfidence: line.ocrConfidence.trim()
          ? numeric(line.ocrConfidence)
          : undefined,
        ocrFlags: splitFlags(line.ocrFlags) || [],
      };
    }),
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) delete payload[key];
  });

  return payload;
}

function lineFromExtracted(
  item: ExtractedPurchaseLine,
  index: number,
): LineForm {
  const base = emptyLine(index + 1);
  return {
    ...base,
    ocrSourceRef: item.ocrSourceRef,
    productKind: item.productKind,
    serialNumber: formString(item.serialNumber, String(index + 1)),
    productName: formString(item.productName),
    manufacturer: formString(item.manufacturer),
    packSize: formString(item.packSize),
    packUnitType: formString(item.packUnitType),
    hsnCode: formString(item.hsnCode),
    batchNumber: formString(item.batchNumber),
    expiryMonth: formString(item.expiryMonth),
    expiryYear: formString(item.expiryYear),
    quantityPurchased: formString(
      item.quantityPurchased,
      base.quantityPurchased,
    ),
    freeQuantity: formString(item.freeQuantity, base.freeQuantity),
    mrp: formString(item.mrp, base.mrp),
    oldMrp: formString(item.oldMrp),
    discountPercent: formString(item.discountPercent, base.discountPercent),
    schemeAmount: formString(item.schemeAmount, "0"),
    specialDiscountPercent: formString(
      item.specialDiscountPercent,
      base.specialDiscountPercent,
    ),
    purchaseRate: formString(item.purchaseRate, base.purchaseRate),
    cgstPercent: formString(item.cgstPercent, base.cgstPercent),
    sgstPercent: formString(item.sgstPercent, base.sgstPercent),
    igstPercent: formString(item.igstPercent, base.igstPercent),
    ocrConfidence: formString(item.ocrConfidence),
    ocrFlags: purchaseBlockingIssues(item.ocrFlags || []).join(", "),
  };
}

function masterActionLabel(action: MasterStatus["action"]) {
  return action === "MATCH_EXISTING" ? "Matched" : "Created";
}

function fieldValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return numberFormat.format(value);
  return String(value);
}

function statusVariant(
  status?: PurchaseStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "STOCK_COMMITTED" || status === "REVIEWED") return "default";
  if (status === "RECONCILIATION_FAILED" || status === "OCR_REVIEW_REQUIRED") {
    return "destructive";
  }
  if (status === "CANCELLED") return "secondary";
  return "outline";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function manualReviewOnlyIssue(raw: string) {
  const issue = raw.replace(/^AUTO:\s*/i, "").trim();
  return (
    /^Automatic intake requires one active saved supplier with matching name and GSTIN\. Select a saved supplier or review manually\.$/.test(
      issue,
    ) ||
    /^Line \d+: OCR confidence must be at least 98% for automatic stock intake; review this line manually\.$/.test(
      issue,
    )
  );
}

function canResumeManualReview(invoice: PurchaseInvoice) {
  const issues = purchaseBlockingIssues(invoice.reconciliationIssues || []);
  return (
    ["DRAFT", "OCR_REVIEW_REQUIRED", "RECONCILIATION_FAILED"].includes(
      invoice.status,
    ) &&
    !invoice.unresolvedOcrFlags &&
    !purchaseBlockingIssues(invoice.ocrFlags || []).length &&
    !invoice.items?.some(
      (item) => purchaseBlockingIssues(item.ocrFlags || []).length,
    ) &&
    issues.length > 0 &&
    issues.every(manualReviewOnlyIssue)
  );
}

/**
 * @cc [owner:nareshshah139] receipt-correction-stock-intent
 * Editable purchases MUST allow selecting a posted receipt; removing an existing link MUST
 * explicitly confirm that posting will add stock. Locked or uncertain invoices cannot edit it.
 */
export function PurchaseInvoiceWorkbench({
  invoiceId,
  receiptId,
  intakeId,
  importedDraft,
  onImported,
  onBack,
  onInvoice,
  draftKey,
  onNew,
}: {
  invoiceId?: string;
  receiptId?: string;
  intakeId?: string;
  importedDraft?: any;
  onImported?: () => void;
  onBack?: () => void;
  onInvoice?: (id: string) => void;
  draftKey?: string;
  onNew?: () => void;
} = {}) {
  const { user } = useDashboardUser();
  const recoveryKey = user
    ? `purchase-intake:${user.branchId}:${user.id}:${invoiceId || receiptId || intakeId || draftKey || "new"}`
    : null;
  return (
    <PurchaseInvoiceEditor
      key={recoveryKey || "anonymous"}
      recoveryKey={recoveryKey}
      invoiceId={invoiceId}
      receiptId={receiptId}
      intakeId={intakeId}
      importedDraft={importedDraft}
      onImported={onImported}
      onBack={onBack}
      onInvoice={onInvoice}
      onNew={onNew}
    />
  );
}

/**
 * @cc [owner:nareshshah139,label:product;target] purchase-entry-field-coverage
 * The purchase editor MUST retain the supplier header, batch receipt quantities and commercial
 * terms needed to reconstruct the printed bill; unsupported printed terms MUST be shown as
 * unresolved instead of discarded.
 * Acceptance: INV-14. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] purchase-required-controls-visible
 * All controls required to resolve the active invoice’s blockers MUST remain discoverable and
 * keyboard reachable, with the next action and persisted stock state visible without expanding
 * unrelated sections.
 * Acceptance: INV-41. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
/**
 * @cc [owner:nareshshah139,label:product] purchase-match-labels-and-fallback
 * Unmatched lines MUST expose manual search and review alternatives without labelling unrelated
 * products as matches. Same-brand records MUST suppress creation; otherwise creation MUST remain
 * available to authorized editors and require explicit confirmation. Suggestions use plain identity
 * labels, not numeric confidence. Editing a name or pack, or removing a line, MUST discard stale
 * suggestions and confirmations before reuse.
 */
/**
 * @cc [owner:nareshshah139,label:product] purchase-check-before-stock
 * Scanning and Save draft MUST retain a reviewable draft without adding stock.
 * Save & add stock MUST require final human confirmation before saving, reviewing and posting.
 * Automatic processing MUST stay an explicit secondary choice. Editing reviewed values MUST
 * clear the final human confirmation.
 */
/**
 * @cc [owner:nareshshah139,label:product] purchase-ocr-summary-current-checks
 * Scan-summary warnings MUST reflect unresolved header checks. Confirmed checks MUST disappear
 * from the summary, including after draft recovery, without erasing the original extraction flags.
 */
function PurchaseInvoiceEditor({
  recoveryKey,
  invoiceId,
  receiptId,
  intakeId,
  importedDraft,
  onImported,
  onBack,
  onInvoice,
  draftKey,
  onNew,
}: {
  recoveryKey: string | null;
  invoiceId?: string;
  receiptId?: string;
  intakeId?: string;
  importedDraft?: any;
  onImported?: () => void;
  onBack?: () => void;
  onInvoice?: (id: string) => void;
  draftKey?: string;
  onNew?: () => void;
}) {
  const confirmAction = useConfirm();
  const { user } = useDashboardUser();
  const {
    permissions: access,
    loading: permissionsLoading,
    error: permissionsError,
  } = usePurchasePermissions(user?.id);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [reviewAccepted, setReviewAccepted] = useState(false);
  const [serverDraft, setServerDraft] = useState<any>(null);
  const [serverDrafts, setServerDrafts] = useState<any[]>([]);
  const [workflowReceiptId, setWorkflowReceiptId] = useState("");
  const [receiptOptions, setReceiptOptions] = useState<any[]>([]);
  const [receiptSearch, setReceiptSearch] = useState("");
  const [reopenRequest, setReopenRequest] = useState<{ invoiceId: string; reason: string } | null>(null);
  const draftRequestKey = useRef("");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [draftServerRevision, setDraftServerRevision] = useState<string | null>(
    null,
  );
  const [revisionChecking, setRevisionChecking] = useState(false);
  const [revisionConflict, setRevisionConflict] = useState<string | null>(null);
  const draftWriteBlocked = revisionChecking || !!revisionConflict;
  const recoveredRevision = useRef<string | null>(null);
  const initializedReceipt = useRef<string | null>(null);
  const recoveredIntake = useRef<string | null>(null);
  const [header, setHeader] = useState<HeaderForm>(() => defaultHeader());
  const [lines, setLines] = useState<LineForm[]>(() => [emptyLine(1)]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalAmounts, setOriginalAmounts] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [sourceDocument, setSourceDocument] = useState<OriginalDocument | null>(
    null,
  );
  const [unlinkedUploads, setUnlinkedUploads] = useState<OriginalDocument[]>(
    [],
  );
  const [uploadListError, setUploadListError] = useState<string | null>(null);
  const saveLock = useRef(false);
  const processLock = useRef(false);
  const postingLock = useRef(false);
  const [manualReviewCandidateId, setManualReviewCandidateId] = useState<
    string | null
  >(null);
  const [unknownStockInvoiceId, setUnknownStockInvoiceId] = useState<
    string | null
  >(null);
  const [refreshingStockStatus, setRefreshingStockStatus] = useState(false);
  const actionFeedbackRef = useRef<HTMLDivElement>(null);
  const focusActionFeedback = () =>
    requestAnimationFrame(() => {
      actionFeedbackRef.current?.focus({ preventScroll: true });
      actionFeedbackRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [headerFlags, setHeaderFlags] = useState("");
  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
  const [additionalSourceIds, setAdditionalSourceIds] = useState<string[]>([]);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrSummary, setOcrSummary] = useState<
    OcrExtractionResponse["extraction"] | null
  >(null);
  const matchRequestVersion = useRef(0);
  const [masterMatches, setMasterMatches] = useState<MasterMatch[]>([]);
  const [masterConfirming, setMasterConfirming] = useState<string | null>(null);
  const [masterRefreshing, setMasterRefreshing] = useState(false);
  const [masterStatuses, setMasterStatuses] = useState<
    Record<number, MasterStatus>
  >({});
  const [recent, setRecent] = useState<PurchaseInvoice[]>([]);
  const [activeInvoice, setActiveInvoice] = useState<PurchaseInvoice | null>(
    null,
  );
  const [selectedSourceId, setSelectedSourceId] = useState("invoice-number");
  const [showIntakeHome, setShowIntakeHome] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const workbenchRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [reviewDate, setReviewDate] = useState(todayInput());
  const [loadingList, setLoadingList] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [importReceivedDate, setImportReceivedDate] = useState(todayInput());
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recoveredInvoiceId = useRef<string | null>(null);
  const draftSelection = useRef({ editingId, hasContent: false });
  draftSelection.current = {
    editingId,
    hasContent:
      !!sourceDocument ||
      !!header.distributorName ||
      !!header.invoiceNumber ||
      lines.some((line) => !!line.productName),
  };

  useEffect(() => {
    if (!recoveryKey) {
      setRecoveryReady(true);
      return;
    }
    try {
      const raw = sessionStorage.getItem(recoveryKey);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved?.version === 1 && saved.header && Array.isArray(saved.lines)) {
        setHeader(saved.header);
        setLines(
          saved.lines.map((line: LineForm) => ({
            ...line,
            ocrFlags: (splitFlags(line.ocrFlags || "") || []).join(", "),
          })),
        );
        setEditingId(saved.editingId || null);
        recoveredInvoiceId.current = saved.editingId || null;
        const revision =
          saved.draftServerRevision || saved.originalAmounts?.updatedAt || null;
        setDraftServerRevision(revision);
        recoveredRevision.current = revision;
        setRevisionChecking(!!saved.editingId);
        initializedReceipt.current = saved.workflowReceiptId || null;
        recoveredIntake.current = saved.serverDraft?.id || null;
        setAdditionalSourceIds(saved.additionalSourceIds || []);
        setWorkflowReceiptId(saved.workflowReceiptId || "");
        setServerDraft(saved.serverDraft || null);
        draftRequestKey.current = saved.draftRequestKey || "";
        setOriginalAmounts(saved.originalAmounts || null);
        setSourceDocument(saved.sourceDocument || null);
        setHeaderFlags((splitFlags(saved.headerFlags || "") || []).join(", "));
        setOcrSummary(saved.ocrSummary || null);
        if (saved.editingId || saved.sourceDocument || saved.header.invoiceNumber || saved.header.distributorName || saved.lines.some((line: LineForm) => !!line.productName)) {
          setNotice("Restored your unfinished purchase draft from this tab. Save draft stores it on the server.");
        }
      }
    } catch {
      setRecoveryError(
        "Draft recovery is unavailable in this browser. Keep this tab open until Save draft succeeds.",
      );
    }
    setRecoveryReady(true);
  }, [recoveryKey]);

  useEffect(() => {
    if (!recoveryKey || !recoveryReady) return;
    try {
      sessionStorage.setItem(
        recoveryKey,
        JSON.stringify({
          version: 1,
          header,
          lines,
          editingId,
          draftServerRevision,
          headerFlags,
          ocrSummary,
          originalAmounts,
          sourceDocument,
          additionalSourceIds,
          workflowReceiptId,
          serverDraft,
          draftRequestKey: draftRequestKey.current,
        }),
      );
    } catch {
      setRecoveryError(
        "Draft recovery is unavailable in this browser. Keep this tab open until Save draft succeeds.",
      );
    }
  }, [
    recoveryKey,
    recoveryReady,
    header,
    lines,
    editingId,
    headerFlags,
    ocrSummary,
    originalAmounts,
    sourceDocument,
    additionalSourceIds,
    workflowReceiptId,
    serverDraft,
    draftServerRevision,
  ]);

  const totals = useMemo(() => calculateTotals(header, lines), [header, lines]);
  const receiptSummary = useMemo(() => calculateReceiptSummary(lines), [lines]);
  const warnings = useMemo(() => draftWarnings(lines), [lines]);
  const loadUnlinkedUploads = useCallback(async () => {
    if (!access.read) return;
    try {
      const documents =
        await apiClient.getUnlinkedPurchaseDocuments<OriginalDocument[]>();
      setUnlinkedUploads(Array.isArray(documents) ? documents : []);
      setUploadListError(null);
    } catch (err) {
      setUploadListError(getErrorMessage(err));
    }
  }, [access.read]);

  useEffect(() => {
    void loadUnlinkedUploads();
  }, [loadUnlinkedUploads]);

  const loadRecent = useCallback(async () => {
    if (!access.read) return;
    setLoadingList(true);
    setError(null);
    try {
      const response =
        await apiClient.getPharmacyPurchaseInvoices<PurchaseListResponse>({
          limit: 8,
          sortBy: "updatedAt",
          sortOrder: "desc",
        });
      const rows = Array.isArray(response?.data) ? response.data : [];
      setRecent(rows);
      setActiveInvoice((current) => {
        if (!current) {
          const draft = draftSelection.current;
          if (draft.editingId)
            return (
              rows.find((invoice) => invoice.id === draft.editingId) ?? null
            );
          return null;
        }
        return rows.find((invoice) => invoice.id === current.id) ?? current;
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingList(false);
    }
  }, [access.read]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    setReviewDate(
      dateInputFromIso(activeInvoice?.goodsReceivedDate) || todayInput(),
    );
  }, [activeInvoice?.goodsReceivedDate, activeInvoice?.id]);

  useEffect(() => {
    // Restore the manual path from known saved automatic-only exceptions. A
    // review still saves the current values and the backend revalidates them.
    setManualReviewCandidateId(
      activeInvoice &&
        editingId === activeInvoice.id &&
        canResumeManualReview(activeInvoice)
        ? activeInvoice.id
        : null,
    );
  }, [activeInvoice?.id, editingId]);

  const updateHeader = (key: keyof HeaderForm, value: string) => {
    if (["distributorName", "distributorGstin"].includes(key)) {
      matchRequestVersion.current++;
      setLines(current => current.map((line, index) => {
        const match = masterMatches.find(row => row.lineIndex === index);
        return masterStatuses[index]?.message === "Remembered match" && match ? { ...line,
          productName: formString(match.ocr.productName), packSize: formString(match.ocr.packSize),
          manufacturer: formString(match.ocr.manufacturer), packUnitType: formString(match.ocr.packUnitType),
        } : line;
      }));
      setMasterMatches([]); setMasterStatuses({});
    }
    setManualReviewCandidateId(null);
    setReviewAccepted(false);
    if (key === "goodsReceivedDate") setReviewDate(value);
    setHeader((current) => {
      const next = { ...current, [key]: value };
      if (key === "billType" && value === "CASH") next.dueDate = "";
      return next;
    });
  };

  const updateLine = (localId: string, key: keyof LineForm, value: string) => {
    setManualReviewCandidateId(null);
    setReviewAccepted(false);
    matchRequestVersion.current++;
    if (key === "productKind") setMasterStatuses({});
    if (["productName", "packSize", "packUnitType"].includes(key)) {
      setMasterMatches([]);
      setMasterStatuses({});
    }
    setLines((current) =>
      current.map((line) =>
        line.localId === localId ? { ...line, [key]: value } : line,
      ),
    );
  };

  const addLine = () => {
    setManualReviewCandidateId(null);
    setReviewAccepted(false);
    setLines((current) => [...current, emptyLine(current.length + 1)]);
  };

  const removeLine = (localId: string) => {
    matchRequestVersion.current++;
    setManualReviewCandidateId(null);
    if (lines.length <= 1) return;
    const removedIndex = lines.findIndex((line) => line.localId === localId);
    setMasterMatches([]);
    setMasterStatuses({});
    setOriginalAmounts((current) =>
      current && Array.isArray(current.items)
        ? {
            ...current,
            itemsChanged: true,
            items: current.items.filter((_, index) => index !== removedIndex),
          }
        : current,
    );
    setLines((current) => {
      if (current.length <= 1) return current;
      return current
        .filter((line) => line.localId !== localId)
        .map((line, index) => ({ ...line, serialNumber: String(index + 1) }));
    });
  };

  const updateReportedAmount = (
    key: string,
    value: string,
    lineIndex?: number,
  ) => {
    setManualReviewCandidateId(null);
    setReviewAccepted(false);
    setOriginalAmounts((current) => {
      if (!current) return current;
      if (lineIndex === undefined) return { ...current, [key]: value };
      if (!Array.isArray(current.items)) return current;
      return {
        ...current,
        items: current.items.map((item, index) =>
          index === lineIndex ? { ...item, [key]: value } : item,
        ),
      };
    });
  };

  const resetDraft = () => {
    matchRequestVersion.current++;
    setShowIntakeHome(false);
    setManualEntry(false);
    setManualReviewCandidateId(null);
    setActiveInvoice(null);
    setUnknownStockInvoiceId(null);
    setEditingId(null);
    setDraftServerRevision(null);
    recoveredRevision.current = null;
    recoveredInvoiceId.current = null;
    setRevisionConflict(null);
    setRevisionChecking(false);
    initializedReceipt.current = null;
    recoveredIntake.current = null;
    setServerDraft(null);
    draftRequestKey.current = "";
    setWorkflowReceiptId("");
    setReviewAccepted(false);
    setOriginalAmounts(null);
    setSourceDocument(null);
    setHeaderFlags("");
    setHeader(defaultHeader());
    setLines([emptyLine(1)]);
    setOcrFile(null);
    setOcrFiles([]);
    setAdditionalSourceIds([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setOcrSummary(null);
    setMasterMatches([]);
    setMasterConfirming(null);
    setMasterRefreshing(false);
    setMasterStatuses({});
    setValidationErrors([]);
    setNotice(null);
    setError(null);
  };

  const applyExtractedDraft = (
    draft: ExtractedPurchaseDraft,
    extraction?: OcrExtractionResponse["extraction"],
    matches?: MasterMatchResponse,
  ) => {
    matchRequestVersion.current++;
    const defaults = defaultHeader();
    setShowIntakeHome(false);
    setManualReviewCandidateId(null);
    setActiveInvoice(null);
    setUnknownStockInvoiceId(null);
    setOriginalAmounts(draft as Record<string, unknown>);
    setEditingId(null);
    setDraftServerRevision(null);
    setRevisionConflict(null);
    setRevisionChecking(false);
    recoveredInvoiceId.current = null;
    recoveredRevision.current = null;
    setHeaderFlags(
      purchaseBlockingIssues(draft.ocrFlags || extraction?.flags || []).join(
        ", ",
      ),
    );
    setHeader({
      ...defaults,
      distributorName: formString(draft.distributorName),
      distributorAddress: formString(draft.distributorAddress),
      distributorGstin: formString(draft.distributorGstin).toUpperCase(),
      distributorDlNo: formString(draft.distributorDlNo),
      distributorFoodLicense: formString(draft.distributorFoodLicense),
      invoiceNumber: formString(draft.invoiceNumber),
      invoiceDate: formString(draft.invoiceDate, defaults.invoiceDate),
      goodsReceivedDate: formString(
        draft.goodsReceivedDate,
        defaults.goodsReceivedDate,
      ),
      billType: (draft.ocrFlags || []).some((f) =>
        /uncertain.*bill.?type/i.test(f),
      )
        ? ""
        : draft.billType === "CREDIT"
          ? "CREDIT"
          : draft.billType === "CASH"
            ? "CASH"
            : "",
      dueDate: formString(draft.dueDate),
      eWayBillNo: formString(draft.eWayBillNo),
      casesTransport: formString(draft.casesTransport),
      lrNo: formString(draft.lrNo),
      salesmanName: formString(draft.salesmanName),
      salesmanContact: formString(draft.salesmanContact),
      buyerCode: formString(draft.buyerCode),
      doctorNameOrRegNo: formString(draft.doctorNameOrRegNo),
      urcCode: formString(draft.urcCode),
      handwrittenNotes: formString(draft.handwrittenNotes),
      source: (["MANUAL", "OCR", "CSV", "GMAIL"].includes(String(draft.source))
        ? draft.source
        : "OCR") as SourceType,
      tradeDiscount: formString(draft.tradeDiscount, defaults.tradeDiscount),
      specialDiscount: formString(
        draft.specialDiscount,
        defaults.specialDiscount,
      ),
      cashDiscount: formString(draft.cashDiscount, defaults.cashDiscount),
      damageAdjustment: formString(
        draft.damageAdjustment,
        defaults.damageAdjustment,
      ),
      visibilityAmount: formString(
        draft.visibilityAmount,
        defaults.visibilityAmount,
      ),
      creditDebitAdjustment: formString(
        draft.creditDebitAdjustment,
        defaults.creditDebitAdjustment,
      ),
      tcsAmount: formString(draft.tcsAmount, defaults.tcsAmount),
      rounding: formString(draft.rounding, defaults.rounding),
    });

    const extractedLines = Array.isArray(draft.items) ? draft.items : [];
    setLines(
      extractedLines.length
        ? extractedLines.map(lineFromExtracted)
        : [emptyLine(1)],
    );
    setOcrSummary(extraction || null);
    acceptMasterMatches(matches?.matches || []);
    setValidationErrors([]);
  };

  const linePayload = (line: LineForm) => {
    const payload = buildDraftPayload(header, [line]);
    const item = Array.isArray(payload.items) ? payload.items[0] : undefined;
    return { ...item as Record<string, unknown>, productKind: line.productKind || undefined };
  };

  const applyLinePatch = (
    lineIndex: number,
    patch?: MasterConfirmationResponse["linePatch"],
  ) => {
    if (!patch) return;
    setManualReviewCandidateId(null);
    setReviewAccepted(false);
    setLines((current) =>
      current.map((line, index) => {
        if (index !== lineIndex) return line;
        return {
          ...line,
          productName:
            patch.productName !== undefined
              ? formString(patch.productName)
              : line.productName,
          manufacturer:
            patch.manufacturer !== undefined
              ? formString(patch.manufacturer)
              : line.manufacturer,
          packSize:
            patch.packSize !== undefined
              ? formString(patch.packSize)
              : line.packSize,
          packUnitType:
            patch.packUnitType !== undefined
              ? formString(patch.packUnitType)
              : line.packUnitType,
          mrp: patch.mrp !== undefined ? formString(patch.mrp) : line.mrp,
          purchaseRate:
            patch.purchaseRate !== undefined
              ? formString(patch.purchaseRate)
              : line.purchaseRate,
        };
      }),
    );
  };

  /**
   * @cc [owner:nareshshah139,label:product] purchase-remembered-selection
   * Only server-validated supplier memory MAY preselect a product. Ordinary suggestions MUST wait
   * for confirmation. Applying memory MUST keep invoice quantities and prices unchanged.
   */
  const acceptMasterMatches = (matches: MasterMatch[]) => {
    setMasterMatches(matches);
    const statuses: Record<number, MasterStatus> = {};
    for (const match of matches) {
      if (!match.automaticMatch) continue;
      applyLinePatch(match.lineIndex, match.automaticMatch.linePatch);
      statuses[match.lineIndex] = { action: "MATCH_EXISTING", drug: match.automaticMatch.drug, message: "Remembered match" };
    }
    setMasterStatuses(statuses);
  };

  const refreshMasterMatches = async () => {
    if (!access.create) return;
    const requestVersion = ++matchRequestVersion.current;
    setMasterRefreshing(true);
    setError(null);
    try {
      const response =
        await apiClient.suggestPharmacyPurchaseMasterMatches<MasterMatchResponse>(
          {
            items: lines.map(linePayload),
            distributorName: header.distributorName, distributorGstin: header.distributorGstin,
          },
        );
      if (requestVersion !== matchRequestVersion.current) return;
      acceptMasterMatches(response.matches || []);
      setNotice(
        `Refreshed drug master suggestions for ${lines.length} line${lines.length === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setMasterRefreshing(false);
    }
  };

  /**
   * @cc [owner:nareshshah139,label:product] purchase-mismatch-warning-before-retry
   * A server-reported product mismatch MUST display the different-products warning and both
   * identities before retrying with acknowledgement. Cancelling MUST leave the line unchanged.
   * If the line changes while awaiting confirmation, no creation or acknowledged retry may run.
   */
  const confirmMasterLine = async (
    match: MasterMatch,
    action: "MATCH_EXISTING" | "CREATE_NEW",
    candidate?: MasterCandidate,
    catalog?: PurchaseProductCatalog,
  ): Promise<string | undefined> => {
    if (!access.create) return;
    const line = lines[match.lineIndex];
    if (!line) {
      setError(
        "The purchase line was removed. Refresh drug master suggestions.",
      );
      return;
    }

    if (action === "CREATE_NEW" && !access.catalogDetails)
      return "Product details are not available yet. Reload after the update completes.";
    const confirmVersion = matchRequestVersion.current;
    if (action === "CREATE_NEW") {
      if (match.sameBrandExists) return "A same-brand item already exists. Select an existing item.";
      if (!(await confirmAction({ title: "Create inventory item?", description: `Create a new inventory item?\n${line.productName} · ${line.packSize}\nConfirm that this product is not already saved.`, confirmLabel: "Create item", variant: "default" }))) return "New item was not created.";
    }
    if (confirmVersion !== matchRequestVersion.current) return "The line changed. Refresh matches and try again.";
    const key = `${match.lineIndex}:${action}`;
    setMasterConfirming(key);
    setNotice(null);
    setError(null);
    try {
      const payload = {
            action,
            creationConfirmed: action === "CREATE_NEW" ? true : undefined,
            distributorName: header.distributorName, distributorGstin: header.distributorGstin,
            drugId: candidate?.drug.id,
            catalog,
            item: linePayload(line),
          };
      let response: MasterConfirmationResponse;
      try {
        response = await apiClient.confirmPharmacyPurchaseMaster<MasterConfirmationResponse>(payload);
      } catch (err) {
        const conflict = err as { status?: number; body?: { code?: string; mismatches?: string[] } };
        if (action !== "MATCH_EXISTING" || conflict.status !== 409 || conflict.body?.code !== "PURCHASE_PRODUCT_MISMATCH") throw err;
        if (confirmVersion !== matchRequestVersion.current) return "The line changed. Refresh matches and try again.";
        const confirmed = (await confirmAction({ title: "Confirm different products?", description: [
          "These look like different products. Confirm anyway?",
          `Invoice: ${line.productName} · ${line.packSize}${line.productKind ? ` · ${line.productKind}` : ""}`,
          `Saved product: ${candidate?.drug.name} · ${candidate?.drug.packSizeLabel} · ${candidate?.drug.productKind || candidate?.drug.type || "Kind not recorded"}`,
          ...(conflict.body.mismatches || []),
        ].join("\n"), confirmLabel: "Confirm match", variant: "default" }));
        if (!confirmed) return;
        if (confirmVersion !== matchRequestVersion.current) return "The line changed. Refresh matches and try again.";
        response = await apiClient.confirmPharmacyPurchaseMaster<MasterConfirmationResponse>({ ...payload, mismatchAcknowledged: true });
      }
      if (confirmVersion !== matchRequestVersion.current) return "The line changed. Refresh matches to use the saved confirmation.";
      applyLinePatch(match.lineIndex, response.linePatch);
      setMasterStatuses((current) => ({
        ...current,
        [match.lineIndex]: {
          action: response.action,
          drug: response.drug,
          message: response.message,
        },
      }));
      setNotice(
        response.message ||
          `${masterActionLabel(response.action)} ${response.drug.name} in the drug master.`,
      );
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      return message;
    } finally {
      setMasterConfirming(null);
    }
  };

  const saveProductDetails = async (
    drug: MasterDrug,
    catalog: PurchaseProductCatalog,
  ): Promise<string | undefined> => {
    if (!access.editProduct)
      return "Product-edit permission is required to correct this saved product.";
    setMasterConfirming(`edit:${drug.id}`);
    setError(null);
    try {
      const updated = await apiClient.patch<MasterDrug>(
        `/pharmacy/purchase-invoices/master-records/${drug.id}`,
        catalog,
      );
      setMasterMatches((current) =>
        current.map((match) => ({
          ...match,
          candidates: match.candidates.map((candidate) =>
            candidate.drug.id === drug.id
              ? { ...candidate, drug: updated }
              : candidate,
          ),
        })),
      );
      setMasterStatuses((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, status]) => [
            key,
            status.drug.id === drug.id ? { ...status, drug: updated } : status,
          ]),
        ),
      );
      setManualReviewCandidateId(null);
      setNotice(
        `Saved product details for ${updated.name}. Choose Save & Process to check the invoice again.`,
      );
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      return message;
    } finally {
      setMasterConfirming(null);
    }
  };

  const applyAutomationResult = (
    data: Pick<OcrExtractionResponse, "invoice" | "automation">,
  ) => {
    const invoice =
      data.invoice && data.automation?.status === "SAVED_FOR_REVIEW"
        ? {
            ...data.invoice,
            reconciliationIssues: [
              ...(data.invoice.reconciliationIssues || []),
              ...data.automation.issues,
            ],
          }
        : data.invoice;
    if (invoice) {
      editSavedDraft(invoice);
      setUnlinkedUploads((current) =>
        current.filter(
          (document) =>
            !invoice.documents?.some((linked) => linked.id === document.id),
        ),
      );
      setRecent((current) =>
        [invoice, ...current.filter((row) => row.id !== invoice.id)].slice(
          0,
          8,
        ),
      );
    } else {
      setActiveInvoice(null);
    }
    const outcome = data.automation;
    if (outcome?.status === "STOCK_COMMITTED") {
      setNotice(
        invoice?.workflowReceiptId
          ? `Invoice ${invoice.invoiceNumber} posted against its inward receipt. Stock was already received and has not been added again.`
          : `Invoice ${invoice?.invoiceNumber} saved and stock added automatically.`,
      );
      window.dispatchEvent(new CustomEvent("pharmacy-dashboard-refresh"));
    } else if (outcome?.status === "DUPLICATE") {
      setNotice(
        `Invoice ${invoice?.invoiceNumber} is already saved. Opened the existing invoice; its values and stock were not changed.`,
      );
    } else if (outcome?.status === "SAVED_FOR_REVIEW") {
      setNotice(
        `Invoice ${invoice?.invoiceNumber} saved for correction. Stock has not been added.`,
      );
      setError(null);
    } else {
      setNotice(null);
      setError(
        `Invoice was not saved. ${outcome?.issues.join(" ") || "Save the extracted draft after checking the required fields."}`,
      );
    }
  };

  /**
   * @cc [owner:nareshshah139,label:product;target] purchase-process-visible-outcome
   * Save & Process MUST save the current corrections and then show the server-confirmed outcome for
   * that invoice: stock added, saved with actionable blockers, or status could not be confirmed.
   * Acceptance: INV-16. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  const processSavedInvoice = async () => {
    if (!access.automate || processLock.current || postingLock.current || unknownStockInvoiceId || draftWriteBlocked) return;
    processLock.current = true;
    setProcessing(true);
    let targetInvoiceId = activeInvoice?.id;
    setManualReviewCandidateId(null);
    setError(null);
    setNotice(null);
    try {
      if (reviewAccepted && canReview && access.commit) {
        await saveAndPostInvoice();
        return;
      }
      let savedForReview: PurchaseInvoice | undefined;
      if (
        !activeInvoice ||
        (editingId === activeInvoice.id &&
          !["REVIEWED", "STOCK_COMMITTED", "CANCELLED"].includes(
            activeInvoice.status,
          ))
      ) {
        const saved = await saveDraft();
        if (!saved) return;
        targetInvoiceId = saved.id;
        savedForReview = saved;
      }
      if (!targetInvoiceId) return;
      const result =
        await apiClient.processPharmacyPurchaseInvoice<OcrExtractionResponse>(
          targetInvoiceId,
        );
      if (
        result.invoice?.id !== targetInvoiceId ||
        !result.automation?.status
      ) {
        throw new Error(
          "Processing did not return a confirmed invoice status. Checking the saved record.",
        );
      }
      applyAutomationResult(result);
      // A clean human-corrected draft may fail stricter automatic checks (such
      // as 98% OCR confidence). Keep manual review reachable after that result.
      // reviewInvoice saves again and the backend revalidates before reviewing.
      if (
        result.automation?.status === "SAVED_FOR_REVIEW" &&
        result.invoice?.id === savedForReview?.id &&
        purchaseBlockingIssues(result.automation.issues || []).every(
          manualReviewOnlyIssue,
        ) &&
        savedForReview?.status === "DRAFT" &&
        !savedForReview.unresolvedOcrFlags &&
        !savedForReview.reconciliationIssues?.length
      ) {
        setManualReviewCandidateId(savedForReview.id);
        setNotice(
          `Invoice ${savedForReview.invoiceNumber} saved. Automatic intake needs a human review; check the original, confirm the review, then choose Save & add stock.`,
        );
      }
    } catch (err) {
      setError(getErrorMessage(err));
      if (targetInvoiceId) await refreshStockStatus(targetInvoiceId);
    } finally {
      processLock.current = false;
      setProcessing(false);
      focusActionFeedback();
    }
  };

  const extractFromInvoiceFile = async (automate = false) => {
    if (!access.create || (automate && !access.automate)) return;
    if (!ocrFile) {
      setError("Choose an invoice PDF or image first");
      return;
    }

    setExtracting(true);
    setNotice(null);
    setError(null);
    try {
      const form = new FormData();
      if (ocrFiles.length > 1)
        ocrFiles.forEach((file) => form.append("files", file));
      else form.append("file", ocrFile);
      if (automate && importReceivedDate)
        form.append("goodsReceivedDate", importReceivedDate);
      const response = await fetch(
        `/api/pharmacy/purchase-invoices/ocr/${ocrFiles.length > 1 ? "pages/" : ""}${automate ? "import" : "extract"}`,
        {
          method: "POST",
          body: form,
          credentials: "include",
        },
      );

      if (response.status === 401 && typeof window !== "undefined") {
        const next = window.location.pathname + window.location.search;
        window.location.href = `/login?next=${encodeURIComponent(next)}`;
        return;
      }

      if (!response.ok) {
        let message = `Invoice OCR failed (${response.status})`;
        try {
          const body = await response.json();
          if (body?.sourceDocument) {
            resetDraft();
            setSourceDocument(body.sourceDocument);
            setNotice(
              "Original file saved. Enter the invoice details manually or retry the upload.",
            );
          }
          message = body?.message || message;
        } catch {
          try {
            const text = await response.text();
            if (text) message = text;
          } catch {}
        }
        throw new Error(message);
      }

      const data = (await response.json()) as OcrExtractionResponse;
      const draft = data?.draft;
      if (!draft) {
        throw new Error("No purchase invoice draft was extracted");
      }

      applyExtractedDraft(draft, data.extraction, data.masterMatches);
      if (!automate) {
        setHeader(current => ({ ...current, goodsReceivedDate: importReceivedDate }));
        setReviewDate(importReceivedDate);
        setShowIntakeHome(false);
      }
      setSourceDocument(data.sourceDocument || null);
      setAdditionalSourceIds(
        (data as any).sourceDocuments?.map((d: any) => d.id) || [],
      );
      if (automate) {
        applyAutomationResult(data);
        setOcrSummary(data.extraction || null);
        return;
      }
      const flagCount =
        (draft.ocrFlags?.length || 0) +
        (draft.items || []).reduce(
          (sum, item) => sum + (item.ocrFlags?.length || 0),
          0,
        );
      setNotice(
        `Extracted ${draft.items?.length || 0} line item${
          draft.items?.length === 1 ? "" : "s"
        } from ${ocrFile.name}. Review the draft before saving${
          flagCount
            ? `; ${flagCount} OCR flag${flagCount === 1 ? "" : "s"} need attention`
            : ""
        }.`,
      );
    } catch (err) {
      setError(
        getErrorMessage(err) ||
          "Invoice OCR failed. Try another file or enter manually.",
      );
    } finally {
      setExtracting(false);
      void loadUnlinkedUploads();
    }
  };

  const saveDraft = async () => {
    if (!access.create || saveLock.current || extracting || unknownStockInvoiceId || draftWriteBlocked)
      return;
    setNotice(null);
    setError(null);
    const errors = [
      ...validateDraft(header, lines),
      ...reportedAmountErrors(originalAmounts),
    ];
    setValidationErrors(errors);
    if (errors.length > 0) {
      focusActionFeedback();
      return;
    }

    saveLock.current = true;
    setSaving(true);
    try {
      const payload = {
        ...preserveInvoiceTotals(
          buildDraftPayload(header, lines),
          originalAmounts,
        ),
        expectedUpdatedAt: editingId
          ? draftServerRevision || undefined
          : undefined,
        ocrFlags: splitFlags(headerFlags) || [],
        sourceDocumentId: sourceDocument?.id,
        sourceDocumentIds: additionalSourceIds,
        workflowReceiptId: workflowReceiptId || undefined,
      };
      const created = editingId
        ? await apiClient.updatePharmacyPurchaseInvoiceDraft<PurchaseInvoice>(
            editingId,
            payload,
          )
        : await apiClient.createPharmacyPurchaseInvoiceDraft<PurchaseInvoice>(
            payload,
          );
      if (serverDraft) {
        try {
          await apiClient.post("/inventory/workspace/intake", {
            ...serverDraft,
            invoiceId: created.id,
          });
          setServerDraft(null);
        } catch {}
      }
      setEditingId(created.id);
      setDraftServerRevision(created.updatedAt || null);
      setRecent((current) =>
        [created, ...current.filter((row) => row.id !== created.id)].slice(
          0,
          8,
        ),
      );
      setActiveInvoice(created);
      setOriginalAmounts(created as unknown as Record<string, unknown>);
      setSourceDocument(created.documents?.[0] || sourceDocument);
      void loadUnlinkedUploads();
      setNotice(
        created.status === "STOCK_COMMITTED" || created.stockCommittedAt
          ? `Invoice ${created.invoiceNumber}: ${purchaseInvoiceStatusLabel(created)}.`
          : `Invoice ${created.invoiceNumber} saved. Stock not added. Check the bill before adding stock.`,
      );
      return created;
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      if (
        editingId &&
        /changed|stale|no longer an editable draft/i.test(message)
      ) {
        setRevisionConflict(
          "The saved invoice changed while you were editing. Your corrections are retained. Reload the saved invoice before saving or adding stock; reloading replaces the local fields.",
        );
      }
    } finally {
      saveLock.current = false;
      setSaving(false);
      focusActionFeedback();
    }
  };

  const reviewInvoice = async () => {
    if (!access.review || !activeInvoice || reviewing || draftWriteBlocked)
      return;
    setNotice(null);
    setError(null);
    setReviewing(true);
    try {
      let invoiceToReview = activeInvoice;
      if (
        access.create &&
        editingId === activeInvoice.id &&
        !["REVIEWED", "STOCK_COMMITTED", "CANCELLED"].includes(
          activeInvoice.status,
        )
      ) {
        const saved = await saveDraft();
        if (!saved) return;
        invoiceToReview = saved;
      }
      const reviewed =
        await apiClient.reviewPharmacyPurchaseInvoice<PurchaseInvoice>(
          invoiceToReview.id,
          {
            goodsReceivedDate: reviewDate,
            handwrittenNotes: invoiceToReview.handwrittenNotes || undefined,
          },
        );
      setActiveInvoice(reviewed);
      setNotice(`Purchase invoice ${reviewed.invoiceNumber} marked reviewed.`);
      await loadRecent();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setReviewing(false);
      focusActionFeedback();
    }
  };

  /**
   * @cc [owner:nareshshah139] reviewed-bill-recovery-ui
   * Reopening MUST submit the saved revision and operator reason; an uncertain response MUST
   * refresh server status before permitting further edits or stock commit.
   */
  const reopenReviewed = async () => {
    if (!activeInvoice || busy || stockStatusUnknown || !access.create || !access.review) return;
    if (reopenRequest?.invoiceId !== activeInvoice.id) return;
    const reason = reopenRequest.reason.trim();
    if (!reason) {
      setError("Enter a reason for reopening this bill.");
      return;
    }
    setReviewing(true);
    setError(null);
    try {
      const reopened = await apiClient.post<PurchaseInvoice>(`/pharmacy/purchase-invoices/${activeInvoice.id}/reopen`, {
        reason: reason.trim(), expectedUpdatedAt: activeInvoice.updatedAt,
      });
      editSavedDraft(reopened);
      setReopenRequest(null);
      setNotice("Bill reopened. Correct its details, then review it again before posting.");
      await loadRecent();
    } catch (err) {
      setError(getErrorMessage(err));
      await refreshStockStatus(activeInvoice.id);
    } finally {
      setReviewing(false);
      focusActionFeedback();
    }
  };

  const refreshStockStatus = async (invoiceId: string) => {
    setRefreshingStockStatus(true);
    setUnknownStockInvoiceId(invoiceId);
    try {
      if (!access.read) throw new Error("Invoice read permission is required");
      const invoice =
        await apiClient.getPharmacyPurchaseInvoiceById<PurchaseInvoice>(
          invoiceId,
        );
      if (invoice?.id !== invoiceId || !invoice.status)
        throw new Error("Invoice status was not returned");
      setActiveInvoice(invoice);
      setManualReviewCandidateId(
        editingId === invoice.id && canResumeManualReview(invoice)
          ? invoice.id
          : null,
      );
      setRecent((current) =>
        [invoice, ...current.filter((row) => row.id !== invoice.id)].slice(
          0,
          8,
        ),
      );
      setUnknownStockInvoiceId(null);
      if (invoice.status === "STOCK_COMMITTED") {
        setError(null);
        setNotice(
          invoice.workflowReceiptId
            ? `Bill ${invoice.invoiceNumber} posted. Stock received earlier · 0 added again.`
            : `Stock added for ${invoice.invoiceNumber}. The saved record confirms the operation completed.`,
        );
        window.dispatchEvent(new CustomEvent("pharmacy-dashboard-refresh"));
      }
    } catch {
      setNotice(null);
      // A lost response can hide a successful stock commit. Keep the outcome
      // unknown until a read succeeds; never infer it from stale editor state.
    } finally {
      setRefreshingStockStatus(false);
    }
  };

  const editSavedDraft = (invoice: PurchaseInvoice) => {
    applyExtractedDraft({
      ...invoice,
      invoiceDate: dateInputFromIso(invoice.invoiceDate),
      goodsReceivedDate: dateInputFromIso(invoice.goodsReceivedDate),
      dueDate: dateInputFromIso(invoice.dueDate),
      ocrFlags: invoice.ocrFlags || [],
    } as ExtractedPurchaseDraft);
    setEditingId(invoice.id);
    setDraftServerRevision(invoice.updatedAt || null);
    setRevisionConflict(null);
    setRevisionChecking(false);
    setWorkflowReceiptId((invoice as any).workflowReceiptId || "");
    setReviewAccepted(false);
    setSourceDocument(invoice.documents?.[0] || null);
    setAdditionalSourceIds(invoice.documents?.map((d) => d.id) || []);
    setActiveInvoice(invoice);
    setManualReviewCandidateId(
      canResumeManualReview(invoice) ? invoice.id : null,
    );
    setNotice(null);
  };

  const saveIncompleteDraft = async () => {
    if (!access.create || saving || postingLock.current || unknownStockInvoiceId || draftWriteBlocked) return;
    setSaving(true);
    setError(null);
    try {
      if (!draftRequestKey.current)
        draftRequestKey.current = Array.from(
          crypto.getRandomValues(new Uint8Array(16)),
          (v) => v.toString(16).padStart(2, "0"),
        ).join("");
      const saved = await apiClient.post<any>("/inventory/workspace/intake", {
        requestKey: serverDraft?.requestKey || draftRequestKey.current,
        version: serverDraft?.version,
        documentIds: [
          ...new Set([
            ...(sourceDocument ? [sourceDocument.id] : []),
            ...additionalSourceIds,
          ]),
        ],
        channel: header.source,
        payload: {
          header,
          lines,
          editingId,
          draftServerRevision,
          headerFlags,
          ocrSummary,
          originalAmounts,
          sourceDocument,
          additionalSourceIds,
          workflowReceiptId,
        },
      });
      setServerDraft(saved);
      setNotice(
        "Unfinished invoice saved to the server. Missing fields are allowed; stock has not changed.",
      );
      setServerDrafts(
        await apiClient.get<any[]>("/inventory/workspace/intake"),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
      focusActionFeedback();
    }
  };
  const restoreServerDraft = (saved: any) => {
    const p = saved.payload;
    const revision =
      p.draftServerRevision || p.originalAmounts?.updatedAt || null;
    setDraftServerRevision(revision);
    setRevisionConflict(null);
    if (p.editingId) {
      setRevisionChecking(true);
      apiClient
        .getPharmacyPurchaseInvoiceById<PurchaseInvoice>(p.editingId)
        .then((invoice) => acceptRecoveredInvoice(invoice, revision))
        .catch(() =>
          setRevisionConflict(
            "The saved invoice version could not be checked. Your local fields are retained; reload the saved invoice before saving or adding stock.",
          ),
        )
        .finally(() => setRevisionChecking(false));
    }
    setHeader(p.header);
    setLines(p.lines);
    setEditingId(p.editingId || null);
    setHeaderFlags(p.headerFlags || "");
    setOcrSummary(p.ocrSummary || null);
    setOriginalAmounts(p.originalAmounts || null);
    setSourceDocument(p.sourceDocument || null);
    setWorkflowReceiptId(p.workflowReceiptId || "");
    setAdditionalSourceIds(p.additionalSourceIds || saved.documentIds || []);
    setServerDraft(saved);
    draftRequestKey.current = saved.requestKey;
    setShowIntakeHome(false);
    setNotice(
      "Restored the saved invoice intake. Complete the highlighted checks before adding stock.",
    );
  };
  useEffect(() => {
    if (!access.read || !recoveryReady) return;
    apiClient
      .get<any[]>("/inventory/workspace/intake")
      .then((rows) => {
        setServerDrafts(rows);
        if (intakeId && recoveredIntake.current !== intakeId) {
          const saved = rows.find((d) => d.id === intakeId);
          if (saved) restoreServerDraft(saved);
        }
      })
      .catch(() => {});
  }, [access.read, intakeId, recoveryReady]);
  /**
   * @cc [owner:nareshshah139,label:state] purchase-recovery-server-revision
   * Recovered fields MUST retain the revision they were edited from. A changed or unknown
   * revision MUST block saving, reviewing and posting while retaining local fields until an
   * explicit Reload saved invoice succeeds. Background list reads MUST NOT advance this baseline.
   */
  const acceptRecoveredInvoice = (
    invoice: PurchaseInvoice,
    revision: string | null,
  ) => {
    setActiveInvoice(invoice);
    setManualReviewCandidateId(
      canResumeManualReview(invoice) ? invoice.id : null,
    );
    if (!revision || !invoice.updatedAt || revision !== invoice.updatedAt) {
      setRevisionConflict(
        "Your local corrections are retained, but the saved invoice changed or its earlier version cannot be verified. Reload the saved invoice before saving or adding stock. Reloading replaces these local fields.",
      );
      setReviewAccepted(false);
    } else setRevisionConflict(null);
  };
  const reloadSavedInvoice = async () => {
    const id = editingId || invoiceId || activeInvoice?.id;
    if (!id) return;
    setRevisionChecking(true);
    try {
      const invoice =
        await apiClient.getPharmacyPurchaseInvoiceById<PurchaseInvoice>(id);
      if (invoice?.id !== id || !invoice.updatedAt)
        throw new Error(
          "The saved invoice version could not be checked. Try reloading again.",
        );
      editSavedDraft(invoice);
    } catch (err) {
      setRevisionConflict(getErrorMessage(err));
    } finally {
      setRevisionChecking(false);
    }
  };
  useEffect(() => {
    if (!access.read || !recoveryReady) return;
    const id = invoiceId || recoveredInvoiceId.current;
    if (!id) return;
    let cancelled = false;
    setRevisionChecking(true);
    apiClient
      .getPharmacyPurchaseInvoiceById<PurchaseInvoice>(id)
      .then((invoice) => {
        if (cancelled) return;
        if (invoice?.id !== id)
          throw new Error("The saved invoice was not returned.");
        if (recoveredInvoiceId.current === invoice.id)
          acceptRecoveredInvoice(invoice, recoveredRevision.current);
        else editSavedDraft(invoice);
        setShowIntakeHome(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err));
        setRevisionConflict(
          "The saved invoice version could not be checked. Your local fields are retained; reload the saved invoice before saving or adding stock.",
        );
      })
      .finally(() => {
        if (!cancelled) setRevisionChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [access.read, invoiceId, recoveryReady]);
  useEffect(() => {
    if (
      !receiptId ||
      !access.create ||
      !recoveryReady ||
      initializedReceipt.current === receiptId
    )
      return;
    let cancelled = false;
    Promise.all([
      apiClient.get<any>(`/inventory/workspace/documents/${receiptId}`),
      apiClient.get<any[]>("/inventory/workspace/suppliers"),
    ])
      .then(([receipt, suppliers]) => {
        if (cancelled) return;
        const supplier = suppliers.find((s) => s.id === receipt.supplierId);
        resetDraft();
        initializedReceipt.current = receipt.id;
        setWorkflowReceiptId(receipt.id);
        setHeader((h) => ({
          ...h,
          distributorName: supplier?.name || "",
          distributorGstin: receipt.supplierGstin || "",
          goodsReceivedDate: receipt.payload.date || todayInput(),
        }));
        setLines(
          receipt.payload.lines.map((l: any, i: number) => ({
            ...emptyLine(i + 1),
            productName: l.name,
            batchNumber: l.batchNumber,
            packUnitType: l.unit,
            packSize: "",
            quantityPurchased: String(l.quantity),
            freeQuantity: String(l.freeQuantity || 0),
            purchaseRate: String(l.unitPrice || 0),
            mrp: String(l.mrp || 0),
            expiryMonth: l.expiryDate
              ? String(new Date(l.expiryDate).getMonth() + 1)
              : "",
            expiryYear: l.expiryDate
              ? String(new Date(l.expiryDate).getFullYear())
              : "",
          })),
        );
        setNotice(
          "This bill is linked to a received inward challan. Verify pack details, supplier bill number and totals. Matching stock will not be received again.",
        );
      })
      .catch((err) => setError(getErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [access.create, receiptId, recoveryReady]);
  /**
   * @cc [owner:nareshshah139,label:product] purchase-explicit-posting
   * Explicit posting MUST save new or editable corrections, review the saved invoice and commit
   * once after human confirmation. Reviewed invoices MUST resume at commit without saving again.
   * Unresolved checks, historical holds, missing permissions or stale revisions MUST block posting.
   */
  /**
   * @cc [owner:nareshshah139,label:state] purchase-posting-exact-id-recovery
   * An uncertain review or commit MUST refresh the ID returned by the successful save. Failed
   * refresh MUST block writes; only confirmed STOCK_COMMITTED may report success or refresh stock.
   */
  const saveAndPostInvoice = async () => {
    if (postingLock.current || saveLock.current || unknownStockInvoiceId || draftWriteBlocked || !access.commit) return;
    const alreadyReviewed = activeInvoice?.status === "REVIEWED";
    if (alreadyReviewed) {
      postingLock.current = true;
      try {
        if (!(await confirmAction({ title: "Post purchase invoice?", description: activeInvoice.workflowReceiptId
          ? `Post bill ${activeInvoice.invoiceNumber} against the earlier stock receipt? No stock will be added again.`
          : `Add stock for purchase invoice ${activeInvoice.invoiceNumber}? This updates branch inventory.`, confirmLabel: "Post invoice", variant: "default" }))) return;
        const current = confirmationState.current;
        if (current.activeInvoice !== activeInvoice || current.draftWriteBlocked || current.unknownStockInvoiceId || !current.canCommit) {
          setError("The purchase changed while confirmation was open. Review it again before posting.");
          return;
        }
      } finally {
        postingLock.current = false;
      }
    } else if (!access.create || !access.review || !reviewAccepted || !reviewDate || historicalStockHold ||
      splitFlags(headerFlags)?.length || lines.some(line => splitFlags(line.ocrFlags)?.length) ||
      (activeInvoice && (!editingSelectedInvoice || ["STOCK_COMMITTED", "CANCELLED"].includes(activeInvoice.status)))) {
      return;
    }
    postingLock.current = true;
    let phase: { kind: "saving" } | { kind: "reviewing" | "committing"; invoiceId: string } = { kind: "saving" };
    setReviewing(!alreadyReviewed);
    setNotice(null);
    setError(null);
    try {
      let invoice = alreadyReviewed ? activeInvoice : await saveDraft();
      if (!invoice) return;
      if (!alreadyReviewed && invoice.status !== "STOCK_COMMITTED") {
        const issues = purchaseBlockingIssues(invoice.reconciliationIssues || []);
        if (invoice.unresolvedOcrFlags || purchaseBlockingIssues(invoice.ocrFlags || []).length ||
          invoice.items?.some(item => purchaseBlockingIssues(item.ocrFlags || []).length) ||
          !((invoice.status === "DRAFT" && issues.length === 0) || canResumeManualReview(invoice))) {
          setError(`Invoice saved. Stock not added. ${issues.join(" ") || "Resolve the remaining invoice checks before adding stock."}`);
          return;
        }
        phase = { kind: "reviewing", invoiceId: invoice.id };
        const reviewed = await apiClient.reviewPharmacyPurchaseInvoice<PurchaseInvoice>(invoice.id, {
          goodsReceivedDate: reviewDate,
          handwrittenNotes: invoice.handwrittenNotes || undefined,
        });
        if (reviewed?.id !== invoice.id || reviewed.status !== "REVIEWED")
          throw new Error("Review did not return a confirmed outcome. Checking the saved record.");
        invoice = reviewed;
        setActiveInvoice(reviewed);
        setDraftServerRevision(reviewed.updatedAt || null);
      }
      phase = { kind: "committing", invoiceId: invoice.id };
      setReviewing(false);
      setCommitting(true);
      const committed = invoice.status === "STOCK_COMMITTED"
        ? invoice
        : await apiClient.commitPharmacyPurchaseInvoiceStock<PurchaseInvoice>(invoice.id);
      if (committed?.id !== invoice.id || committed.status !== "STOCK_COMMITTED")
        throw new Error("Stock commit did not return a confirmed outcome. Checking the saved record.");
      setActiveInvoice(committed);
      setNotice(committed.workflowReceiptId
        ? `Bill ${committed.invoiceNumber} posted. Stock received earlier · 0 added again.`
        : `Stock added for ${committed.invoiceNumber}${committed.stockCommitReference ? ` (${committed.stockCommitReference})` : ""}.`);
      await loadRecent();
      window.dispatchEvent(new CustomEvent("pharmacy-dashboard-refresh"));
    } catch (err) {
      setError(getErrorMessage(err));
      if (phase.kind !== "saving") await refreshStockStatus(phase.invoiceId);
    } finally {
      postingLock.current = false;
      setReviewing(false);
      setCommitting(false);
      focusActionFeedback();
    }
  };

  useEffect(() => {
    if (importedDraft?.draft) {
      resetDraft();
      applyExtractedDraft(importedDraft.draft);
      setSourceDocument(importedDraft.sourceDocument || null);
      setAdditionalSourceIds(importedDraft.draft.sourceDocumentIds || []);
      setNotice(
        "Imported draft ready for review. The original is saved; stock has not changed.",
      );
      onImported?.();
    }
  }, [importedDraft]);
  const editingSelectedInvoice =
    !!activeInvoice && editingId === activeInvoice.id;
  const hasDraftContent = !!sourceDocument || !!activeInvoice || !!header.invoiceNumber || !!header.distributorName || lines.some(line => !!line.productName);
  const confirmationState = useRef({ activeInvoice, workflowReceiptId, draftWriteBlocked, unknownStockInvoiceId, canCommit: access.commit });
  confirmationState.current = { activeInvoice, workflowReceiptId, draftWriteBlocked, unknownStockInvoiceId, canCommit: access.commit };

  const busy =
    saving ||
    extracting ||
    processing ||
    reviewing ||
    committing ||
    refreshingStockStatus ||
    savingSupplier ||
    masterConfirming !== null ||
    masterRefreshing;
  const stockStatusUnknown =
    !!activeInvoice && unknownStockInvoiceId === activeInvoice.id;
  const stockAdded =
    activeInvoice?.status === "STOCK_COMMITTED" ||
    !!activeInvoice?.stockCommittedAt;
  const stockReceivedEarlier =
    stockAdded && !!(activeInvoice?.workflowReceiptId || workflowReceiptId);
  const committedLabel = stockReceivedEarlier
    ? "Invoice posted · stock received earlier"
    : "Stock added";
  const activeIssues = purchaseBlockingIssues(
    activeInvoice?.reconciliationIssues || [],
  );
  const activeOcrFlags = activeInvoice?.unresolvedOcrFlags || 0;
  const historicalStockHold = activeIssues.some(
    (issue) => purchaseReviewIssue(issue).category === "historical",
  );
  const awaitingManualReview =
    !!activeInvoice && manualReviewCandidateId === activeInvoice.id;
  const canReview =
    access.review &&
    !!activeInvoice &&
    !stockStatusUnknown &&
    !draftWriteBlocked &&
    ((activeInvoice.status === "DRAFT" && activeIssues.length === 0) ||
      (awaitingManualReview &&
        ["DRAFT", "OCR_REVIEW_REQUIRED", "RECONCILIATION_FAILED"].includes(
          activeInvoice.status,
        ))) &&
    activeOcrFlags === 0 &&
    (editingId !== activeInvoice.id ||
      (!splitFlags(headerFlags)?.length &&
        lines.every((line) => !splitFlags(line.ocrFlags)?.length))) &&
    !!reviewDate;
  const canCommit =
    access.commit &&
    activeInvoice?.status === "REVIEWED" &&
    !stockStatusUnknown &&
    !draftWriteBlocked;
  const savedFormLocked =
    !access.create ||
    stockAdded ||
    stockStatusUnknown ||
    (!!editingId &&
      activeInvoice?.id === editingId &&
      ["REVIEWED", "STOCK_COMMITTED", "CANCELLED"].includes(
        activeInvoice.status,
      ));
  const navigateIntake = (showHome: boolean) => {
    setShowIntakeHome(showHome);
    headingRef.current?.focus({ preventScroll: true });
    workbenchRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "start",
    });
  };

  const viewingSavedInvoice = !!activeInvoice && !editingSelectedInvoice;
  const previewDocument = viewingSavedInvoice
    ? activeInvoice.documents?.[0]
    : sourceDocument || activeInvoice?.documents?.[0];
  const sourceHeader = viewingSavedInvoice
    ? {
        ...activeInvoice,
        invoiceDate: dateInputFromIso(activeInvoice.invoiceDate),
        goodsReceivedDate: dateInputFromIso(activeInvoice.goodsReceivedDate),
        dueDate: dateInputFromIso(activeInvoice.dueDate),
      }
    : header;
  const sourceAmounts = viewingSavedInvoice ? activeInvoice : originalAmounts;
  const sourceLines = viewingSavedInvoice
    ? (activeInvoice.items || []).map((item, index) => ({
        ...lineFromExtracted(item as unknown as ExtractedPurchaseLine, index),
        localId: `saved-source-${item.id || index}`,
      }))
    : lines;
  useEffect(() => setSelectedSourceId("invoice-number"), [previewDocument?.id]);
  const showSourcePreview =
    !!previewDocument &&
    (previewDocument.mimeType === "application/pdf" ||
      previewDocument.mimeType.startsWith("image/")) &&
    !!access.read &&
    !!access.sourceHighlights &&
    !showIntakeHome;
  const sourceTargets: SourceTarget[] = [
    ...Object.entries(HEADER_SOURCE_IDS).map(([field, id]) => ({
      id,
      field,
      label: sourceFieldLabel(field),
      value: String(
        (sourceHeader as unknown as Record<string, unknown>)[field] ?? "",
      ),
    })),
    ...[
      "grossAmount",
      "taxableAmount",
      "totalCgst",
      "totalSgst",
      "totalIgst",
      "totalGst",
      "netPayable",
    ].map((field) => ({
      id: `invoice-reported-${field}`,
      field,
      label: sourceFieldLabel(field),
      value: String(
        (sourceAmounts as Record<string, unknown> | null)?.[field] ?? "",
      ),
    })),
    ...sourceLines.flatMap((line, index) => [
      ...Object.entries(LINE_SOURCE_IDS).map(([field, suffix]) => ({
        id: `${line.localId}-${suffix}`,
        field,
        label: `Line ${index + 1}: ${sourceFieldLabel(field)}`,
        value: String((line as unknown as Record<string, string>)[field] || ""),
        sourceRef: line.ocrSourceRef,
        row: line as unknown as Record<string, string>,
      })),
      ...["taxableAmount", "gstAmount", "lineTotal"].map((field) => ({
        id: `${line.localId}-reported-${field}`,
        field,
        label: `Line ${index + 1}: ${sourceFieldLabel(field)}`,
        value: String(
          (sourceAmounts?.items as Record<string, unknown>[] | undefined)?.[
            index
          ]?.[field] ?? "",
        ),
        sourceRef: line.ocrSourceRef,
        row: line as unknown as Record<string, string>,
      })),
    ]),
  ];
  const selectSource = (id: string, focusField = false) => {
    setSelectedSourceId(id);
    const target = document.getElementById(id);
    if (focusField && target) {
      for (
        let parent = target.parentElement;
        parent;
        parent = parent.parentElement
      )
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      target.scrollIntoView?.({ block: "center", behavior: "instant" });
      target.focus({ preventScroll: true });
    } else if (window.innerWidth < 1280)
      document
        .getElementById("purchase-source-preview")
        ?.scrollIntoView?.({ block: "start", behavior: "instant" });
  };

  const showSupplierReview =
    !activeInvoice ||
    (!stockAdded && !["REVIEWED", "CANCELLED"].includes(activeInvoice.status));
  const editingChecks =
    !savedFormLocked && (!activeInvoice || editingSelectedInvoice);
  const currentHeaderFlags = splitFlags(headerFlags) || [];
  const currentLineFlags = lines.map((line) => splitFlags(line.ocrFlags) || []);
  const coveredOcrKeys = new Set([
    ...(editingChecks
      ? currentHeaderFlags.map((flag) => purchaseReviewIssue(flag).key)
      : []),
    ...(editingChecks
      ? currentLineFlags.flatMap((flags, index) =>
          flags.map((flag) => purchaseReviewIssue(flag, index).key),
        )
      : []),
    ...(editingSelectedInvoice
      ? (activeInvoice?.ocrFlags || []).map(
          (flag) => purchaseReviewIssue(flag).key,
        )
      : []),
    ...(editingSelectedInvoice
      ? (activeInvoice?.items || []).flatMap((item, index) =>
          (item.ocrFlags || []).map(
            (flag) => purchaseReviewIssue(flag, index).key,
          ),
        )
      : []),
  ]);
  const missingStockFields = editingChecks
    ? [
        ...(!header.distributorDlNo.trim()
          ? ["distributorDlNo is required before review"]
          : []),
        ...(!header.goodsReceivedDate
          ? ["goodsReceivedDate is required before review"]
          : []),
        ...(header.billType === "CREDIT" && !header.dueDate
          ? ["dueDate is required before review"]
          : []),
        ...lines.flatMap((line, index) =>
          (
            [
              "productName",
              "packSize",
              "packUnitType",
              "hsnCode",
              "batchNumber",
            ] as const
          )
            .filter((field) => !line[field].trim())
            .map(
              (field) =>
                `Line ${index + 1}: ${field} is required before review`,
            ),
        ),
      ]
    : [];
  const otherReviewIssues = uniquePurchaseReviewIssues([
    ...activeIssues,
    ...missingStockFields,
  ]).filter((issue) => !coveredOcrKeys.has(issue.key));
  const manualIssueKeys = new Set(
    activeIssues
      .filter(manualReviewOnlyIssue)
      .map((issue) => purchaseReviewIssue(issue).key),
  );
  const correctionIssues = otherReviewIssues.filter(
    (issue) =>
      !manualIssueKeys.has(issue.key) && issue.key !== "header:supplier-match",
  );
  const manualConfidenceLines = otherReviewIssues
    .filter(
      (issue) =>
        manualIssueKeys.has(issue.key) && issue.key.endsWith(":confidence"),
    )
    .map((issue) => (issue.lineIndex ?? 0) + 1);
  const confirmationCount = editingChecks
    ? groupPurchaseOcrFlags(currentHeaderFlags).length +
      currentLineFlags.reduce(
        (sum, flags, index) => sum + groupPurchaseOcrFlags(flags, index).length,
        0,
      )
    : activeOcrFlags;
  const postingLabel = workflowReceiptId ? "Save & post bill" : "Save & add stock";
  const reviewChecklist = (
    <section
      id="purchase-review-checklist"
      aria-labelledby="purchase-review-checklist-title"
      className="space-y-4 border-t pt-4"
    >
      <div>
        <h4 id="purchase-review-checklist-title" className="font-semibold">
          Check before adding stock
        </h4>
        <div className="mt-1 flex items-center gap-1">
          <PurchaseStatusCue tone={confirmationCount || otherReviewIssues.length ? "warning" : "success"}>
            {editingChecks ? `${confirmationCount + correctionIssues.length + manualConfidenceLines.length} checks to finish` : "Open Review issues to continue"}
          </PurchaseStatusCue>
          <PurchaseHelp label="Review checks">Compare flagged values with the original, correct them if needed, then confirm each check. Corrections and field confirmations are separate from the final stock review.</PurchaseHelp>
        </div>
      </div>
      <PurchaseSupplierReview
        name={
          !activeInvoice || editingSelectedInvoice
            ? header.distributorName
            : activeInvoice.distributorName
        }
        gstNumber={
          !activeInvoice || editingSelectedInvoice
            ? header.distributorGstin
            : activeInvoice.distributorGstin
        }
        canLoad={access.create || access.read}
        canSave={!!access.saveSupplier}
        readOnly={!editingChecks}
        disabled={busy}
        nextAction={postingLabel}
        onChange={(distributorName, distributorGstin) => {
          setReviewAccepted(false);
          setManualReviewCandidateId(null);
          setHeader((current) => ({
            ...current,
            distributorName,
            distributorGstin,
          }));
        }}
        onSaved={() => setManualReviewCandidateId(null)}
        onBusy={setSavingSupplier}
        onEdit={
          activeInvoice && access.create && !savedFormLocked
            ? () => editSavedDraft(activeInvoice)
            : undefined
        }
      />
      {editingChecks && (
        <>
          <PurchaseOcrChecklist
            flags={currentHeaderFlags}
            values={header}
            disabled={busy}
            onResolveMany={(flags) => {
              setManualReviewCandidateId(null);
              setHeaderFlags((current) =>
                (splitFlags(current) || [])
                  .filter((value) => !flags.includes(value))
                  .join(", "),
              );
            }}
            onResolve={(flag) => {
              setManualReviewCandidateId(null);
              setHeaderFlags((current) =>
                (splitFlags(current) || [])
                  .filter((value) => value !== flag)
                  .join(", "),
              );
            }}
          />
          {lines.map((line, index) => (
            <PurchaseOcrChecklist
              key={line.localId}
              flags={currentLineFlags[index]}
              lineIndex={index}
              lineId={line.localId}
              values={line}
              disabled={busy}
              onResolveMany={(flags) =>
                updateLine(
                  line.localId,
                  "ocrFlags",
                  currentLineFlags[index]
                    .filter((value) => !flags.includes(value))
                    .join(", "),
                )
              }
              onResolve={(flag) =>
                updateLine(
                  line.localId,
                  "ocrFlags",
                  currentLineFlags[index]
                    .filter((value) => value !== flag)
                    .join(", "),
                )
              }
            />
          ))}
        </>
      )}
      {correctionIssues.length > 0 && (
        <ul className="divide-y text-sm">
          {correctionIssues.map((issue) => {
            const lineId =
              issue.lineIndex === undefined
                ? undefined
                : lines[issue.lineIndex]?.localId;
            const target =
              issue.target &&
              (lineId && issue.field
                ? `${lineId}-${issue.target}`
                : issue.target);
            return (
              <li key={issue.key} className="space-y-2 py-3 first:pt-0">
                <div className="flex items-start gap-1"><PurchaseStatusCue tone="warning">{issue.message}</PurchaseStatusCue><PurchaseHelp label={`${issue.lineIndex === undefined ? '' : `Line ${issue.lineIndex + 1} `}${issue.label} correction`}>This check needs a correction and cannot be dismissed with a confirmation.</PurchaseHelp></div>
                {issue.category === "historical" ? <p className="max-w-prose text-muted-foreground">{issue.help}</p> : <details><summary className="cursor-pointer text-muted-foreground">How to fix</summary><p className="mt-2 max-w-prose text-muted-foreground">{issue.help}</p></details>}
                {editingChecks && target && (
                  <a
                    className="inline-block underline underline-offset-4"
                    onClick={() => focusPurchaseField(target)}
                    href={`#${target}`}
                  >
                    Go to {issue.label}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {manualConfidenceLines.length > 0 && (
        <div className="space-y-2 border-t pt-3 text-sm">
          <PurchaseStatusCue tone="warning">Manual review: line{manualConfidenceLines.length === 1 ? "" : "s"} {manualConfidenceLines.join(", ")}</PurchaseStatusCue>
          <p className="text-muted-foreground">Check these products against the bill, confirm the invoice, then choose {postingLabel}.</p>
          <details><summary className="cursor-pointer">Why a check is needed</summary>
          {manualConfidenceLines.map((lineNumber) => {
            const confidence = activeInvoice?.items?.[lineNumber - 1]?.ocrConfidence;
            return typeof confidence === "number" && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
              ? <p key={lineNumber}>Line {lineNumber}: {numberFormat.format(Math.floor(confidence * 10000) / 100)}% reading confidence; automatic intake requires at least 98%.</p>
              : null;
          })}
          <p className="max-w-prose text-muted-foreground">Check these lines against the original. Retrying keeps the same confidence score. Resolve the corrections above, then confirm the final review to continue.</p>
          </details>
        </div>
      )}
      {editingChecks &&
        confirmationCount === 0 &&
        otherReviewIssues.length === 0 && (
          <PurchaseStatusCue tone="success">No outstanding OCR checks</PurchaseStatusCue>
        )}
    </section>
  );

  const postingBlocker = stockStatusUnknown
    ? "Refresh stock status before continuing."
    : draftWriteBlocked
      ? "Reload the saved invoice to resolve the revision conflict before posting."
      : historicalStockHold
        ? "An inventory administrator must check this bill against opening stock before posting."
        : !access.commit || !access.review || !access.create
          ? "Saving and adding stock requires create, review and stock permissions."
          : confirmationCount > 0
            ? "Finish the highlighted invoice checks before adding stock."
            : !reviewDate
              ? "Enter the goods received date before adding stock."
              : null;
  const invoiceActions = (
    <section aria-label="Invoice actions" className="sticky bottom-0 z-20 space-y-2 border-t bg-background py-3">
      {!stockAdded && activeInvoice?.status !== "CANCELLED" && activeInvoice?.status !== "REVIEWED" &&
        !postingBlocker && (!activeInvoice || editingSelectedInvoice) && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={reviewAccepted} disabled={busy}
            onChange={e => setReviewAccepted(e.target.checked)} />
          <span>I verified the invoice against the original. {workflowReceiptId ? "I approve posting this bill against the earlier stock receipt." : "I approve adding the received quantities to stock."}</span>
          <PurchaseHelp label="Final stock review">Verify the supplier, product matches, batches, expiry, paid/free quantities and totals against the original before confirming.</PurchaseHelp>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {stockStatusUnknown && activeInvoice ? (
          <Button variant="outline" onClick={() => refreshStockStatus(activeInvoice.id)} disabled={busy}>Refresh stock status</Button>
        ) : stockAdded || activeInvoice?.status === "CANCELLED" ? null : activeInvoice?.status === "REVIEWED" ? (
          <>
            <Button onClick={saveAndPostInvoice} disabled={!canCommit || busy}>
              {committing && <Spinner className="h-4 w-4 " />}
              {activeInvoice.workflowReceiptId ? "Post bill" : "Add stock"}
            </Button>
            {access.create && access.review && (
              reopenRequest?.invoiceId === activeInvoice.id ? (
                <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void reopenReviewed(); }}>
                  <label className="grid gap-1 text-sm">Reason for reopening
                    <Input autoFocus required disabled={busy} value={reopenRequest.reason} onChange={event => setReopenRequest({ invoiceId: activeInvoice.id, reason: event.target.value })} />
                  </label>
                  <Button type="submit" variant="outline" disabled={busy}>Reopen bill</Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => setReopenRequest(null)}>Cancel</Button>
                </form>
              ) : <Button variant="outline" onClick={() => setReopenRequest({ invoiceId: activeInvoice.id, reason: "" })} disabled={busy}>Reopen for correction</Button>
            )}
          </>
        ) : canReview && !access.commit ? (
          <Button onClick={reviewInvoice} disabled={busy}>Mark Reviewed</Button>
        ) : !activeInvoice || editingSelectedInvoice ? (
          <Button onClick={saveAndPostInvoice} disabled={busy || !!postingBlocker || !reviewAccepted} aria-describedby="purchase-posting-guidance">
            {busy && <Spinner className="h-4 w-4 " />}
            {postingLabel}
          </Button>
        ) : (
          <Button disabled={!access.create || busy} onClick={() => editSavedDraft(activeInvoice)}>Review issues</Button>
        )}
        {!stockAdded && !savedFormLocked && (!activeInvoice || editingSelectedInvoice) && (
          <>
            <Button variant="outline" disabled={busy || draftWriteBlocked} onClick={() =>
              validateDraft(header, lines).length || reportedAmountErrors(originalAmounts).length
                ? saveIncompleteDraft() : saveDraft()}>Save draft</Button>
            {access.automate && <details className="relative text-sm">
              <summary className="cursor-pointer py-2">More options</summary>
              <div className="absolute bottom-full left-0 w-64 space-y-2 rounded-md border bg-background p-3">
                <p className="text-muted-foreground">Automatic processing saves corrections and adds stock if every check passes.</p>
                <Button variant="outline" disabled={busy || draftWriteBlocked} onClick={processSavedInvoice}>{saving ? "Saving…" : processing ? "Checking invoice…" : "Save & Process"}</Button>
              </div>
            </details>}
          </>
        )}
        <span className="text-sm text-muted-foreground">{stockAdded ? committedLabel : workflowReceiptId ? "Stock received earlier · 0 added again" : activeInvoice ? purchaseInvoiceStatusLabel(activeInvoice) : "Not saved · stock not added"}</span>
      </div>
      {!stockAdded && activeInvoice?.status !== "CANCELLED" && activeInvoice?.status !== "REVIEWED" && (
        <p id="purchase-posting-guidance" className="text-sm text-muted-foreground">
          {postingBlocker || (!reviewAccepted ? "Confirm the invoice against the original to enable posting." : workflowReceiptId ? "Posts the bill against stock received earlier. No stock is added again." : "Saves the invoice and adds the received quantities after review.")}{" "}
          {!!postingBlocker && <a className="underline underline-offset-4" href="#purchase-review-checklist">Review checks</a>}
        </p>
      )}
    </section>
  );

  const recentInvoices = (
    <details className="rounded-lg border p-4" open={showIntakeHome}>
      <summary className="cursor-pointer text-sm font-medium">
        Recent invoices ({recent.length})
      </summary>
      <div className="py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardDescription>Latest branch purchase invoices</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadRecent}
            disabled={loadingList}
            aria-label="Refresh purchase invoices"
          >
            {loadingList ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No purchase invoices found
            </p>
          ) : (
            recent.map((invoice) => (
              <button
                type="button"
                key={invoice.id}
                disabled={busy}
                onClick={() => {
                  if (activeInvoice?.id === invoice.id) {
                    navigateIntake(false);
                    return;
                  }
                  if (onInvoice) onInvoice(invoice.id);
                  else {
                    editSavedDraft(invoice);
                    navigateIntake(false);
                  }
                }}
                className={`min-w-0 w-full rounded-md border p-3 text-left transition-colors ${
                  activeInvoice?.id === invoice.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {invoice.invoiceNumber}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
                      {invoice.distributorName}
                    </p>
                  </div>
                  <Badge variant={statusVariant(invoice.status)}>
                    {purchaseInvoiceStatusLabel(invoice)}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDate(invoice.invoiceDate)}</span>
                  <span>{currency.format(invoice.netPayable || 0)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </details>
  );

  return (
    <PurchaseSourceContext.Provider
      value={{
        enabled: showSourcePreview,
        fieldIds: sourceTargets.map((target) => target.id),
        selectedId: selectedSourceId,
        select: (id) => selectSource(id),
      }}
    >
      <div
        onFocusCapture={(event) => {
          const id = (event.target as HTMLElement).id;
          if (sourceTargets.some((target) => target.id === id))
            setSelectedSourceId(id);
        }}
        ref={workbenchRef}
        className="space-y-5 [&_[id]]:scroll-mt-40 md:[&_[id]]:scroll-mt-24 [&_input]:min-w-0 [&_[data-slot=card]]:shadow-none"
        onClick={(event) => {
          const link = (event.target as HTMLElement).closest('a[href^="#"]');
          const target =
            link &&
            document.getElementById(link.getAttribute("href")!.slice(1));
          for (let element = target; element; element = element.parentElement) {
            if (element instanceof HTMLDetailsElement) element.open = true;
          }
          if (target?.id === "purchase-totals")
            target.querySelectorAll("details").forEach((details) => {
              details.open = true;
            });
        }}
      >
        {workflowReceiptId && (
          <p className="rounded-md border p-3 text-sm">
            Linked inward receipt: {workflowReceiptId}. Stock quantities are
            verified against that receipt before the bill is posted.
          </p>
        )}
        {activeInvoice && editingSelectedInvoice && !savedFormLocked && access.create && (
          <details open={!!workflowReceiptId} className="space-y-2 rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">{workflowReceiptId ? "Correct the earlier stock receipt" : "Link stock received earlier"}</summary>
            <p>Choose the posted receipt for these goods. Removing a receipt link will make this bill add stock when posted.</p>
            <div className="flex flex-wrap items-end gap-2">
              <label>Receipt reference
                <input className="ml-2 rounded-md border p-2" value={receiptSearch} onChange={e => setReceiptSearch(e.target.value)} />
              </label>
              <Button type="button" variant="outline" disabled={busy} onClick={async () => {
                try {
                  const result = await apiClient.get<any>(`/inventory/workspace/documents?kind=INWARD_CHALLAN&status=POSTED&limit=100&search=${encodeURIComponent(receiptSearch)}`);
                  setReceiptOptions(result.rows || []);
                  if (!result.rows?.length) setNotice("No matching posted receipts. Check the reference and your receipt access.");
                } catch (err) { setError(getErrorMessage(err)); }
              }}>Find posted receipts</Button>
              {!!receiptOptions.length && <label>Posted receipt
                <select className="ml-2 rounded-md border p-2" value={workflowReceiptId} disabled={busy} onChange={e => {
                  setWorkflowReceiptId(e.target.value); setReviewAccepted(false);
                }}>
                  <option value="" disabled>Select the receipt for these goods</option>
                  {!receiptOptions.some(r => r.id === workflowReceiptId) && workflowReceiptId && <option value={workflowReceiptId}>Current receipt</option>}
                  {receiptOptions.map(receipt => <option key={receipt.id} value={receipt.id}>{receipt.reference} · {receipt.supplierGstin}</option>)}
                </select>
              </label>}
              {workflowReceiptId && <Button type="button" variant="outline" disabled={busy} onClick={async () => {
                if ((await confirmAction({ title: "Remove receipt link?", description: "Remove the receipt link only if these goods have not already been added to inventory. Posting this bill will add stock. Continue?", confirmLabel: "Remove link", variant: "destructive" }))) {
                  const current = confirmationState.current;
                  if (current.activeInvoice !== activeInvoice || current.workflowReceiptId !== workflowReceiptId || current.draftWriteBlocked || current.unknownStockInvoiceId || postingLock.current || saveLock.current) return;
                  setWorkflowReceiptId(""); setReviewAccepted(false);
                }
              }}>Remove incorrect receipt link</Button>}
            </div>
          </details>
        )}
        {!activeInvoice && serverDrafts.length > 0 && (
          <section className="space-y-2">
            <h4 className="font-semibold">Saved unfinished intake</h4>
            <div className="flex flex-wrap gap-2">
              {serverDrafts.map((saved) => (
                <Button
                  key={saved.id}
                  variant="outline"
                  onClick={() => restoreServerDraft(saved)}
                >
                  {saved.payload?.header?.invoiceNumber ||
                    saved.payload?.sourceDocument?.fileName ||
                    "Unfinished invoice"}{" "}
                  · {new Date(saved.updatedAt).toLocaleDateString()}
                </Button>
              ))}
            </div>
          </section>
        )}
        {activeInvoice && !showIntakeHome && (
          <nav
            aria-label="Invoice navigation"
            className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b bg-background py-3"
          >
            <Button
              variant="ghost"
              onClick={() => (onBack ? onBack() : navigateIntake(true))}
              disabled={busy}
            >
              <ArrowLeft className="h-4 w-4" />
              {onBack ? "Back to list" : "Back to Invoice OCR"}
            </Button>
            <div
              role="status"
              aria-label="Stock status"
              className="min-w-0 text-sm"
            >
              <PurchaseStatusCue tone={stockAdded ? "success" : stockStatusUnknown ? "warning" : "neutral"}>
                {stockStatusUnknown
                  ? "Stock status unknown"
                  : committing
                    ? "Adding stock…"
                    : processing || saving
                      ? "Saving and checking invoice…"
                      : stockAdded
                        ? committedLabel
                        : "Stock not added"}
              </PurchaseStatusCue>
              {stockAdded && activeInvoice.stockCommitReference && (
                <p className="break-all text-xs text-muted-foreground">
                  Reference: {activeInvoice.stockCommitReference}
                </p>
              )}
            </div>
            {showSourcePreview && (
              <a
                href="#purchase-source-preview"
                className="text-sm underline underline-offset-4 xl:hidden"
              >
                View source
              </a>
            )}
            <Button
              variant="outline"
              onClick={() => {
                resetDraft();
                onNew?.();
              }}
              disabled={busy}
            >
              New invoice
            </Button>
          </nav>
        )}
        {stockAdded && activeInvoice?.committedItems?.length && (
          <section
            className="space-y-2 rounded-md border border-success-border p-4"
            aria-label="Confirmed receipt"
          >
            <h4 className="font-semibold">
              {stockReceivedEarlier
                ? "Linked receipt confirmed"
                : "Stock added - saved receipt"}
            </h4>
            <ul className="divide-y">
              {activeInvoice.committedItems.map((item) => (
                <li
                  className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                  key={item.inventoryItemId}
                >
                  <a
                    className="underline"
                    href={`/dashboard/inventory?area=stock&view=list&item=${encodeURIComponent(item.inventoryItemId)}&return=${encodeURIComponent(`area=purchases&view=intake&invoice=${activeInvoice.id}`)}`}
                  >
                    {item.productName} · {item.batchNumber}
                  </a>
                  <span>
                    {stockReceivedEarlier
                      ? `${item.purchasedQuantity + item.freeQuantity} units received earlier · 0 added again`
                      : `${item.quantityCommitted} stock units added`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {permissionsLoading && (
          <p role="status">Loading invoice permissions…</p>
        )}
        {permissionsError && (
          <Alert variant="destructive">
            <AlertDescription>{permissionsError}</AlertDescription>
          </Alert>
        )}
        {!permissionsLoading && !access.automate && (
          <p className="text-sm text-muted-foreground">
            Available actions reflect your invoice permissions. Automatic import
            requires create, review and stock access.
          </p>
        )}
        <div
          hidden={!!activeInvoice && !showIntakeHome}
          className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
        >
          <div>
            <h3
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold tracking-tight"
            >
              Scan or enter bill
            </h3>
            <p className="text-sm text-muted-foreground">
              Upload every page. Check the reading. Add stock when ready.
            </p>
          </div>
          <div hidden={!hasDraftContent && !manualEntry} className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                resetDraft();
                onNew?.();
              }}
              disabled={busy}
            >
              New invoice
            </Button>

          </div>
        </div>

        {activeInvoice && showIntakeHome && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">
                {activeInvoice.invoiceNumber} · {activeInvoice.distributorName}
              </p>
              <PurchaseStatusCue>Draft kept in this tab</PurchaseStatusCue>
            </div>
            <Button
              variant="outline"
              onClick={() => navigateIntake(false)}
              disabled={busy}
            >
              Resume invoice
            </Button>
          </div>
        )}

        {!showIntakeHome && !activeInvoice && recentInvoices}
        {!showIntakeHome && <PurchaseReviewSummary
          hasContent={hasDraftContent}
          saved={activeInvoice?.status === "REVIEWED"} committed={stockAdded} cancelled={activeInvoice?.status === "CANCELLED"} unknown={stockStatusUnknown}
          checks={confirmationCount + correctionIssues.length + manualConfidenceLines.length} lines={sourceLines.length}
          calculated={viewingSavedInvoice ? calculateTotals(sourceHeader as HeaderForm, sourceLines).netPayable : totals.netPayable}
          printed={sourceAmounts?.netPayable} />}


        <div
          ref={actionFeedbackRef}
          id="purchase-action-feedback"
          tabIndex={-1}
          className="space-y-3"
        >
          {notice && !(stockAdded && notice.startsWith("Restored")) && (
            <p role="status" className="flex items-start gap-2 text-sm">
              {stockAdded ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <FileSearch className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              {notice}
            </p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Request Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Fix Required</AlertTitle>
              <AlertDescription>
                <p className="mb-2">
                  These corrections were not saved. Fix the fields below, then
                  try again.
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  {validationErrors.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div
          className={
            showSourcePreview
              ? "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
              : ""
          }
        >
          <div className="min-w-0 space-y-5">
            {activeInvoice && (
              <section
                hidden={showIntakeHome}
                aria-labelledby="purchase-review-title"
                className="space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4
                      id="purchase-review-title"
                      className="text-lg font-semibold"
                    >
                      {activeInvoice.status === "STOCK_COMMITTED"
                        ? committedLabel
                        : "Finish invoice review"}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {activeInvoice.invoiceNumber} ·{" "}
                      {activeInvoice.distributorName}
                    </p>
                  </div>
                  <Badge variant={statusVariant(activeInvoice.status)}>
                    {purchaseInvoiceStatusLabel(activeInvoice)}
                  </Badge>
                </div>
                {activeInvoice.status === "STOCK_COMMITTED" ? (
                  <p className="text-sm">
                    {stockReceivedEarlier ? "Bill posted. Stock was received earlier." : "Stock added. To fix a saved quantity, price or product detail, open the batch below."}
                  </p>
                ) : activeInvoice.status === "CANCELLED" ? (
                  <p className="text-sm">
                    This invoice is cancelled and cannot add stock.
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      {stockStatusUnknown
                        ? "The request was interrupted. Refresh stock status to confirm the saved outcome before continuing."
                        : activeInvoice.status === "REVIEWED"
                          ? "Review complete. Choose Add stock when ready."
                          : historicalStockHold
                            ? "Check this bill against opening stock with an inventory administrator before proceeding."
                          : `Check the highlighted details, confirm the invoice, then choose ${postingLabel}.`}
                    </p>
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                        <span>
                          {activeInvoice.items?.length || 0} items ·{" "}
                          {currency.format(activeInvoice.netPayable || 0)}
                        </span>
                        {!showSourcePreview && activeInvoice.documents?.[0] && (
                          <a
                            className="text-primary underline underline-offset-4"
                            href={`/api/pharmacy/purchase-invoices/documents/${encodeURIComponent(activeInvoice.documents[0].id)}`}
                            download={activeInvoice.documents[0].fileName}
                          >
                            Open original invoice
                          </a>
                        )}
                        {!editingSelectedInvoice && (
                          <div>
                            <Label htmlFor="review-goods-date">
                              Goods Received Date
                            </Label>
                            <Input
                              id="review-goods-date"
                              type="date"
                              value={reviewDate}
                              disabled={
                                !access.review ||
                                activeInvoice.status === "REVIEWED" ||
                                busy
                              }
                              onChange={(event) =>
                                setReviewDate(event.target.value)
                              }
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    {editingSelectedInvoice && (
                      <nav
                        aria-label="Invoice sections"
                        className="flex flex-wrap gap-4 text-sm"
                      >
                        <a
                          className="underline underline-offset-4"
                          href="#distributor-name"
                        >
                          Invoice details
                        </a>
                        <a
                          className="underline underline-offset-4"
                          href="#purchase-line-items"
                        >
                          Products ({lines.length})
                        </a>
                        <a
                          className="underline underline-offset-4"
                          href="#purchase-totals"
                        >
                          Totals
                        </a>
                        <a className="underline underline-offset-4" href="#purchase-document-actions">Files &amp; history</a>
                      </nav>
                    )}
                    {!access.review && (
                      <p className="text-sm text-muted-foreground">
                        A staff member with invoice review permission must
                        approve this invoice.
                      </p>
                    )}
                    {activeInvoice.status === "REVIEWED" && !access.commit && (
                      <p className="text-sm text-muted-foreground">
                        A staff member with stock permission must commit it.
                      </p>
                    )}
                    {!access.create && activeInvoice.status !== "REVIEWED" && (
                      <p className="text-sm text-muted-foreground">
                        A staff member with purchase draft permission must save
                        corrections.
                      </p>
                    )}
                  </>
                )}
                {!stockAdded &&
                  activeInvoice.status !== "REVIEWED" &&
                  activeInvoice.status !== "CANCELLED" &&
                  reviewChecklist}
              </section>
            )}

            {revisionChecking && (
              <p role="status" className="text-sm text-muted-foreground">
                Checking the saved invoice version…
              </p>
            )}
            {revisionConflict && (
              <Alert variant="destructive">
                <AlertTitle>Saved invoice changed</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{revisionConflict}</p>
                  <Button
                    variant="outline"
                    onClick={reloadSavedInvoice}
                    disabled={revisionChecking || busy}
                  >
                    Reload saved invoice
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {recoveryError && (
              <Alert>
                <AlertDescription>{recoveryError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-5">
              <div
                className="space-y-5 min-w-0"
                hidden={
                  !showIntakeHome && !!activeInvoice && !editingSelectedInvoice
                }
              >
                <details
                  hidden={savedFormLocked}
                  className="rounded-lg border p-4"
                  open={showIntakeHome || !editingSelectedInvoice}
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {editingSelectedInvoice && !showIntakeHome
                      ? "Replace invoice file"
                      : "Scan a bill"}
                  </summary>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <PurchaseStatusCue>Scan only · stock stays unchanged</PurchaseStatusCue>
                    <PurchaseHelp label="Invoice import">Scanning keeps the original and fills in the details for you to check. You can correct any misread value before saving.</PurchaseHelp>
                  </div>
                  <div className="mt-3 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3">
                      <div>
                        <Label htmlFor="purchase-invoice-upload">
                          Upload invoice PDF or image
                        </Label>
                        <Input
                          id="purchase-invoice-upload"
                          ref={fileInputRef}
                          type="file"
                          accept="application/pdf,image/*"
                          multiple
                          onChange={(event) => {
                            setOcrFile(event.target.files?.[0] || null);
                            setOcrFiles(Array.from(event.target.files || []));
                          }}
                          disabled={extracting || saving || processing}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          PDF or photos · Up to 10 files · One invoice, in page order
                        </p>
                      </div>
                      <div className="flex flex-col gap-3">
                        <div>
                          <Label htmlFor="import-received-date">
                            Received on
                          </Label>
                          <Input
                            id="import-received-date"
                            type="date"
                            value={importReceivedDate}
                            onChange={(event) =>
                              setImportReceivedDate(event.target.value)
                            }
                            disabled={extracting || saving || processing}
                          />
                        </div>
                        <Button type="button" onClick={() => extractFromInvoiceFile(false)}
                          disabled={!access.create || busy || !ocrFile || !importReceivedDate} className="w-full md:w-auto">
                          {extracting ? <Spinner className="h-4 w-4 " /> : <FileSearch className="h-4 w-4" />}
                          {extracting ? "Reading bill…" : "Scan bill"}
                        </Button>
                        <a href="#distributor-name" className="text-center text-sm underline underline-offset-4" onClick={() => { setShowIntakeHome(false); setManualEntry(true); requestAnimationFrame(() => focusPurchaseField('distributor-name')); }}>Type instead</a>
                        {access.automate && <details className="text-sm">
                          <summary className="cursor-pointer py-2">Automatic import</summary>
                          <p className="my-2 text-muted-foreground">Adds stock if every automatic check passes.</p>
                          <Button type="button" variant="outline" onClick={() => extractFromInvoiceFile(true)} disabled={busy || !ocrFile || !importReceivedDate}>Import &amp; Add Stock</Button>
                        </details>}
                      </div>
                    </div>

                    {sourceDocument && !showIntakeHome && (
                      <div className="rounded-md border p-3 text-sm">
                        <p className="mb-1 font-medium">Original file saved</p>
                        {access.read && (
                          <OriginalDocumentLink document={sourceDocument} />
                        )}
                      </div>
                    )}
                    {ocrSummary && !showIntakeHome && (
                      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                        <span className="font-medium">
                          {ocrSummary.fileName || "Invoice"}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          extracted from {ocrSummary.includedPageCount || 1}
                          {ocrSummary.pageCount &&
                          ocrSummary.pageCount !== ocrSummary.includedPageCount
                            ? ` of ${ocrSummary.pageCount}`
                            : ""}{" "}
                          page
                          {(ocrSummary.includedPageCount || 1) === 1 ? "" : "s"}
                          .
                        </span>
                        {currentHeaderFlags.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {currentHeaderFlags.map((flag) => (
                              <Badge key={flag} variant="destructive">
                                {flag.replaceAll("_", " ")}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </details>

                {showIntakeHome && recentInvoices}

                <section
                  hidden={showIntakeHome || (!hasDraftContent && !manualEntry)}
                  aria-label="Invoice details and products"
                >
                  {!activeInvoice && (hasDraftContent || manualEntry) && reviewChecklist}
                  <fieldset
                    disabled={savedFormLocked || busy}
                    className="mt-4 space-y-5 min-w-0"
                  >
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Truck className="h-5 w-5" />
                          Distributor Bill
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        {headerFlags && (
                          <section
                            id="purchase-header-checks"
                            className="space-y-3 border-b pb-4"
                          >
                            <details>
                              <summary className="cursor-pointer text-sm text-muted-foreground">
                                Advanced OCR flags
                              </summary>
                              <Label htmlFor="invoice-ocr-flags">
                                Invoice OCR Flags
                              </Label>
                              <Input
                                id="invoice-ocr-flags"
                                disabled={
                                  savedFormLocked ||
                                  saving ||
                                  extracting ||
                                  processing
                                }
                                value={headerFlags}
                                onChange={(event) =>
                                  setHeaderFlags(event.target.value)
                                }
                              />
                            </details>
                          </section>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {!showSupplierReview && (
                            <>
                              <Field
                                id="distributor-name"
                                label="Distributor"
                                value={header.distributorName}
                                onChange={(event) =>
                                  updateHeader(
                                    "distributorName",
                                    event.target.value,
                                  )
                                }
                                placeholder="Distributor name"
                              />
                              <Field
                                id="distributor-gstin"
                                label="GSTIN"
                                value={header.distributorGstin}
                                onChange={(event) =>
                                  updateHeader(
                                    "distributorGstin",
                                    event.target.value.toUpperCase(),
                                  )
                                }
                                placeholder="36ABCDE1234F1Z5"
                              />
                            </>
                          )}
                          <Field
                            id="distributor-dl"
                            label="DL No."
                            value={header.distributorDlNo}
                            onChange={(event) =>
                              updateHeader(
                                "distributorDlNo",
                                event.target.value,
                              )
                            }
                            placeholder="Drug license number"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field
                            id="invoice-number"
                            label="Invoice No."
                            value={header.invoiceNumber}
                            onChange={(event) =>
                              updateHeader("invoiceNumber", event.target.value)
                            }
                          />
                          <Field
                            id="invoice-date"
                            label="Invoice Date"
                            type="date"
                            value={header.invoiceDate}
                            onChange={(event) =>
                              updateHeader("invoiceDate", event.target.value)
                            }
                          />
                          <Field
                            id="goods-date"
                            label="Goods Received"
                            type="date"
                            value={header.goodsReceivedDate}
                            onChange={(event) =>
                              updateHeader(
                                "goodsReceivedDate",
                                event.target.value,
                              )
                            }
                          />
                          <div>
                            <div className="flex items-center">
                              <Label htmlFor="bill-type">Bill Type</Label>
                              <SourceFieldLink
                                id="bill-type"
                                label="Bill Type"
                              />
                            </div>
                            <Select
                              value={header.billType}
                              onValueChange={(value: string) =>
                                updateHeader("billType", value as BillType)
                              }
                            >
                              <SelectTrigger id="bill-type" className="w-full">
                                <SelectValue placeholder="Bill type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="CASH">Cash</SelectItem>
                                <SelectItem value="CREDIT">Credit</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field
                            id="due-date"
                            label="Due Date"
                            type="date"
                            value={header.dueDate}
                            onChange={(event) =>
                              updateHeader("dueDate", event.target.value)
                            }
                            disabled={header.billType === "CASH"}
                          />
                        </div>
                        <details className="border-t pt-3">
                          <summary className="cursor-pointer text-sm font-medium">
                            Additional invoice details
                          </summary>
                          <div className="mt-3 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <Field
                                id="food-license"
                                label="Food License"
                                value={header.distributorFoodLicense}
                                onChange={(event) =>
                                  updateHeader(
                                    "distributorFoodLicense",
                                    event.target.value,
                                  )
                                }
                                placeholder="Optional"
                              />
                              <Field
                                id="doctor-reg"
                                label="Doctor / Reg. No. (optional)"
                                value={header.doctorNameOrRegNo}
                                onChange={(event) =>
                                  updateHeader(
                                    "doctorNameOrRegNo",
                                    event.target.value,
                                  )
                                }
                                placeholder="Doctor name or registration"
                              />
                              <Field
                                id="eway-bill"
                                label="E-Way Bill"
                                value={header.eWayBillNo}
                                onChange={(event) =>
                                  updateHeader("eWayBillNo", event.target.value)
                                }
                                placeholder="Optional"
                              />
                              <Field
                                id="lr-no"
                                label="LR No."
                                value={header.lrNo}
                                onChange={(event) =>
                                  updateHeader("lrNo", event.target.value)
                                }
                                placeholder="Optional"
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <Field
                                id="buyer-code"
                                label="Buyer Code"
                                value={header.buyerCode}
                                onChange={(event) =>
                                  updateHeader("buyerCode", event.target.value)
                                }
                                placeholder="Optional"
                              />
                              <Field
                                id="urc-code"
                                label="URC Code"
                                value={header.urcCode}
                                onChange={(event) =>
                                  updateHeader("urcCode", event.target.value)
                                }
                                placeholder="Optional"
                              />
                              <Field
                                id="salesman"
                                label="Salesman"
                                value={header.salesmanName}
                                onChange={(event) =>
                                  updateHeader(
                                    "salesmanName",
                                    event.target.value,
                                  )
                                }
                                placeholder="Optional"
                              />
                              <Field
                                id="salesman-contact"
                                label="Salesman Contact"
                                value={header.salesmanContact}
                                onChange={(event) =>
                                  updateHeader(
                                    "salesmanContact",
                                    event.target.value,
                                  )
                                }
                                placeholder="Optional"
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <Label htmlFor="distributor-address">
                                  Distributor Address
                                  <SourceFieldLink
                                    id="distributor-address"
                                    label="Distributor address"
                                  />
                                </Label>
                                <Textarea
                                  id="distributor-address"
                                  value={header.distributorAddress}
                                  onChange={(event) =>
                                    updateHeader(
                                      "distributorAddress",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Optional"
                                />
                              </div>
                              <div>
                                <Label htmlFor="purchase-notes">Notes</Label>
                                <Textarea
                                  id="purchase-notes"
                                  value={header.handwrittenNotes}
                                  onChange={(event) =>
                                    updateHeader(
                                      "handwrittenNotes",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Handwritten or OCR notes"
                                />
                              </div>
                            </div>
                          </div>
                        </details>
                      </CardContent>
                    </Card>

                    {lines.some((line) => line.productName.trim()) &&
                      !savedFormLocked && (
                        <Card id="purchase-master-matching">
                          <CardHeader>
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <CardTitle className="flex items-center gap-2">
                                  <FileSearch className="h-5 w-5" />
                                  Product matching
                                  <PurchaseHelp label="Product matching">Clinic inventory appears first, followed by catalog products. Check the product and pack before confirming. Matches are remembered for this supplier. Loose dispensing is managed separately in inventory.</PurchaseHelp>
                                </CardTitle>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={refreshMasterMatches}
                                disabled={
                                  !access.create ||
                                  busy ||
                                  masterRefreshing ||
                                  masterConfirming !== null
                                }
                              >
                                {masterRefreshing ? (
                                  <Spinner className="h-4 w-4 mr-2 " />
                                ) : (
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                )}
                                Refresh Matches
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {masterMatches.length === 0 && (
                              <p className="text-sm text-muted-foreground">
                                Refresh Matches to find saved products.
                              </p>
                            )}
                            {masterMatches.map((match) => {
                              if (!access.create) return;
                              const line = lines[match.lineIndex];
                              const best = match.recommendedAction === "CREATE_NEW" ? undefined : match.candidates[0];
                              const status = masterStatuses[match.lineIndex];
                              const savedProduct = status?.drug || best?.drug;
                              const choices = match.recommendedAction === "CREATE_NEW" ? [] : [...match.candidates, ...(match.alternatives || []).filter(candidate => candidate.sameBrand)].slice(0, 5);
                              return (
                                <section key={`${match.lineIndex}-${fieldValue(match.ocr?.productName)}`} aria-label={`Product matching for line ${match.lineIndex + 1}`} className="space-y-3 border-t py-4 first:border-t-0 first:pt-0">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium break-words">Line {match.lineIndex + 1}: {fieldValue(match.ocr?.productName) || line?.productName}</p>
                                      <p className="text-sm text-muted-foreground">{line?.packSize || fieldValue(match.ocr?.packSize)} · MRP {currency.format(numeric(String(line?.mrp || match.ocr?.mrp || 0)))} · Batch {line?.batchNumber || fieldValue(match.ocr?.batchNumber)}</p>
                                    </div>
                                    <Badge variant={status ? "default" : "outline"}>{status ? status.message === "Remembered match" ? "Remembered match" : masterActionLabel(status.action) : match.matchLabel || (best ? "Possible match" : "Not in inventory")}</Badge>
                                  </div>
                                  {status ? <p className="text-sm font-medium">{status.drug.name} · {status.drug.packSizeLabel}</p> : <>
                                    <div className="divide-y" aria-label="Product candidates">
                                      {choices.map((candidate, index) => <div key={candidate.drug.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                        <div className="min-w-0 flex-1 basis-48">
                                          <p className="font-medium break-words">{candidate.drug.name}</p>
                                          <p className="text-muted-foreground">{[candidate.drug.packSizeLabel, candidate.drug.manufacturerName].filter(Boolean).join(" · ")}</p>
                                          {!!candidate.mismatches?.filter(reason => reason !== "Product names differ").length && <p className="text-warning-text dark:text-warning-text">{candidate.mismatches.filter(reason => reason !== "Product names differ").join(" · ")}</p>}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-muted-foreground">{candidate.inInventory ? "In inventory" : "Catalog"}</span>
                                          <PurchaseHelp label={`Line ${match.lineIndex + 1} candidate ${index + 1}`}>{[...(candidate.reasons || []), ...(candidate.mismatches || [])].join(". ") || "Check the product and pack before matching."}</PurchaseHelp>
                                          <Button type="button" size="sm" variant={index === 0 && best ? "default" : "outline"} disabled={busy || masterConfirming !== null} onClick={() => confirmMasterLine(match, "MATCH_EXISTING", candidate)}>{index === 0 && best ? "Confirm Match" : "Select"}</Button>
                                        </div>
                                      </div>)}
                                    </div>
                                    {match.sameBrandExists && !best && <p role="status" className="text-sm">Same-brand item found. Review its pack before matching.</p>}
                                  </>}
                                  <PurchaseManualMatchSearch key={line?.localId || match.lineIndex} lineNumber={match.lineIndex + 1} disabled={busy || masterConfirming !== null} onSelect={drug => { void confirmMasterLine(match, "MATCH_EXISTING", { drug, score: 0, confidence: "LOW" }); }} />
                                  {!status && <details className="text-sm">
                                    <summary className="cursor-pointer text-muted-foreground">Invoice details</summary>
                                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                                      <Detail label="Manufacturer" value={line?.manufacturer || match.ocr?.manufacturer} />
                                      <Detail label="Rate" value={line?.purchaseRate || match.ocr?.purchaseRate} currencyValue />
                                      <label>Invoice product kind<select className="mt-1 block w-full rounded-md border bg-background p-2" value={line?.productKind || ""} disabled={busy || masterConfirming !== null} onChange={event => { if (line) updateLine(line.localId, "productKind", event.target.value); }}><option value="">Not recorded</option><option value="MEDICINE">Medicine</option><option value="COSMETIC">Cosmetic / skin care</option><option value="CONSUMABLE">Other consumable</option></select></label>
                                    </div>
                                  </details>}
                                  {savedProduct && access.catalogDetails && <details className="text-sm" open={!!savedProduct.catalogIssues?.length && !!status ? true : undefined}>
                                    <summary className="cursor-pointer">Check or correct saved product details</summary>
                                    {!!savedProduct.catalogIssues?.length && <p role="alert" className="my-2 text-destructive">Complete the saved product details: {savedProduct.catalogIssues.join(", ")}.</p>}
                                    {access.editProduct ? <PurchaseProductDetails key={JSON.stringify(savedProduct)} id={`product-${match.lineIndex}-edit`} product={savedProduct} disabled={busy || masterConfirming !== null} onSave={catalog => saveProductDetails(savedProduct, catalog)} /> : <p className="mt-2">Staff with product-edit permission must correct this saved record.</p>}
                                  </details>}
                                  {!status && !match.sameBrandExists && (access.catalogDetails ? <details className="text-sm" open={match.recommendedAction === "CREATE_NEW"}>
                                    <summary className="cursor-pointer font-semibold">Create new item</summary>
                                    <PurchaseProductDetails id={`product-${match.lineIndex}-new`} createLabel="Create new item" onKindChange={kind => { if (line) updateLine(line.localId, "productKind", kind); }} disabled={busy || masterConfirming !== null} onSave={catalog => confirmMasterLine(match, "CREATE_NEW", undefined, catalog)} />
                                  </details> : <p className="text-sm">Product creation requires the updated backend. Reload after the update completes.</p>)}
                                </section>
                              );
                            })}
                          </CardContent>
                        </Card>
                      )}

                    <section id="purchase-line-items" className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">Products on this bill</h4>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={addLine}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Line
                          </Button>
                        </div>
                      </div>

                      {lines.map((line, index) => {
                        const amounts = calculateLine(line);
                        return (
                          <section
                            key={line.localId}
                            id={`${line.localId}-review`}
                            className="rounded-lg border"
                            aria-label={`Product line ${index + 1}`}
                          >
                            <div className="p-4">
                              <span className="inline-flex w-full flex-wrap items-center justify-between gap-2 align-middle text-sm">
                                <span className="min-w-0">
                                  <strong>
                                    {index + 1}.{" "}
                                    {line.productName.trim() || "New product"}
                                  </strong>
                                  <span className="mt-1 block text-muted-foreground">
                                    {line.batchNumber || "Batch needed"} ·{" "}
                                    {line.quantityPurchased || "0"} paid +{" "}
                                    {line.freeQuantity || "0"} free
                                  </span>
                                </span>
                                <span className="flex items-center gap-3">
                                  {line.ocrFlags && (
                                    <span className="text-destructive">
                                      {
                                        groupPurchaseOcrFlags(
                                          splitFlags(line.ocrFlags) || [],
                                          index,
                                        ).length
                                      }{" "}
                                      {groupPurchaseOcrFlags(
                                        splitFlags(line.ocrFlags) || [],
                                        index,
                                      ).length === 1
                                        ? "check"
                                        : "checks"}
                                    </span>
                                  )}
                                  <strong>
                                    {currency.format(amounts.total)}
                                  </strong>
                                </span>
                              </span>
                            </div>
                            <div className="flex justify-end px-4 pb-3">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => removeLine(line.localId)}
                                disabled={lines.length === 1}
                                aria-label={`Remove line ${index + 1}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="space-y-4 px-4 pb-4">
                              <div className="md:col-span-2">
                                {line.ocrFlags && (
                                  <details className="mt-2">
                                    <summary className="cursor-pointer text-sm text-muted-foreground">
                                      Advanced line OCR flags
                                    </summary>
                                    <Label
                                      htmlFor={`${line.localId}-ocr-flags`}
                                    >
                                      OCR Flags
                                    </Label>
                                    <Input
                                      id={`${line.localId}-ocr-flags`}
                                      value={line.ocrFlags}
                                      onChange={(event) =>
                                        updateLine(
                                          line.localId,
                                          "ocrFlags",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </details>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Field
                                  id={`${line.localId}-product`}
                                  label="Product"
                                  value={line.productName}
                                  onChange={(event) =>
                                    updateLine(
                                      line.localId,
                                      "productName",
                                      event.target.value,
                                    )
                                  }
                                />
                                <Field
                                  id={`${line.localId}-manufacturer`}
                                  label="Manufacturer (optional)"
                                  value={line.manufacturer}
                                  onChange={(event) =>
                                    updateLine(
                                      line.localId,
                                      "manufacturer",
                                      event.target.value,
                                    )
                                  }
                                />
                                <Field
                                  id={`${line.localId}-pack-size`}
                                  label="Pack Size"
                                  value={line.packSize}
                                  onChange={(event) =>
                                    updateLine(
                                      line.localId,
                                      "packSize",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Strip of 10"
                                />
                                <Field
                                  id={`${line.localId}-unit`}
                                  label="Stock unit"
                                  placeholder="Bottle, Tube or Strip"
                                  value={line.packUnitType}
                                  onChange={(event) =>
                                    updateLine(
                                      line.localId,
                                      "packUnitType",
                                      event.target.value,
                                    )
                                  }
                                />
                                <Field
                                  id={`${line.localId}-hsn`}
                                  label="HSN"
                                  value={line.hsnCode}
                                  onChange={(event) =>
                                    updateLine(
                                      line.localId,
                                      "hsnCode",
                                      event.target.value,
                                    )
                                  }
                                />
                                <Field
                                  id={`${line.localId}-batch`}
                                  label="Batch"
                                  value={line.batchNumber}
                                  onChange={(event) =>
                                    updateLine(
                                      line.localId,
                                      "batchNumber",
                                      event.target.value,
                                    )
                                  }
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <Field
                                  id={`${line.localId}-expiry-month`}
                                  label="Exp. Month"
                                  type="number"
                                  min="1"
                                  max="12"
                                  value={line.expiryMonth}
                                  onChange={(event) =>
                                    updateLine(
                                      line.localId,
                                      "expiryMonth",
                                      event.target.value,
                                    )
                                  }
                                />
                                <Field
                                  id={`${line.localId}-expiry-year`}
                                  label="Exp. Year"
                                  type="number"
                                  min="2020"
                                  max="2100"
                                  value={line.expiryYear}
                                  onChange={(event) =>
                                    updateLine(
                                      line.localId,
                                      "expiryYear",
                                      event.target.value,
                                    )
                                  }
                                />
                                <Field
                                  id={`${line.localId}-qty`}
                                  label="Paid Qty"
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={line.quantityPurchased}
                                  onChange={(event) =>
                                    updateLine(
                                      line.localId,
                                      "quantityPurchased",
                                      event.target.value,
                                    )
                                  }
                                />
                                <Field
                                  id={`${line.localId}-free-qty`}
                                  label="Free Qty"
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={line.freeQuantity}
                                  onChange={(event) =>
                                    updateLine(
                                      line.localId,
                                      "freeQuantity",
                                      event.target.value,
                                    )
                                  }
                                />
                                <Field
                                  id={`${line.localId}-rate`}
                                  label="Rate"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.purchaseRate}
                                  onChange={(event) =>
                                    updateLine(
                                      line.localId,
                                      "purchaseRate",
                                      event.target.value,
                                    )
                                  }
                                />
                                <Field
                                  id={`${line.localId}-mrp`}
                                  label="MRP"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.mrp}
                                  onChange={(event) =>
                                    updateLine(
                                      line.localId,
                                      "mrp",
                                      event.target.value,
                                    )
                                  }
                                />
                                <Field
                                  id={`${line.localId}-old-mrp`}
                                  label="Old MRP"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.oldMrp}
                                  onChange={(event) =>
                                    updateLine(
                                      line.localId,
                                      "oldMrp",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Optional"
                                />
                                <ReadOnlyAmount
                                  label="Taxable"
                                  value={amounts.taxable}
                                />
                              </div>

                              <details open className="border-t pt-3">
                                <summary className="cursor-pointer text-sm font-medium">
                                  Tax, discounts and OCR details
                                </summary>
                                <div className="mt-3 space-y-4">
                                  <div className="grid grid-cols-2 gap-3">
                                    <Field
                                      id={`${line.localId}-discount`}
                                      label="Disc %"
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={line.discountPercent}
                                      onChange={(event) =>
                                        updateLine(
                                          line.localId,
                                          "discountPercent",
                                          event.target.value,
                                        )
                                      }
                                    />
                                    <Field
                                      id={`${line.localId}-special-discount`}
                                      label="Special %"
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={line.specialDiscountPercent}
                                      onChange={(event) =>
                                        updateLine(
                                          line.localId,
                                          "specialDiscountPercent",
                                          event.target.value,
                                        )
                                      }
                                    />
                                    <Field
                                      id={`${line.localId}-scheme`}
                                      label="Scheme amount (₹)"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={line.schemeAmount || "0"}
                                      onChange={(e) =>
                                        updateLine(
                                          line.localId,
                                          "schemeAmount",
                                          e.target.value,
                                        )
                                      }
                                    />
                                    <Field
                                      id={`${line.localId}-cgst`}
                                      label="CGST %"
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={line.cgstPercent}
                                      onChange={(event) =>
                                        updateLine(
                                          line.localId,
                                          "cgstPercent",
                                          event.target.value,
                                        )
                                      }
                                    />
                                    <Field
                                      id={`${line.localId}-sgst`}
                                      label="SGST %"
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={line.sgstPercent}
                                      onChange={(event) =>
                                        updateLine(
                                          line.localId,
                                          "sgstPercent",
                                          event.target.value,
                                        )
                                      }
                                    />
                                    <Field
                                      id={`${line.localId}-igst`}
                                      label="IGST %"
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={line.igstPercent}
                                      onChange={(event) =>
                                        updateLine(
                                          line.localId,
                                          "igstPercent",
                                          event.target.value,
                                        )
                                      }
                                    />
                                    <ReadOnlyAmount
                                      label="GST"
                                      value={amounts.gst}
                                    />
                                    <ReadOnlyAmount
                                      label="Line Total"
                                      value={amounts.total}
                                    />
                                    <ReadOnlyAmount
                                      label="Effective Cost"
                                      value={
                                        numeric(line.quantityPurchased) +
                                          numeric(line.freeQuantity) >
                                        0
                                          ? money(
                                              amounts.taxable /
                                                (numeric(
                                                  line.quantityPurchased,
                                                ) +
                                                  numeric(line.freeQuantity)),
                                            )
                                          : 0
                                      }
                                    />
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Field
                                      id={`${line.localId}-confidence`}
                                      label="OCR Confidence"
                                      type="number"
                                      min="0"
                                      max="1"
                                      step="0.01"
                                      value={line.ocrConfidence}
                                      readOnly
                                      placeholder="Manual entry"
                                    />
                                  </div>
                                  <ReportedAmountsEditor
                                    id={line.localId}
                                    values={
                                      Array.isArray(originalAmounts?.items)
                                        ? originalAmounts.items[index]
                                        : null
                                    }
                                    labels={reportedLineAmounts}
                                    disabled={
                                      savedFormLocked ||
                                      saving ||
                                      extracting ||
                                      processing
                                    }
                                    onChange={(key, value) =>
                                      updateReportedAmount(key, value, index)
                                    }
                                  />
                                </div>
                              </details>
                            </div>
                          </section>
                        );
                      })}
                    </section>

                    <Card>
                      <CardHeader>
                        <CardTitle id="purchase-totals" className="text-base">
                          Check bill total
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <details>
                          <summary className="cursor-pointer text-sm font-medium">
                            Reported discounts, TCS &amp; rounding
                          </summary>
                          <div className="my-2 flex items-center gap-1 text-sm text-muted-foreground"><span>Change line discounts to adjust the payable.</span><PurchaseHelp label="Discounts and adjustments">Trade, special, cash, damage, visibility and credit/debit amounts are summaries already included in line taxable values. Adjust line discounts or scheme amounts to change the payable. TCS and rounding apply to the bill total.</PurchaseHelp></div>
                          <div className="grid grid-cols-2 gap-3">
                            <Field
                              id="trade-discount"
                              label="Trade Disc."
                              type="number"
                              step="0.01"
                              value={header.tradeDiscount}
                              onChange={(event) =>
                                updateHeader(
                                  "tradeDiscount",
                                  event.target.value,
                                )
                              }
                            />
                            <Field
                              id="special-discount"
                              label="Special Disc."
                              type="number"
                              step="0.01"
                              value={header.specialDiscount}
                              onChange={(event) =>
                                updateHeader(
                                  "specialDiscount",
                                  event.target.value,
                                )
                              }
                            />
                            <Field
                              id="cash-discount"
                              label="Cash Disc."
                              type="number"
                              step="0.01"
                              value={header.cashDiscount}
                              onChange={(event) =>
                                updateHeader("cashDiscount", event.target.value)
                              }
                            />
                            <Field
                              id="damage-adjustment"
                              label="Damage Adj."
                              type="number"
                              step="0.01"
                              value={header.damageAdjustment}
                              onChange={(event) =>
                                updateHeader(
                                  "damageAdjustment",
                                  event.target.value,
                                )
                              }
                            />
                            <Field
                              id="visibility-amount"
                              label="Visibility"
                              type="number"
                              step="0.01"
                              value={header.visibilityAmount}
                              onChange={(event) =>
                                updateHeader(
                                  "visibilityAmount",
                                  event.target.value,
                                )
                              }
                            />
                            <Field
                              id="credit-debit-adjustment"
                              label="Cr/Db Adj."
                              type="number"
                              step="0.01"
                              value={header.creditDebitAdjustment}
                              onChange={(event) =>
                                updateHeader(
                                  "creditDebitAdjustment",
                                  event.target.value,
                                )
                              }
                            />
                            <Field
                              id="tcs-amount"
                              label="TCS"
                              type="number"
                              step="0.01"
                              value={header.tcsAmount}
                              onChange={(event) =>
                                updateHeader("tcsAmount", event.target.value)
                              }
                            />
                            <Field
                              id="rounding"
                              label="Rounding"
                              type="number"
                              step="0.01"
                              value={header.rounding}
                              onChange={(event) =>
                                updateHeader("rounding", event.target.value)
                              }
                            />
                          </div>
                        </details>

                        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3">
                          <SummaryValue
                            label="Gross"
                            value={currency.format(totals.grossAmount)}
                          />
                          <SummaryValue
                            label="Taxable"
                            value={currency.format(totals.taxableAmount)}
                          />
                          <SummaryValue
                            label="GST"
                            value={currency.format(totals.totalGst)}
                          />
                          <SummaryValue
                            label="TCS"
                            value={currency.format(totals.tcsAmount)}
                          />
                          <SummaryValue
                            label="Net Payable"
                            value={currency.format(totals.netPayable)}
                            strong
                          />
                        </div>
                        <div
                          className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3 border-t pt-4"
                          aria-label="Receipt quantity and margin summary"
                        >
                          <SummaryValue
                            label="Lines"
                            value={String(lines.length)}
                          />
                          <SummaryValue
                            label="Paid stock units"
                            value={String(receiptSummary.paid)}
                          />
                          <SummaryValue
                            label="Free stock units"
                            value={String(receiptSummary.free)}
                          />
                          <SummaryValue
                            label="Received stock units"
                            value={String(receiptSummary.received)}
                            help="Paid plus free quantities in each line’s declared stock unit. Pack contents are not multiplied into this count."
                          />
                          <SummaryValue
                            label="Indicative margin at MRP"
                            help="Margin as a percentage of sales at each unit’s MRP, before selling discounts. GST is excluded from sales and purchase cost; TCS and rounding are excluded. Missing MRP makes margin unknown."
                            value={
                              receiptSummary.marginPercent === null
                                ? "Unknown"
                                : `${receiptSummary.marginPercent.toFixed(2)}%`
                            }
                          />
                        </div>
                        <ReportedAmountsEditor
                          id="invoice"
                          values={originalAmounts}
                          labels={reportedHeaderAmounts}
                          disabled={
                            savedFormLocked ||
                            saving ||
                            extracting ||
                            processing
                          }
                          onChange={(key, value) =>
                            updateReportedAmount(key, value)
                          }
                        />
                      </CardContent>
                    </Card>

                    {warnings.length > 0 && (
                      <div className="space-y-3">
                        {warnings.length > 0 && (
                          <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Warnings</AlertTitle>
                            <AlertDescription>
                              <ul className="list-disc pl-4 space-y-1">
                                {warnings.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}
                  </fieldset>
                </section>
              </div>

              <aside className="space-y-5 min-w-0">
                {(unlinkedUploads.length > 0 || uploadListError) && (
                  <details className="rounded-lg border p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Saved uploads ({unlinkedUploads.length})
                    </summary>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Uploads awaiting invoice details
                      </CardTitle>
                      <CardDescription>
                        Originals stay saved even when extraction fails. Showing
                        the latest 20.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {uploadListError && (
                        <p className="text-sm text-destructive">
                          Could not load saved uploads: {uploadListError}
                        </p>
                      )}
                      {unlinkedUploads.map((document) => (
                        <div
                          key={document.id}
                          className="space-y-2 rounded-md border p-3"
                        >
                          <OriginalDocumentLink document={document} />
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              saving ||
                              extracting ||
                              processing ||
                              savedFormLocked
                            }
                            onClick={() => {
                              setSourceDocument(document);
                              setNotice(
                                "Original selected for this draft. Save draft links the file to the invoice.",
                              );
                            }}
                          >
                            Use for this draft
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadUnlinkedUploads}
                      >
                        Refresh saved uploads
                      </Button>
                    </CardContent>
                  </details>
                )}

                {activeInvoice && !showIntakeHome && (
                  <details className="rounded-lg border p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Saved invoice details
                    </summary>
                    <div className="mt-4 space-y-4">
                      {!!activeInvoice.documents?.length && (
                        <div className="space-y-2 text-sm">
                          <p className="font-medium">Original documents</p>
                          {activeInvoice.documents.map((document) => (
                            <OriginalDocumentLink
                              key={document.id}
                              document={document}
                            />
                          ))}
                        </div>
                      )}
                      {activeInvoice.stockCommitReference && (
                        <div className="rounded-md border px-3 py-2 text-sm">
                          <span className="text-muted-foreground">
                            Reference:{" "}
                          </span>
                          <span className="font-medium">
                            {activeInvoice.stockCommitReference}
                          </span>
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-medium">Lines</h5>
                          <Badge variant="outline">
                            {activeInvoice.items?.length || 0}
                          </Badge>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Product</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">
                                Total
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {!activeInvoice.items?.length ? (
                              <TableRow>
                                <TableCell
                                  colSpan={3}
                                  className="h-16 text-center text-muted-foreground"
                                >
                                  No lines
                                </TableCell>
                              </TableRow>
                            ) : (
                              activeInvoice.items.map((item) => (
                                <TableRow key={item.id || item.lineNumber}>
                                  <TableCell>
                                    <div className="font-medium">
                                      {item.productName}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {item.batchNumber} · Exp{" "}
                                      {item.expiryMonth}/{item.expiryYear}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {numberFormat.format(
                                      (item.quantityPurchased || 0) +
                                        (item.freeQuantity || 0),
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {currency.format(item.lineTotal || 0)}
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>

                      {activeInvoice.committedItems?.length ? (
                        <Alert>
                          <Send className="h-4 w-4" />
                          <AlertTitle>Committed Items</AlertTitle>
                          <AlertDescription>
                            {activeInvoice.committedItems.length} line
                            {activeInvoice.committedItems.length === 1
                              ? ""
                              : "s"}{" "}
                            posted to inventory.
                          </AlertDescription>
                        </Alert>
                      ) : null}
                    </div>
                  </details>
                )}
              </aside>
            </div>
          </div>
          {showSourcePreview && previewDocument && (
            <PurchaseSourcePreview
              key={previewDocument.id}
              document={previewDocument}
              targets={sourceTargets}
              selectedId={selectedSourceId}
              onSelect={(id) => selectSource(id, true)}
              canLocate={access.create}
            />
          )}
        </div>
        {(!showIntakeHome || !activeInvoice) && (hasDraftContent || manualEntry) && invoiceActions}
        {activeInvoice && !showIntakeHome && (
          <div id="purchase-document-actions">
            <PurchaseDocumentActions invoice={activeInvoice}
              onRefresh={() => refreshStockStatus(activeInvoice.id)}
              onEdit={!savedFormLocked ? () => editSavedDraft(activeInvoice) : undefined} />
          </div>
        )}
      </div>
    </PurchaseSourceContext.Provider>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
};

function OriginalDocumentLink({ document }: { document: OriginalDocument }) {
  return (
    <a
      className="block break-words text-sm text-primary underline underline-offset-4"
      href={`/api/pharmacy/purchase-invoices/documents/${encodeURIComponent(document.id)}`}
      download={document.fileName}
    >
      Download original: {document.fileName} (
      {Math.max(1, Math.round(document.sizeBytes / 1024))} KB)
    </a>
  );
}

function ReportedAmountsEditor({
  id,
  values,
  labels,
  disabled,
  onChange,
}: {
  id: string;
  values: Record<string, unknown> | null | undefined;
  labels: Record<string, string>;
  disabled: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const fields = Object.entries(labels).filter(
    ([key]) => values?.[key] !== undefined && values?.[key] !== null,
  );
  if (!fields.length) return null;
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Amounts read from invoice
      </summary>
      <div className="my-2 flex items-center gap-1 text-xs text-muted-foreground"><span>Correct only against the original.</span><PurchaseHelp label="Amounts read from invoice">These are the printed amounts. They stay unchanged when quantities, rates or taxes change. Correct only OCR reading errors after checking the original.</PurchaseHelp></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {fields.map(([key, label]) => (
          <Field
            key={key}
            id={`${id}-reported-${key}`}
            label={`Reported ${label}`}
            type="number"
            min="0"
            step="0.01"
            value={String(values?.[key] ?? "")}
            disabled={disabled}
            onChange={(event) => onChange(key, event.target.value)}
          />
        ))}
      </div>
    </details>
  );
}

function Field({ id, label, className, ...props }: FieldProps) {
  const source = useContext(PurchaseSourceContext);
  return (
    <div className={className}>
      <div className="flex items-center">
        <Label htmlFor={id}>{label}</Label>
        <SourceFieldLink id={id} label={label} />
      </div>
      <Input
        id={id}
        {...props}
        className={
          source.enabled && source.selectedId === id
            ? "outline-2 outline-amber-600 bg-warning-soft dark:bg-warning"
            : undefined
        }
      />
    </div>
  );
}

function ReadOnlyAmount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm font-medium">
        {currency.format(value || 0)}
      </div>
    </div>
  );
}

/**
 * @cc [owner:nareshshah139,label:accessibility] purchase-summary-full-values
 * Receipt summary amounts and quantities MUST remain fully visible without ellipses when the
 * containing panel narrows or text is enlarged. Supporting explanations may use help tooltips.
 */
function SummaryValue({
  label,
  value,
  strong,
  help,
}: {
  label: string;
  value: string;
  strong?: boolean;
  help?: string;
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">{label}{help && <PurchaseHelp label={label}>{help}</PurchaseHelp>}</p>
      <p
        className={`break-words text-base tabular-nums ${strong ? "font-semibold" : "font-medium"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Detail({
  label,
  value,
  currencyValue,
}: {
  label: string;
  value: unknown;
  currencyValue?: boolean;
}) {
  const hasValue = value !== null && value !== undefined && value !== "";
  const display =
    currencyValue && hasValue
      ? currency.format(numeric(value as string | number))
      : fieldValue(value);
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{display}</dd>
    </div>
  );
}
