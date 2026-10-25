"use client";

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
  Loader2,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
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
import { ReviewStatus, ReviewLegend, reviewColors, type ReviewTone } from "@/components/ui/ReviewStatus";
import { PurchaseFieldReviewContext, PurchaseFieldStatus, usePurchaseFieldTone, purchaseCheckInvalid, purchaseExpiryInvalid, pendingPurchaseOcrFlags, type PurchaseCheckedFields } from "./PurchaseFieldReview";
import { PurchaseHelp, PurchaseStatusCue } from "./PurchaseHelp";
import {
  focusPurchaseField,
  groupPurchaseOcrFlags,
  purchaseBlockingIssues,
  purchaseInvoiceStatusLabel,
  purchaseInvoiceReviewTone,
  purchaseReviewIssue,
  uniquePurchaseReviewIssues,
} from "@/lib/purchase-invoice-review";
import { purchaseRecovery, purchaseRecoveryTarget, purchaseDifferences, isPurchaseReadback, canCorrectPurchase, type PurchaseAttempt, type PurchaseRecovery } from "@/lib/purchase-invoice-recovery";
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
  source?: SourceType;
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
  dosageForm?: string | null;
  strength?: string | null;
};

type MasterCandidate = {
  drug: MasterDrug;
  score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons?: string[];
};

type MasterMatch = {
  matchLabel?: "Same product" | "Possible match" | "Not in inventory";
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
    if (purchaseExpiryInvalid(line.expiryMonth, line.expiryYear)) {
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

const importAttemptIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @cc [owner:nareshshah139,label:product] purchase-recovery-entry-and-handoff
 * Missing-invoice read failures and fresh intake MUST expose recovery in the UI. A malformed
 * attempt reference MUST NOT skip exact invoice readback or unlock its stock outcome. Handoffs MUST
 * retain exact attempt, original-operator, invoice and original-document references when known;
 * denied access or clipboard failure MUST leave a usable, copyable recovery route.
 */
/**
 * @cc [owner:nareshshah139] receipt-correction-stock-intent
 * Editable purchases MUST allow selecting a posted receipt; removing an existing link MUST
 * explicitly confirm that posting will add stock. Locked or uncertain invoices cannot edit it.
 */
export function PurchaseInvoiceWorkbench({
  invoiceId,
  recoveryAttemptId,
  recoveryActorId,
  recoverySourceIds,
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
  recoveryAttemptId?: string;
  recoveryActorId?: string;
  recoverySourceIds?: string[];
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
    ? `purchase-intake:${user.branchId}:${user.id}:${recoveryAttemptId || invoiceId || receiptId || intakeId || draftKey || "new"}`
    : null;
  return (
    <PurchaseInvoiceEditor
      key={recoveryKey || "anonymous"}
      recoveryKey={recoveryKey}
      invoiceId={invoiceId}
      recoveryAttemptId={recoveryAttemptId}
      recoveryActorId={recoveryActorId}
      recoverySourceIds={recoverySourceIds}
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
 * Authorized editors with catalogue support MUST see Not in inventory, Create new item and
 * manual search when no candidate exists or the response recommends CREATE_NEW; such responses
 * MUST NOT expose a suggested saved product or Confirm Match button. Suggestions MUST use plain
 * identity labels rather than numeric confidence. Editing a name or pack, or removing a line,
 * MUST discard previous suggested and confirmed mappings before they can be reused.
 */
/**
 * @cc [owner:nareshshah139,label:product] purchase-check-before-stock
 * The primary scan and save actions MUST retain a reviewable draft without adding stock.
 * Adding stock MUST be a separately labelled action; automatic processing MUST stay an explicit
 * secondary choice. Editing reviewed values MUST clear the final human confirmation.
 */
/**
 * @cc [owner:nareshshah139,label:product] invoice-field-color-evidence
 * Unresolved field errors MUST override green verification. Empty OCR flags MUST NOT make fields
 * green; success requires final human confirmation or a server-reviewed/committed invoice.
 * Changed OCR checks MUST restore pending counts and field colors and block final approval,
 * including after saving or recovering a draft. Unknown stock outcome or a stale revision
 * MUST suppress that global success state.
 */
/**
 * @cc [owner:nareshshah139,label:product] purchase-inline-catalogue-recovery
 * Catalogue rejections MUST offer in-place name correction, catalogue creation and manual matching
 * to authorized editors. Reviewed bills MUST reopen through the revision-checked API before edits;
 * posted or unknown stock outcomes MUST stay locked. Reopening and corrections MUST clear final approval.
 */
/**
 * @cc [owner:nareshshah139,label:state] purchase-recovery-editor-identities
 * Name correction and manual matching for an invoice line MUST have distinct stable React
 * identities, so rerendering either editor cannot reuse its sibling's local state.
 */
/**
 * @cc [owner:nareshshah139,label:product] purchase-ocr-summary-current-checks
 * Scan-summary warnings MUST reflect unresolved header checks. Confirmed checks MUST disappear
 * from the summary, including after draft recovery, without erasing the original extraction flags.
 */
/**
 * @cc [owner:nareshshah139,label:product;security] purchase-conflict-visible-recovery
 * Recognized save conflicts MUST show their blocker and authorized saved invoice identity and status.
 * Opening the existing invoice MUST retain attempted edits and re-read it before offering corrections.
 */
function PurchaseInvoiceEditor({
  recoveryKey,
  invoiceId,
  recoveryAttemptId,
  recoveryActorId,
  recoverySourceIds,
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
  recoveryAttemptId?: string;
  recoveryActorId?: string;
  recoverySourceIds?: string[];
  receiptId?: string;
  intakeId?: string;
  importedDraft?: any;
  onImported?: () => void;
  onBack?: () => void;
  onInvoice?: (id: string) => void;
  draftKey?: string;
  onNew?: () => void;
}) {
  const { user } = useDashboardUser();
  const {
    permissions: access,
    loading: permissionsLoading,
    error: permissionsError,
  } = usePurchasePermissions(user?.id);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [reviewAccepted, setReviewAccepted] = useState(false);
  const [checkedOcr, setCheckedOcr] = useState<Record<string, PurchaseCheckedFields>>({});
  const [serverDraft, setServerDraft] = useState<any>(null);
  const [serverDrafts, setServerDrafts] = useState<any[]>([]);
  const [workflowReceiptId, setWorkflowReceiptId] = useState("");
  const [receiptOptions, setReceiptOptions] = useState<any[]>([]);
  const [receiptSearch, setReceiptSearch] = useState("");
  const draftRequestKey = useRef("");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [draftServerRevision, setDraftServerRevision] = useState<string | null>(
    null,
  );
  const [revisionChecking, setRevisionChecking] = useState(false);
  const [revisionConflict, setRevisionConflict] = useState<string | null>(null);
  const [unknownStockInvoiceId, setUnknownStockInvoiceId] = useState<
    string | null
  >(recoveryAttemptId ? invoiceId || (importAttemptIdPattern.test(recoveryAttemptId) ? 'unconfirmed-import' : null) : null);
  const [importAttemptId, setImportAttemptId] = useState<string | null>(importAttemptIdPattern.test(recoveryAttemptId || '') ? recoveryAttemptId! : null);
  const [delegatedRecovery, setDelegatedRecovery] = useState({
    attemptId: recoveryAttemptId || '', originalActorId: recoveryActorId || '',
    invoiceId: invoiceId || '', sourceDocumentIds: recoverySourceIds || [], reason: '',
  });
  const [showDelegatedRecovery, setShowDelegatedRecovery] = useState(!!recoveryAttemptId);
  const [rejectedRecoveryReference, setRejectedRecoveryReference] = useState<string | null>(null);
  const [unlinkedRecoveryId, setUnlinkedRecoveryId] = useState<string | null>(null);
  const [rejectedImportId, setRejectedImportId] = useState<string | null>(null);
  const [resolvingImport, setResolvingImport] = useState(false);
  const unknownStockRef = useRef<string | null>(null);
  unknownStockRef.current = unknownStockInvoiceId;
  const importLock = useRef(false);
  const draftWriteBlocked = revisionChecking || !!revisionConflict || !!unknownStockInvoiceId || !!rejectedImportId;
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
  const [manualReviewCandidateId, setManualReviewCandidateId] = useState<
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
  const [masterMatches, setMasterMatches] = useState<MasterMatch[]>([]);
  const [masterConfirming, setMasterConfirming] = useState<string | null>(null);
  const [masterRefreshing, setMasterRefreshing] = useState(false);
  const [reopeningReview, setReopeningReview] = useState(false);
  const [catalogueIssue, setCatalogueIssue] = useState(false);
  const captureCatalogueFailure = (err: unknown) => {
    if ((err as { body?: { code?: string } })?.body?.code === "PURCHASE_CATALOG_REVIEW_REQUIRED") {
      setCatalogueIssue(true);
      setReviewAccepted(false);
    }
  };
  const focusProductMatching = () => requestAnimationFrame(() => {
    const section = document.getElementById("purchase-master-matching");
    section?.focus({ preventScroll: true });
    section?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  });

  const [masterStatuses, setMasterStatuses] = useState<
    Record<number, MasterStatus>
  >({});
  const [recent, setRecent] = useState<PurchaseInvoice[]>([]);
  const [activeInvoice, setActiveInvoice] = useState<PurchaseInvoice | null>(
    null,
  );
  const [recovery, setRecovery] = useState<PurchaseRecovery | null>(null);
  const [comparison, setComparison] = useState<{
    attempt: PurchaseAttempt;
    mode: 'duplicate' | 'stale';
    local: { header: HeaderForm; lines: LineForm[]; amounts: Record<string, unknown> | null; flags: string };
    saved: PurchaseInvoice;
  } | null>(null);
  const [pendingMismatch, setPendingMismatch] = useState<{
    attempt: PurchaseAttempt; match: MasterMatch; candidate: MasterCandidate; line: LineForm; mismatches: string[]; reference?: string;
  } | null>(null);
  const editorGeneration = useRef(0);
  const comparisonRequest = useRef(0);
  const matchRequest = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const captureAttempt = (): PurchaseAttempt => Object.freeze({ generation: editorGeneration.current, scope: recoveryKey || 'purchase', invoiceId: editingId || activeInvoice?.id, revision: draftServerRevision || undefined, lineKeys: Object.freeze(lines.map(line => line.localId)) });
  const attemptCurrent = (attempt: PurchaseAttempt) => mounted.current && attempt.generation === editorGeneration.current;
  const invalidatePending = () => {
    editorGeneration.current += 1;
    comparisonRequest.current += 1;
    matchRequest.current += 1;
    setPendingMismatch(null);
    setComparison(null);
    setRecovery(null);
    setReviewAccepted(false);
  };
  const captureRecovery = (err: unknown, attempt: PurchaseAttempt) => {
    if (!attemptCurrent(attempt)) return;
    setRecovery(purchaseRecovery(err, attempt));
    setError(getErrorMessage(err));
  };
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
  const currentHeaderFlags = useMemo(() => pendingPurchaseOcrFlags(splitFlags(headerFlags) || [], header, checkedOcr.header), [headerFlags, header, checkedOcr]);
  const currentLineFlags = useMemo(() => lines.map((line, index) => pendingPurchaseOcrFlags(splitFlags(line.ocrFlags) || [], line, checkedOcr[line.localId], index)), [lines, checkedOcr]);
  const pendingHeaderFlags = currentHeaderFlags.join(", ");
  const linesWithPendingChecks = useMemo(() => lines.map((line, index) => ({ ...line, ocrFlags: currentLineFlags[index].join(", ") })), [lines, currentLineFlags]);
  const rememberOcrCheck = (scope: string, checked: PurchaseCheckedFields) => {
    setReviewAccepted(false);
    setCheckedOcr(current => ({ ...current, [scope]: checked }));
  };
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
        setUnknownStockInvoiceId(saved.unknownStockInvoiceId || null);
        setImportAttemptId(saved.importAttemptId || null);
        if (saved.delegatedRecovery) setDelegatedRecovery(saved.delegatedRecovery);
        else if (saved.importAttemptId) setDelegatedRecovery({ attemptId: saved.importAttemptId,
          originalActorId: user?.id || '', invoiceId: saved.unknownStockInvoiceId === 'unconfirmed-import' ? '' : saved.unknownStockInvoiceId || '',
          sourceDocumentIds: saved.additionalSourceIds || [], reason: '' });
        setUnlinkedRecoveryId(saved.unlinkedRecoveryId || null);
        setRejectedImportId(saved.rejectedImportId || null);
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
          setNotice("Restored your unfinished purchase draft from this tab. Save Draft stores it on the server.");
        }
      }
    } catch {
      setRecoveryError(
        "Draft recovery is unavailable in this browser. Keep this tab open until Save Draft succeeds.",
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
          unknownStockInvoiceId,
          importAttemptId,
          delegatedRecovery,
          unlinkedRecoveryId,
          rejectedImportId,
          header,
          lines: linesWithPendingChecks,
          editingId,
          draftServerRevision,
          headerFlags: pendingHeaderFlags,
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
        "Draft recovery is unavailable in this browser. Keep this tab open until Save Draft succeeds.",
      );
    }
  }, [
    recoveryKey,
    recoveryReady,
    unknownStockInvoiceId,
    importAttemptId,
    delegatedRecovery,
    unlinkedRecoveryId,
    rejectedImportId,
    header,
    linesWithPendingChecks,
    editingId,
    pendingHeaderFlags,
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
    invalidatePending();
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
    invalidatePending();
    setManualReviewCandidateId(null);
    setReviewAccepted(false);
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
    invalidatePending();
    setManualReviewCandidateId(null);
    setReviewAccepted(false);
    setLines((current) => [...current, emptyLine(current.length + 1)]);
  };

  const removeLine = (localId: string) => {
    invalidatePending();
    setManualReviewCandidateId(null);
    if (lines.length <= 1) return;
    setReviewAccepted(false);
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
    invalidatePending();
    setCheckedOcr({});
    setShowIntakeHome(false);
    setManualEntry(false);
    setManualReviewCandidateId(null);
    setActiveInvoice(null);
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
    invalidatePending();
    setCheckedOcr({});
    setReviewAccepted(false);
    const defaults = defaultHeader();
    setShowIntakeHome(false);
    setManualReviewCandidateId(null);
    setActiveInvoice(null);
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
    setMasterMatches(matches?.matches || []);
    setMasterStatuses({});
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
    invalidatePending();
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

  const refreshMasterMatches = async (sourceLines: LineForm[] = lines) => {
    if (!access.create) return;
    invalidatePending();
    const attempt = captureAttempt();
    setMasterRefreshing(true);
    setError(null);
    try {
      const response =
        await apiClient.suggestPharmacyPurchaseMasterMatches<MasterMatchResponse>(
          {
            items: sourceLines.map(linePayload),
          },
        );
      if (!attemptCurrent(attempt)) return;
      setMasterMatches(response.matches || []);
      setMasterStatuses({});
      setNotice(
        `Refreshed drug master suggestions for ${sourceLines.length} line${sourceLines.length === 1 ? "" : "s"}.`,
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
   */
  const confirmMasterLine = async (
    match: MasterMatch,
    action: "MATCH_EXISTING" | "CREATE_NEW",
    candidate?: MasterCandidate,
    catalog?: PurchaseProductCatalog,
    acknowledgement?: PurchaseAttempt,
  ): Promise<string | undefined> => {
    if (!access.create || (acknowledgement && !attemptCurrent(acknowledgement))) return;
    const attempt = acknowledgement || captureAttempt();
    const request = ++matchRequest.current;
    const line = lines[match.lineIndex];
    if (!line) {
      setError(
        "The purchase line was removed. Refresh drug master suggestions.",
      );
      return;
    }

    if (action === "CREATE_NEW" && !access.catalogDetails)
      return "Product details are not available yet. Reload after the update completes.";
    const key = `${match.lineIndex}:${action}`;
    setMasterConfirming(key);
    setNotice(null);
    setError(null);
    try {
      const payload = {
            action,
            drugId: candidate?.drug.id,
            catalog,
            item: linePayload(line),
            ...(acknowledgement ? { mismatchAcknowledged: true } : {}),
          };
      let response: MasterConfirmationResponse;
      try {
        response = await apiClient.confirmPharmacyPurchaseMaster<MasterConfirmationResponse>(payload);
      } catch (err) {
        const conflict = err as { status?: number; body?: { code?: string; mismatches?: string[] } };
        if (action !== "MATCH_EXISTING" || conflict.status !== 409 || conflict.body?.code !== "PURCHASE_PRODUCT_MISMATCH") throw err;
        if (!attemptCurrent(attempt) || request !== matchRequest.current || !candidate) return;
        setPendingMismatch({ attempt, reference: purchaseRecovery(err, attempt).reference, match: structuredClone(match), candidate: structuredClone(candidate), line: { ...line }, mismatches: Array.isArray(conflict.body.mismatches) ? conflict.body.mismatches.filter(value => typeof value === 'string') : [] });
        return;

      }
      if (!attemptCurrent(attempt) || request !== matchRequest.current) return;
      setPendingMismatch(null);
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
      captureRecovery(err, attempt);
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
    if (invoice?.status === "STOCK_COMMITTED" && invoice.stockCommittedAt) {
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
    } else if (invoice && (outcome?.status === "SAVED_FOR_REVIEW" || outcome?.status === "STOCK_COMMITTED")) {
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
    if (!access.automate || processLock.current || draftWriteBlocked) return;
    processLock.current = true;
    const attempt = captureAttempt();
    setProcessing(true);
    let targetInvoiceId = activeInvoice?.id;
    setManualReviewCandidateId(null);
    setError(null);
    setNotice(null);
    try {
      if (reviewAccepted && canReview && access.commit) {
        await reviewAndCommit();
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
      setUnknownStockInvoiceId(targetInvoiceId);
      const result =
        await apiClient.processPharmacyPurchaseInvoice<OcrExtractionResponse>(
          targetInvoiceId,
        );
      if (!attemptCurrent(attempt)) return;
      if (
        result.invoice?.id !== targetInvoiceId ||
        !result.automation?.status
      ) {
        throw new Error(
          "Processing did not return a confirmed invoice status. Checking the saved record.",
        );
      }
      const confirmed = await refreshStockStatus(targetInvoiceId);
      if (!confirmed) return;
      applyAutomationResult({ ...result, invoice: confirmed });
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
          `Invoice ${savedForReview.invoiceNumber} saved. Automatic intake needs a human review; check the original, confirm the review below, then choose Save & Process.`,
        );
      }
    } catch (err) {
      if (!attemptCurrent(attempt)) return;
      setError(getErrorMessage(err));
      if (targetInvoiceId) await refreshStockStatus(targetInvoiceId);
    } finally {
      processLock.current = false;
      setProcessing(false);
      focusActionFeedback();
    }
  };

  /**
   * @cc [owner:nareshshah139,label:state] import-outcome-authoritative-recovery
   * An unknown import MUST stay locked until its matching durable attempt is fenced with no
   * stock, or its exact saved invoice is read back. Failed or mismatched resolution MUST not unlock.
   */
  const acceptImportOutcome = async (result: any, expectedId: string) => {
    if (result?.attemptId !== expectedId) throw new Error('Import recovery returned a different attempt. Keep this purchase locked.');
    if (result.outcome === 'RETRY_REJECTED' && result.stockOutcome === 'UNVERIFIED') {
      setRejectedImportId(expectedId);
      setUnknownStockInvoiceId(result.invoiceId || 'unconfirmed-import');
      setError(null);
      setNotice('Further intake rejected. Historical stock remains unverified. Use Counts & audit to reconcile physical inventory.');
      return true;
    }
    if (result.outcome === 'NO_STOCK_WRITTEN' && result.invoiceId === null) {
      const retained = result.retained;
      if (retained?.sourceDocument || retained?.sourceDocuments?.[0]) setSourceDocument(retained.sourceDocument || retained.sourceDocuments[0]);
      if (Array.isArray(retained?.sourceDocuments)) setAdditionalSourceIds(retained.sourceDocuments.map((document: OriginalDocument) => document.id));
      if (retained?.draft && !editingId) applyExtractedDraft(retained.draft, retained.extraction, retained.masterMatches);
      setUnknownStockInvoiceId(null);
      setImportAttemptId(null);
      setRevisionConflict(null);
      setShowIntakeHome(false);
      setManualEntry(true);
      setError(null);
      setNotice(result.message || 'This import is stopped. It created no invoice or stock. Retry with a new attempt, enter the complete invoice manually, or reject the upload.');
      return true;
    }
    if (['DRAFT_SAVED', 'STOCK_COMMITTED'].includes(result.outcome) && typeof result.invoiceId === 'string' && result.invoiceId) {
      const invoice = await refreshStockStatus(result.invoiceId);
      if (!invoice) return false;
      setImportAttemptId(null);
      if (!invoice.stockCommittedAt && invoice.status !== 'STOCK_COMMITTED') editSavedDraft(invoice);
      return true;
    }
    throw new Error('This import outcome is still unverified. Resolve it again before another stock operation.');
  };

  /**
   * @cc [owner:nareshshah139,label:state] delegated-recovery-durable-reference
   * Delegated recovery MUST persist the attempt and original reference before dispatch and keep
   * intake locked on failure or mismatched response. It MUST require read/create/review access;
   * a matching terminal outcome or exact saved invoice readback alone MAY unlock intake.
   */
  const recoverDelegatedImport = async () => {
    if (resolvingImport || !access.read || !access.create || !access.review) return;
    const id = delegatedRecovery.attemptId.trim();
    const reason = delegatedRecovery.reason.trim();
    if (!importAttemptIdPattern.test(id)) { setError('Enter a valid import attempt ID from the handoff.'); return; }
    if (!reason) { setError('Enter a recovery reason.'); return; }
    if (unknownStockInvoiceId && importAttemptId !== id) {
      setError('Recover the current unknown purchase before opening a different import attempt.'); return;
    }
    const attempt = captureAttempt();
    const reference = { ...delegatedRecovery, attemptId: id, reason,
      originalActorId: delegatedRecovery.originalActorId.trim(),
      invoiceId: delegatedRecovery.invoiceId.trim(),
      sourceDocumentIds: [...new Set([...delegatedRecovery.sourceDocumentIds, sourceDocument?.id, ...additionalSourceIds].filter((value): value is string => !!value))],
    };
    setResolvingImport(true);
    try {
      if (!recoveryKey) throw new Error('Sign in before recovering this import.');
      const unknownInvoice = reference.invoiceId || 'unconfirmed-import';
      const stored = JSON.parse(sessionStorage.getItem(recoveryKey) || '{}');
      sessionStorage.setItem(recoveryKey, JSON.stringify({ ...stored, version: 1, header, lines,
        unknownStockInvoiceId: unknownInvoice, importAttemptId: id, delegatedRecovery: reference }));
      setDelegatedRecovery(reference);
      setRejectedRecoveryReference(null);
      setImportAttemptId(id);
      setUnknownStockInvoiceId(unknownInvoice);
      setShowIntakeHome(false);
      const result = await apiClient.post('/pharmacy/purchase-invoices/ocr/recover-delegated', {
        attemptId: id, reason, ...(reference.originalActorId ? { originalActorId: reference.originalActorId } : {}),
        ...(reference.invoiceId ? { invoiceId: reference.invoiceId } : {}), sourceDocumentIds: reference.sourceDocumentIds,
      });
      if (attemptCurrent(attempt) && await acceptImportOutcome(result, id)) setShowDelegatedRecovery(false);
    } catch (err) {
      if (attemptCurrent(attempt)) {
        setError(getErrorMessage(err));
        if ([400, 404, 409].includes((err as { status?: number })?.status || 0)) setRejectedRecoveryReference(id);
      }
    }
    finally { setResolvingImport(false); }
  };

  const resolveInterruptedImport = async () => {
    if (!importAttemptId || resolvingImport || !access.create) return;
    const attempt = captureAttempt();
    const id = importAttemptId;
    setResolvingImport(true);
    try {
      const result = await apiClient.post(`/pharmacy/purchase-invoices/ocr/import-attempts/${encodeURIComponent(id)}/resolve`, {});
      if (attemptCurrent(attempt)) await acceptImportOutcome(result, id);
    } catch (err) { if (attemptCurrent(attempt)) setError(getErrorMessage(err)); }
    finally { setResolvingImport(false); }
  };

  /**
   * @cc [owner:nareshshah139,label:state] unlinked-recovery-keeps-stock-unknown
   * Legacy/missing-link recovery MUST persist its identity before dispatch. RETRY_REJECTED
   * MUST keep intake locked, retain the draft, and offer physical reconciliation without claiming no stock.
   */
  const recoverUnlinkedImport = async () => {
    if (!unknownStockInvoiceId || resolvingImport || !access.create || !access.read || !access.review) return;
    const reason = window.prompt('Explain the interrupted import. If no exact saved invoice can be recovered, further intake will be rejected and physical stock must be reconciled.');
    if (!reason?.trim()) return;
    const attempt = captureAttempt();
    setResolvingImport(true);
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
      const id = importAttemptId || unlinkedRecoveryId || `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
      if (!recoveryKey) throw new Error('Sign in before recovering this import.');
      const stored = JSON.parse(sessionStorage.getItem(recoveryKey) || '{}');
      sessionStorage.setItem(recoveryKey, JSON.stringify({ ...stored, version: 1, header, lines,
        unknownStockInvoiceId, unlinkedRecoveryId: id }));
      setUnlinkedRecoveryId(id);
      const result = await apiClient.post('/pharmacy/purchase-invoices/ocr/recover-unlinked', {
        recoveryId: id, legacy: !importAttemptId, reason: reason.trim(),
        ...(unknownStockInvoiceId !== 'unconfirmed-import' ? { invoiceId: unknownStockInvoiceId } : {}),
        sourceDocumentIds: [...new Set([sourceDocument?.id, ...additionalSourceIds].filter(Boolean))],
      });
      if (attemptCurrent(attempt)) await acceptImportOutcome(result, id);
    } catch (err) { if (attemptCurrent(attempt)) setError(getErrorMessage(err)); }
    finally { setResolvingImport(false); }
  };

  /**
   * @cc [owner:nareshshah139,label:state;product] purchase-import-outcome-unknown
   * Automatic import MUST persist its new attempt and current actor/source reference together
   * and lock further writes before dispatch. A lost or malformed response MUST
   * retain that lock and offer attempt resolution; only a matching fenced no-stock outcome, an
   * explicit no-stock response, or a verified saved invoice MAY clear it.
   */
  const extractFromInvoiceFile = async (automate = false) => {
    if (!access.create || importLock.current || unknownStockRef.current || (automate && !access.automate)) return;
    if (!ocrFile) {
      setError("Choose an invoice PDF or image first");
      return;
    }

    importLock.current = true;
    let attempt = captureAttempt();
    let dispatchedAttemptId: string | null = null;
    let automaticDispatched = false;
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
      if (automate) {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
        dispatchedAttemptId = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
        // Persist before dispatch, so reload and a lost response keep the same recovery identity.
        if (!recoveryKey) throw new Error('Sign in before importing stock.');
        const stored = JSON.parse(sessionStorage.getItem(recoveryKey) || '{}');
        const nextRecovery = { attemptId: dispatchedAttemptId, originalActorId: user?.id || '', invoiceId: '', sourceDocumentIds: [], reason: '' };
        sessionStorage.setItem(recoveryKey, JSON.stringify({ ...stored, version: 1, header, lines,
          importAttemptId: dispatchedAttemptId, delegatedRecovery: nextRecovery, unknownStockInvoiceId: 'unconfirmed-import' }));
        form.append('attemptId', dispatchedAttemptId);
        setImportAttemptId(dispatchedAttemptId);
        setDelegatedRecovery(nextRecovery);
        setUnknownStockInvoiceId('unconfirmed-import'); setShowIntakeHome(false);
      }
      automaticDispatched = automate;
      const response = await fetch(
        `/api/pharmacy/purchase-invoices/ocr/${ocrFiles.length > 1 ? "pages/" : ""}${automate ? "import" : "extract"}`,
        {
          method: "POST",
          body: form,
          credentials: "include",
        },
      );

      if (!attemptCurrent(attempt)) return;
      if (response.status === 401 && typeof window !== "undefined") {
        const next = window.location.pathname + window.location.search;
        window.location.href = `/login?next=${encodeURIComponent(next)}`;
        return;
      }

      if (!response.ok) {
        let message = `Invoice OCR failed (${response.status})`;
        try {
          const body = await response.json();
          if (!attemptCurrent(attempt)) return;
          if (body?.sourceDocument) {
            if (!automate) { resetDraft(); attempt = captureAttempt(); }
            setSourceDocument(body.sourceDocument);
            if (!automate) setNotice(
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
      if (!attemptCurrent(attempt)) return;
      const importOutcome = (data as any)?.importAttempt;
      if (automate && importOutcome && dispatchedAttemptId) {
        if ((data as any).sourceDocument) setSourceDocument((data as any).sourceDocument);
        await acceptImportOutcome(importOutcome, dispatchedAttemptId);
        return;
      }
      const draft = data?.draft;
      if (!draft) {
        throw new Error("No purchase invoice draft was extracted");
      }

      applyExtractedDraft(draft, data.extraction, data.masterMatches);
      attempt = captureAttempt();
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
        if (data.automation?.status === "DUPLICATE" && data.invoice?.id) {
          setUnknownStockInvoiceId(null);
          setRecovery(purchaseRecovery({ body: { code: 'PURCHASE_DUPLICATE_INVOICE', existingInvoiceId: data.invoice.id, existingInvoice: data.invoice, message: 'This invoice is already saved. Compare it before applying corrections. Your extracted entry and original are kept here.' } }, captureAttempt()));
          setNotice(null);
          return;
        }
        if (data.automation?.status === "NOT_SAVED") { setUnknownStockInvoiceId(null); applyAutomationResult(data); return; }
        if (!data.invoice?.id) {
          setUnknownStockInvoiceId("unconfirmed-import");
          setError("The saved invoice identity could not be confirmed. Check the invoice register before another import.");
          return;
        }
        const confirmed = await refreshStockStatus(data.invoice.id);
        if (!confirmed) return;
        applyAutomationResult({ ...data, invoice: confirmed });
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
      if (!attemptCurrent(attempt)) return;
      if (automaticDispatched && dispatchedAttemptId) {
        setUnknownStockInvoiceId("unconfirmed-import");
        setShowIntakeHome(false);
        setNotice(null);
        setError(`The automatic import outcome could not be confirmed. ${getErrorMessage(err)} Check the saved purchase with an authorized colleague before another import.`);
      } else setError(getErrorMessage(err) || "Invoice OCR failed. Try another file or enter manually.");
    } finally {
      importLock.current = false;
      setExtracting(false);
      void loadUnlinkedUploads();
    }
  };

  const saveDraft = async () => {
    if (!access.create || saveLock.current || extracting || draftWriteBlocked)
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

    const attempt = captureAttempt();
    saveLock.current = true;
    setSaving(true);
    try {
      const payload = {
        ...preserveInvoiceTotals(
          buildDraftPayload(header, linesWithPendingChecks),
          originalAmounts,
        ),
        expectedUpdatedAt: editingId
          ? draftServerRevision || undefined
          : undefined,
        ocrFlags: currentHeaderFlags,
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
      if (!attemptCurrent(attempt)) return;
      setRecovery(null);
      if (serverDraft) {
        try {
          await apiClient.post("/inventory/workspace/intake", {
            ...serverDraft,
            invoiceId: created.id,
          });
          setServerDraft(null);
        } catch {}
      }
      if (!attemptCurrent(attempt)) return;
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
      if (!attemptCurrent(attempt)) return;
      const message = getErrorMessage(err);
      captureRecovery(err, attempt);
      if (
        editingId &&
        /changed|stale|no longer an editable draft/i.test(message)
      ) {
        setRevisionConflict(
          "The saved invoice changed while you were editing. Your corrections are retained. Compare with the saved version before saving or adding stock.",
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
    const attempt = captureAttempt();
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
            expectedUpdatedAt: invoiceToReview.updatedAt,
            goodsReceivedDate: reviewDate,
            handwrittenNotes: invoiceToReview.handwrittenNotes || undefined,
          },
        );
      if (!attemptCurrent(attempt)) return;
      setRecovery(null);
      setActiveInvoice(reviewed);
      setNotice(`Purchase invoice ${reviewed.invoiceNumber} marked reviewed.`);
      await loadRecent();
    } catch (err) {
      captureRecovery(err, attempt);
      captureCatalogueFailure(err);
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


  const commitStock = async () => {
    if (!access.commit || !activeInvoice || draftWriteBlocked) return;
    const confirmed = window.confirm(`Commit stock for purchase invoice ${activeInvoice.invoiceNumber}? This updates branch inventory and cannot be undone from this screen.`);
    if (!confirmed) return;
    const id = activeInvoice.id;
    const attempt = captureAttempt();
    setNotice(null);
    setError(null);
    setCommitting(true);
    setUnknownStockInvoiceId(id);
    try {
      await apiClient.commitPharmacyPurchaseInvoiceStock<PurchaseInvoice>(id);
    } catch (err) {
      captureRecovery(err, attempt);
      captureCatalogueFailure(err);
    } finally {
      if (attemptCurrent(attempt)) await refreshStockStatus(id);
      setCommitting(false);
      focusActionFeedback();
    }
  };

  const refreshStockStatus = async (invoiceId: string) => {
    const attempt = captureAttempt();
    setRefreshingStockStatus(true);
    setUnknownStockInvoiceId(invoiceId);
    try {
      if (!access.read) throw new Error("Invoice read permission is required");
      const invoice =
        await apiClient.getPharmacyPurchaseInvoiceById<PurchaseInvoice>(
          invoiceId,
        );
      if (!attemptCurrent(attempt)) return;
      if (!isPurchaseReadback(invoice, invoiceId))
        throw new Error("The saved invoice status could not be verified");
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
        setRecovery(null);
        setError(null);
        setNotice(
          `Stock added for ${invoice.invoiceNumber}. The saved record confirms the operation completed.`,
        );
        window.dispatchEvent(new CustomEvent("pharmacy-dashboard-refresh"));
      }
      return invoice;
    } catch {
      setNotice(null);
      // A lost response can hide a successful stock commit. Keep the outcome
      // unknown until a read succeeds; never infer it from stale editor state.
    } finally {
      setRefreshingStockStatus(false);
    }
  };

  const editSavedDraft = (invoice: PurchaseInvoice) => {
    invalidatePending();
    setCatalogueIssue(false);
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

  const openProductRecovery = async () => {
    if (!access.create || busy || savedFormLocked || draftWriteBlocked) return;
    setShowIntakeHome(false);
    setManualEntry(true);
    await refreshMasterMatches();
    focusProductMatching();
  };

  const reopenReviewedInvoice = async () => {
    if (!canReopenReview || !activeInvoice?.updatedAt || busy) return;
    setReopeningReview(true);
    setError(null);
    setNotice(null);
    try {
      const reopened = await apiClient.reopenPharmacyPurchaseInvoiceReview<PurchaseInvoice>(activeInvoice.id, activeInvoice.updatedAt);
      if (reopened?.id !== activeInvoice.id || reopened.status !== "DRAFT" || reopened.stockCommittedAt || !reopened.updatedAt || !Array.isArray(reopened.items)) {
        throw new Error("The reopened invoice could not be confirmed. Reload the saved invoice.");
      }
      editSavedDraft(reopened);
      setShowIntakeHome(false);
      setManualEntry(true);
      setCatalogueIssue(false);
      await refreshMasterMatches(reopened.items.map((item, index) => lineFromExtracted(item as unknown as ExtractedPurchaseLine, index)));
      setNotice("Review reopened. Correct the products here, save your corrections, then review again before adding stock.");
      focusProductMatching();
    } catch (err) {
      setError(getErrorMessage(err));
      setRevisionConflict("Reopening was not confirmed. Reload the saved invoice before editing or adding stock.");
      focusActionFeedback();
    } finally {
      setReopeningReview(false);
    }
  };

  const saveIncompleteDraft = async () => {
    if (!access.create || saving || draftWriteBlocked) return;
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
          lines: linesWithPendingChecks,
          editingId,
          draftServerRevision,
          headerFlags: pendingHeaderFlags,
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
    if (importLock.current || processLock.current || unknownStockRef.current) return;
    invalidatePending();
    setCheckedOcr({});
    setReviewAccepted(false);
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
   * explicit comparison choice adopts the saved revision. Background list reads MUST NOT advance this baseline.
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
        "Your local corrections are retained, but the saved invoice changed or its earlier version cannot be verified. Compare with the saved version before saving or adding stock.",
      );
      setReviewAccepted(false);
    } else setRevisionConflict(null);
  };
  /**
   * @cc [owner:nareshshah139,label:state] purchase-comparison-preserves-local
   * Reading a comparison MUST NOT replace fields or advance the saved revision. Only an explicit choice MAY adopt the compared record; local corrections MUST retain the selected saved identity and original receipt/document links.
   */
  const compareSavedInvoice = async (id: string, mode: 'duplicate' | 'stale') => {
    if (!access.read || unknownStockInvoiceId) return;
    const request = ++comparisonRequest.current;
    const attempt = captureAttempt();
    const local = structuredClone({ header, lines, amounts: originalAmounts, flags: headerFlags });
    setRevisionChecking(true);
    try {
      const saved = await apiClient.getPharmacyPurchaseInvoiceById<PurchaseInvoice>(id);
      if (!attemptCurrent(attempt) || request !== comparisonRequest.current) return;
      if (!isPurchaseReadback(saved, id)) throw new Error('The saved invoice could not be verified. Your corrections are retained.');
      setComparison({ attempt, mode, local, saved: structuredClone(saved) });
    } catch (err) {
      captureRecovery(err, attempt);
    } finally {
      if (mounted.current) setRevisionChecking(false);
    }
  };
  const reloadSavedInvoice = async () => {
    const id = editingId || invoiceId || activeInvoice?.id;
    if (id) await compareSavedInvoice(id, 'stale');
  };
  const adoptComparison = async (keepLocal: boolean) => {
    if (!comparison || unknownStockInvoiceId || !attemptCurrent(comparison.attempt)) return;
    const { local, attempt } = comparison;
    let saved = comparison.saved;
    if (keepLocal && !access.create) return;
    if (keepLocal && saved.status === 'REVIEWED' && access.reopenReview && access.review && saved.updatedAt) {
      setReopeningReview(true);
      try {
        saved = await apiClient.reopenPharmacyPurchaseInvoiceReview<PurchaseInvoice>(saved.id, saved.updatedAt);
        if (!attemptCurrent(attempt) || !isPurchaseReadback(saved, comparison.saved.id)) return;
      } catch (err) { captureRecovery(err, attempt); return; }
      finally { setReopeningReview(false); }
    }
    if (keepLocal && !canCorrectPurchase(saved)) return;
    editSavedDraft(saved);
    if (keepLocal) {
      setHeader({ ...local.header, invoiceNumber: saved.invoiceNumber, distributorGstin: saved.distributorGstin, distributorName: saved.distributorName, source: saved.source as SourceType || 'MANUAL' });
      setLines(local.lines.map(line => ({ ...line, ocrSourceRef: undefined })));
      setOriginalAmounts(local.amounts);
      setHeaderFlags(local.flags);
      setCheckedOcr({});
      setReviewDate(local.header.goodsReceivedDate);
      setNotice('Your corrections are ready on the selected invoice. Save corrections and check again before completing review.');
    } else setNotice('Saved values selected. Check this invoice before making further changes.');
    setComparison(null);
    setRecovery(null);
    setError(null);
  };
  const copyHandoff = async () => {
    const id = recovery?.attempt.invoiceId || activeInvoice?.id || (unknownStockInvoiceId !== 'unconfirmed-import' ? unknownStockInvoiceId : null) || delegatedRecovery.invoiceId;
    const attemptId = importAttemptId || unlinkedRecoveryId || rejectedImportId || delegatedRecovery.attemptId;
    const ownerId = delegatedRecovery.originalActorId || (!recoveryAttemptId && (importAttemptId || unlinkedRecoveryId || rejectedImportId) ? user?.id : undefined);
    const sourceIds = [...new Set([...delegatedRecovery.sourceDocumentIds, sourceDocument?.id, ...additionalSourceIds].filter((value): value is string => !!value))];
    const params = new URLSearchParams({ area: 'purchases', view: 'intake' });
    if (id) params.set('invoice', id);
    if (attemptId) params.set('attempt', attemptId);
    if (ownerId) params.set('actor', ownerId);
    if (sourceIds.length) params.set('sources', sourceIds.join(','));
    const invoiceLink = `${window.location.origin}/dashboard/inventory?${params.toString()}`;
    const text = [`Purchase ${header.invoiceNumber || activeInvoice?.invoiceNumber || 'draft'}`, invoiceLink,
      attemptId ? `Import attempt: ${attemptId}` : '', ownerId ? `Original operator: ${ownerId}` : '',
      id ? `Exact invoice: ${id}` : '', sourceIds.length ? `Original documents: ${sourceIds.join(', ')}` : '',
      recovery?.message || error || 'A colleague with purchase read, create and review access can open this link to recover the import.',
      recovery?.reference ? `Reference: ${recovery.reference}` : ''].filter(Boolean).join('\n');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setNotice('Handoff details copied.');
    } catch { setError(`Could not copy. Select and copy these details instead:\n${text}`); }
  };
  useEffect(() => {
    if (!access.read || !recoveryReady || importAttemptIdPattern.test(recoveryAttemptId || '')) return;
    const id = recoveredInvoiceId.current || invoiceId;
    if (!id) return;
    let cancelled = false;
    setRevisionChecking(true);
    apiClient
      .getPharmacyPurchaseInvoiceById<PurchaseInvoice>(id)
      .then((invoice) => {
        if (cancelled || (unknownStockRef.current && unknownStockRef.current !== id)) return;
        if (!isPurchaseReadback(invoice, id))
          throw new Error("The saved invoice was not returned with a verifiable status.");
        setUnknownStockInvoiceId(null);
        if (recoveredInvoiceId.current === invoice.id)
          acceptRecoveredInvoice(invoice, recoveredRevision.current);
        else editSavedDraft(invoice);
        setShowIntakeHome(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err));
        setUnknownStockInvoiceId(id);
        setShowIntakeHome(false);
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
  }, [access.read, invoiceId, recoveryReady, recoveryAttemptId]);
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
  const reviewAndCommit = async () => {
    if (
      !activeInvoice ||
      !access.review ||
      !access.commit ||
      !reviewAccepted ||
      draftWriteBlocked
    )
      return;
    const attempt = captureAttempt();
    let stockAttempted = false;
    const id = activeInvoice.id;
    setReviewing(true);
    setError(null);
    try {
      const saved =
        editingId === activeInvoice.id ? await saveDraft() : activeInvoice;
      if (!saved) return;
      await apiClient.reviewPharmacyPurchaseInvoice(saved.id, {
        expectedUpdatedAt: saved.updatedAt,
        goodsReceivedDate: reviewDate,
        handwrittenNotes: saved.handwrittenNotes || undefined,
      });
      if (!attemptCurrent(attempt)) return;
      stockAttempted = true;
      setUnknownStockInvoiceId(id);
      await apiClient.commitPharmacyPurchaseInvoiceStock<PurchaseInvoice>(id);
    } catch (err) {
      captureRecovery(err, attempt);
      captureCatalogueFailure(err);

    } finally {
      if (stockAttempted && attemptCurrent(attempt)) await refreshStockStatus(id);
      setReviewing(false);
      focusActionFeedback();
    }
  };

  useEffect(() => {
    if (importedDraft?.draft && !importLock.current && !processLock.current && !unknownStockRef.current) {
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
  const busy =
    saving ||
    extracting ||
    processing ||
    reviewing ||
    committing ||
    refreshingStockStatus ||
    reopeningReview ||
    savingSupplier ||
    masterConfirming !== null ||
    masterRefreshing;
  const stockStatusUnknown = !!unknownStockInvoiceId;
  const stockAdded = !stockStatusUnknown &&
    (activeInvoice?.status === "STOCK_COMMITTED" || !!activeInvoice?.stockCommittedAt);
  const stockReceivedEarlier =
    stockAdded && !!(activeInvoice?.workflowReceiptId || workflowReceiptId);
  const committedLabel = stockReceivedEarlier
    ? "Invoice posted · stock received earlier"
    : "Stock added";
  const activeIssues = purchaseBlockingIssues(
    activeInvoice?.reconciliationIssues || [],
  );
  const activeOcrFlags = activeInvoice?.unresolvedOcrFlags || 0;
  const historicalStockHold = activeIssues.some(issue => purchaseReviewIssue(issue).category === "historical");
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
      (!currentHeaderFlags.length &&
        currentLineFlags.every(flags => !flags.length))) &&
    !!reviewDate;
  const canCommit =
    access.commit &&
    activeInvoice?.status === "REVIEWED" &&
    !stockStatusUnknown &&
    !draftWriteBlocked;
  const canReopenReview =
    access.create && access.review && access.reopenReview &&
    activeInvoice?.status === "REVIEWED" && !!activeInvoice.updatedAt &&
    !stockAdded && !stockStatusUnknown && !draftWriteBlocked;
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
  const flaggedFields = new Set([
    ...currentHeaderFlags.map(flag => purchaseReviewIssue(flag)),
    ...currentLineFlags.flatMap((flags, index) => flags.map(flag => purchaseReviewIssue(flag, index))),
  ].filter(issue => issue.field).map(issue => `${issue.lineIndex ?? "header"}:${issue.field}`));
  const otherReviewIssues = uniquePurchaseReviewIssues([
    ...activeIssues,
    ...missingStockFields.filter(raw => {
      const issue = purchaseReviewIssue(raw);
      return !flaggedFields.has(`${issue.lineIndex ?? "header"}:${issue.field}`);
    }),
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
  // Evidence wins over a previous confirmation: unresolved corrections stay red or amber.
  const fieldTones: Record<string, ReviewTone> = {};
  const invoiceVerified = !stockStatusUnknown && !draftWriteBlocked &&
    ((reviewAccepted && confirmationCount === 0) || activeInvoice?.status === "REVIEWED" || stockAdded);
  if (invoiceVerified) sourceTargets.forEach(target => { fieldTones[target.id] = "success"; });
  const markField = (issue: ReturnType<typeof purchaseReviewIssue>, tone: ReviewTone) => {
    if (!issue.target) return;
    const lineId = issue.lineIndex === undefined ? undefined : lines[issue.lineIndex]?.localId;
    const id = lineId && issue.field ? `${lineId}-${issue.target}` : issue.target;
    if (fieldTones[id] !== "error") fieldTones[id] = tone;
    if (issue.field === "expiryMonth" && lineId) fieldTones[`${lineId}-expiry-year`] = tone;
  };
  if (editingChecks) {
    currentHeaderFlags.forEach(flag => { const issue = purchaseReviewIssue(flag); markField(issue, purchaseCheckInvalid(issue, header) ? "error" : "warning"); });
    currentLineFlags.forEach((flags, index) => flags.forEach(flag => { const issue = purchaseReviewIssue(flag, index); markField(issue, purchaseCheckInvalid(issue, lines[index]) ? "error" : "warning"); }));
  }
  correctionIssues.forEach(issue => markField(issue, issue.category === "historical" || issue.category === "manual" ? "warning" : "error"));
  const checkSession = `${previewDocument?.id || "manual"}:${activeInvoice?.id || "new"}`;
  const checksRemaining = confirmationCount + correctionIssues.length + manualConfidenceLines.length;
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
          <PurchaseStatusCue tone={Object.values(fieldTones).includes("error") || correctionIssues.some(issue => issue.category !== "historical") ? "error" : confirmationCount || otherReviewIssues.length || !invoiceVerified ? "warning" : "success"}>
            {editingChecks ? checksRemaining > 0 ? `${checksRemaining} check${checksRemaining === 1 ? "" : "s"} to finish` : invoiceVerified ? "Review confirmed" : "Ready for your final check" : "Open Review issues to continue"}
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
        canEdit={!!access.editSupplier}
        readOnly={!editingChecks}
        disabled={busy}
        nextAction={
          "Save corrections"
        }
        onChange={(distributorName, distributorGstin) => {
          invalidatePending();
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
            key={checkSession}
            flags={currentHeaderFlags}
            checked={checkedOcr.header || {}}
            onChecked={checked => rememberOcrCheck("header", checked)}
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
              key={`${checkSession}:${line.localId}`}
              flags={currentLineFlags[index]}
              checked={checkedOcr[line.localId] || {}}
              onChecked={checked => rememberOcrCheck(line.localId, checked)}
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
        <ul className="space-y-2 text-sm">
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
              <li key={issue.key} className={`space-y-2 rounded-md border p-3 ${reviewColors[issue.category === "historical" ? "warning" : "error"]}`}>
                <div className="flex items-start gap-1"><PurchaseStatusCue tone={issue.category === "historical" ? "warning" : "error"}>{issue.message}</PurchaseStatusCue><PurchaseHelp label={`${issue.lineIndex === undefined ? '' : `Line ${issue.lineIndex + 1} `}${issue.label} correction`}>This check needs a correction and cannot be dismissed with a confirmation.</PurchaseHelp></div>
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
          <p className="text-muted-foreground">Check these products against the bill, then save corrections.</p>
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
      {editingChecks && canReview && access.commit && (
        <div className="flex items-start gap-1 rounded-md border p-4 text-sm">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={reviewAccepted}
              disabled={busy}
              onChange={(e) => setReviewAccepted(e.target.checked)}
            />
            <span>
              <span className="mb-2 block"><ReviewStatus tone={reviewAccepted ? "success" : "warning"}>{reviewAccepted ? "Verified by you" : "Final check needed"}</ReviewStatus></span>
              I verified the invoice against the original. {activeInvoice?.workflowReceiptId || workflowReceiptId ? "I approve posting this bill against the earlier stock receipt." : "I approve adding the received quantities to stock."}
            </span>
          </label>
          <PurchaseHelp label="Final stock review">
            Verify the supplier, product matches, batches, expiry, paid/free quantities and totals against the original before confirming.
          </PurchaseHelp>
        </div>
      )}
      {editingChecks &&
        confirmationCount === 0 &&
        otherReviewIssues.length === 0 && (
          <PurchaseStatusCue tone={reviewAccepted ? "success" : "warning"}>No outstanding OCR checks — compare with the bill</PurchaseStatusCue>
        )}
    </section>
  );

  const recoveryIssues = recovery && (recovery.kind === 'review' || recovery.kind === 'catalogue') ? recovery.issues : correctionIssues;
  const comparisonDifferences = comparison ? purchaseDifferences(
    { header: comparison.local.header, lines: comparison.local.lines },
    { header: Object.fromEntries(Object.entries(comparison.local.header).map(([key]) => [key, ['invoiceDate', 'goodsReceivedDate', 'dueDate'].includes(key) ? dateInputFromIso(comparison.saved[key as keyof PurchaseInvoice] as string) : formString(comparison.saved[key as keyof PurchaseInvoice], defaultHeader()[key as keyof HeaderForm])])), lines: (comparison.saved.items || []).map((line, index) => lineFromExtracted(line as unknown as ExtractedPurchaseLine, index)) },
  ) : [];
  const focusRecoveryIssue = (issue: ReturnType<typeof purchaseReviewIssue>) => {
    const target = purchaseRecoveryTarget(issue, lines.map(line => line.localId));
    if (!target) return;
    setShowIntakeHome(false);
    setManualEntry(true);
    if (issue.category === 'product') void openProductRecovery();
    requestAnimationFrame(() => focusPurchaseField(target));
  };
  const rejectSavedInvoice = async () => {
    if (!activeInvoice?.updatedAt || !access.create || !access.review || busy || draftWriteBlocked) return;
    const reason = window.prompt('Why is this invoice being rejected? Its original and history will be retained.');
    if (!reason?.trim()) return;
    const attempt = captureAttempt();
    setSaving(true);
    try {
      const result = await apiClient.post<PurchaseInvoice>(`/pharmacy/purchase-invoices/${activeInvoice.id}/reject`, { expectedUpdatedAt: activeInvoice.updatedAt, reason: reason.trim() });
      if (!attemptCurrent(attempt)) return;
      if (!isPurchaseReadback(result, activeInvoice.id) || result.status !== 'CANCELLED' || result.stockCommittedAt) throw new Error('Rejection was not confirmed. Reload this invoice.');
      setActiveInvoice(result); setEditingId(null); setError(null); setNotice('Invoice rejected. No stock was added; the original and audit history are retained.');
    } catch (err) { if (attemptCurrent(attempt)) { setError(getErrorMessage(err)); setRevisionConflict('Reload the saved invoice to confirm rejection before continuing.'); } }
    finally { setSaving(false); }
  };

  /**
   * @cc [owner:nareshshah139,label:product] complete-manual-transcription
   * Switching an incomplete reading to manual entry MUST clear extracted values and prior checks,
   * retain originals and any saved invoice identity/revision, and require a new final review.
   */
  const enterCompleteInvoiceManually = () => {
    if (!access.create || busy || draftWriteBlocked || savedFormLocked) return;
    if (!window.confirm('Discard the OCR reading and type every invoice row from the complete original? The original file and any saved invoice identity will be retained.')) return;
    const original = sourceDocument, originals = additionalSourceIds;
    const saved = activeInvoice, id = editingId, revision = draftServerRevision, receipt = workflowReceiptId;
    resetDraft();
    setSourceDocument(original); setAdditionalSourceIds(originals);
    setActiveInvoice(saved); setEditingId(id); setDraftServerRevision(revision); setWorkflowReceiptId(receipt);
    setHeader({ ...defaultHeader(), source: 'MANUAL' });
    setManualEntry(true);
    setNotice('Enter every row from the complete original, including all pages. Final review is required before adding stock.');
  };

  const needsHandoff = !access.read || unknownStockInvoiceId === "unconfirmed-import" || recovery?.kind === 'permission' || recovery?.kind === 'locked' || !access.create || (activeInvoice?.status === 'REVIEWED' ? !access.commit : !access.review);
  const recoveryPanel = !showIntakeHome && (recovery || comparison || pendingMismatch || unknownStockInvoiceId || sourceDocument || (activeInvoice && !stockAdded) || (needsHandoff && !!error)) && (
    <section id="purchase-recovery-panel" aria-labelledby="purchase-recovery-title" className="space-y-4 rounded-md border p-4">
      <h3 id="purchase-recovery-title" className="font-semibold">Finish this purchase</h3>
      {recovery && <p className="text-sm">{recovery.message}</p>}
      {access.read && recovery && (recovery.kind === 'duplicate' || recovery.kind === 'receipt') && recovery.existingInvoice && !comparison && (
        <div className="space-y-1 rounded-md bg-muted p-3 text-sm" aria-label="Existing invoice details">
          <p className="font-medium">Existing invoice: {recovery.existingInvoice.invoiceNumber}</p>
          <p>{recovery.existingInvoice.distributorName}</p>
          <p>Status: {purchaseInvoiceStatusLabel(recovery.existingInvoice)}</p>
        </div>
      )}
      {recovery?.reference && <p className="break-all text-sm">Reference: {recovery.reference}</p>}
      {rejectedImportId && <div className="space-y-2" role="region" aria-label="Rejected uncertain import">
        <p>Further intake rejected. Historical stock remains unverified; this does not mean no stock was posted.</p>
        <p className="break-all text-sm">Recovery reference: {rejectedImportId}</p>
        {sourceDocument && access.read && <OriginalDocumentLink document={sourceDocument} />}
        <a className="text-primary underline" href="/dashboard/inventory?area=stock&view=COUNT">Reconcile physical inventory in Counts &amp; audit</a>
        <p className="text-sm">Keep this invoice out of new intake. Verify physical quantities and product identities, then record an independent checkpoint. Supplier accounting remains separate.</p>
      </div>}
      {unknownStockInvoiceId && !rejectedImportId && <div className="space-y-2">
        <p role="status">Stock status unknown. Check the saved purchase before trying another stock operation.</p>
        {sourceDocument && access.read && <OriginalDocumentLink document={sourceDocument} />}
        {access.create && access.read && access.review && <Button variant="outline" disabled={resolvingImport || extracting} onClick={recoverUnlinkedImport}>Recover legacy or missing invoice</Button>}
        {!(access.create && access.read && access.review) && <p>An authorized colleague with purchase read, create and review access can recover this legacy or missing invoice.</p>}
        {importAttemptId && access.create && <Button variant="outline" disabled={resolvingImport || extracting} onClick={resolveInterruptedImport}>{resolvingImport ? 'Resolving import…' : 'Resolve interrupted import'}</Button>}
        {unknownStockInvoiceId !== "unconfirmed-import" && access.read && <Button variant="outline" disabled={busy} onClick={() => refreshStockStatus(unknownStockInvoiceId)}>Check saved status</Button>}
      </div>}
      {recovery && (recovery.kind === 'duplicate' || recovery.kind === 'receipt') && !comparison && !unknownStockInvoiceId && (
        recovery.existingInvoiceId && access.read ? <Button variant="outline" disabled={busy} onClick={() => compareSavedInvoice(recovery.existingInvoiceId!, 'duplicate')}>Open existing invoice</Button> : <p className="text-sm">An authorized colleague must locate the existing invoice. Your attempted entry is kept here.</p>
      )}
      {recovery?.kind === 'stale' && !comparison && !unknownStockInvoiceId && <Button variant="outline" disabled={busy || !access.read} onClick={reloadSavedInvoice}>Compare with saved version</Button>}
      {comparison && !unknownStockInvoiceId && <div className="space-y-3" aria-label="Compare with saved invoice">
        <h4 className="font-semibold">Compare with saved invoice</h4>
        <p className="text-sm">Your attempted entry is unchanged. Applying corrections keeps the saved invoice number, supplier identity, original documents and inward receipt link. Saved invoice {comparison.saved.invoiceNumber} is {purchaseInvoiceStatusLabel(comparison.saved).toLowerCase()}.</p>
        {comparison.saved.workflowReceiptId && <p className="text-sm">This bill belongs to an inward receipt. Its receipt link stays with this saved bill and stock must not be received again.</p>}
        <p className="text-sm">This loads your corrections for review. Save corrections and check again to save them. Stock is unchanged.</p>
        {comparisonDifferences.length ? <ul className="space-y-2 text-sm">{comparisonDifferences.map((difference, index) => <li key={index} className="grid gap-1 rounded border p-2 sm:grid-cols-3"><strong>{difference.label}</strong><span className="break-words">Your entry: {difference.local}</span><span className="break-words">Saved: {difference.saved}</span></li>)}</ul> : <p className="text-sm">The editable values match.</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => adoptComparison(false)}>Use saved values</Button>
          {access.create && canCorrectPurchase(comparison.saved) && <Button disabled={busy} onClick={() => adoptComparison(true)}>Apply my corrections to this invoice</Button>}
          {access.create && access.review && access.reopenReview && comparison.saved.status === 'REVIEWED' && !comparison.saved.stockCommittedAt && <Button disabled={busy} onClick={() => adoptComparison(true)}>Reopen review and apply my corrections</Button>}
          <Button variant="ghost" disabled={busy} onClick={() => setComparison(null)}>Keep my attempted entry</Button>
        </div>
        {!canCorrectPurchase(comparison.saved) && <p className="text-sm">Reviewed invoices must be reopened before corrections. Posted or cancelled invoices cannot be edited here.</p>}
      </div>}
      {pendingMismatch && !unknownStockInvoiceId && <div className="space-y-3" role="region" aria-label="Compare products">
        <h4 className="font-semibold">These look like different products</h4>
        {pendingMismatch.reference && <p className="break-all text-sm">Reference: {pendingMismatch.reference}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded border p-3"><strong>Invoice product</strong><p>{pendingMismatch.line.productName}</p><p>Pack: {pendingMismatch.line.packSize} · {pendingMismatch.line.packUnitType}</p><p>Kind: {pendingMismatch.line.productKind || 'Not recorded'}</p><p>Manufacturer: {pendingMismatch.line.manufacturer || 'Not recorded'}</p></div>
          <div className="rounded border p-3"><strong>Saved product</strong><p>{pendingMismatch.candidate.drug.name}</p><p>Pack: {pendingMismatch.candidate.drug.packSizeLabel || 'Not recorded'}</p><p>Kind: {pendingMismatch.candidate.drug.productKind || pendingMismatch.candidate.drug.type || 'Not recorded'}</p><p>Manufacturer: {pendingMismatch.candidate.drug.manufacturerName || 'Not recorded'}</p><p>Composition: {pendingMismatch.candidate.drug.composition1 || 'Not recorded'}</p><p>Strength: {pendingMismatch.candidate.drug.strength || 'Not recorded'}</p><p>Form: {pendingMismatch.candidate.drug.dosageForm || 'Not recorded'}</p></div>
        </div>
        <ul className="list-disc pl-5 text-sm">{pendingMismatch.mismatches.map(message => <li key={message}>{message}</li>)}</ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => { setPendingMismatch(null); focusProductMatching(); }}>Choose another product</Button>
          <Button variant="outline" disabled={busy} onClick={() => { const id = pendingMismatch.line.localId; setPendingMismatch(null); focusPurchaseField(`${id}-product`); }}>Correct invoice details</Button>
          <Button variant="ghost" disabled={busy || !access.create} onClick={() => confirmMasterLine(pendingMismatch.match, 'MATCH_EXISTING', pendingMismatch.candidate, undefined, pendingMismatch.attempt)}>Confirm this match</Button>
        </div>
        <p className="text-sm text-muted-foreground">Confirm only after checking both products and pack details against the original invoice.</p>
      </div>}
      {!comparison && !pendingMismatch && !unknownStockInvoiceId && recoveryIssues.length > 0 && <ul className="space-y-2">{recoveryIssues.map(issue => <li key={issue.key} className="space-y-1 text-sm">{recovery && <><p>{issue.message}</p><p className="text-muted-foreground">{issue.help}</p></>}{issue.category !== 'historical' && purchaseRecoveryTarget(issue, lines.map(line => line.localId)) && access.create && !savedFormLocked && <Button size="sm" variant="outline" disabled={busy} onClick={() => focusRecoveryIssue(issue)}>Correct {issue.lineIndex === undefined ? issue.label : `line ${issue.lineIndex + 1} ${issue.label}`}</Button>}</li>)}</ul>}
      <div className="flex flex-wrap gap-2">
        {catalogueIssue && !stockAdded && !stockStatusUnknown && !savedFormLocked && access.create && <Button variant="outline" onClick={openProductRecovery} disabled={busy || draftWriteBlocked}>Fix products on this invoice</Button>}
        {canReview && !comparison && !pendingMismatch && !reviewAccepted && <Button disabled={busy} onClick={() => focusPurchaseField("purchase-review-checklist")}>Continue to final review</Button>}
        {access.create && !savedFormLocked && !draftWriteBlocked && !comparison && <Button variant="outline" disabled={busy} onClick={saveDraft}>Save corrections and check again</Button>}
        {(needsHandoff || (recovery && (recovery.kind === 'duplicate' || recovery.kind === 'receipt') && !recovery.existingInvoiceId)) && <Button variant="outline" onClick={copyHandoff}>Copy handoff details</Button>}
      </div>
      {activeInvoice && !['STOCK_COMMITTED', 'CANCELLED'].includes(activeInvoice.status) && !activeInvoice.stockCommittedAt && access.create && access.review && !draftWriteBlocked && <Button variant="outline" disabled={busy} onClick={rejectSavedInvoice}>Reject invoice</Button>}
      {!unknownStockInvoiceId && sourceDocument && !stockAdded && !savedFormLocked && access.create && <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || draftWriteBlocked} onClick={enterCompleteInvoiceManually}>Enter complete invoice manually</Button>
        {!activeInvoice && <Button variant="outline" disabled={busy || draftWriteBlocked} onClick={() => { if (window.confirm('Reject this upload without adding stock? Its archived original will be retained.')) { resetDraft(); setShowIntakeHome(true); setNotice('Upload rejected. No stock was added; the original remains in Saved uploads.'); } }}>Reject this upload</Button>}
      </div>}
      {!comparison && !pendingMismatch && !unknownStockInvoiceId && recoveryIssues.length === 0 && activeInvoice?.status !== 'REVIEWED' && <p className="text-sm">Save corrections to refresh the checks. Confirm the final review before choosing Add stock.</p>}
    </section>
  );

  const invoiceActions = activeInvoice && (
    <div className="flex flex-wrap items-center gap-2">
      {stockStatusUnknown ? (
        <Button
          variant="outline"
          onClick={() => unknownStockInvoiceId && refreshStockStatus(unknownStockInvoiceId)}
          disabled={busy}
        >
          Refresh stock status
        </Button>
      ) : stockAdded ||
        activeInvoice.status === "CANCELLED" ? null : activeInvoice.status ===
        "REVIEWED" ? (
        <>
        <Button onClick={commitStock} disabled={!canCommit || busy}>
          {committing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PackagePlus className="h-4 w-4" />
          )}
          {activeInvoice.workflowReceiptId ? "Post bill" : "Add stock"}
        </Button>
        </>
      ) : canReview && !access.commit ? (
        <Button onClick={reviewInvoice} disabled={busy}>
          Mark Reviewed
        </Button>
      ) : editingSelectedInvoice ? (
        <Button
          disabled={savedFormLocked || busy || draftWriteBlocked}
          onClick={() =>
            reviewAccepted && canReview && access.commit
              ? reviewInvoice()
              : saveDraft()
          }
        >
          {(saving || processing) && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {saving
            ? "Saving…"
            : processing
              ? "Checking invoice…"
              : reviewAccepted && canReview && access.commit
                ? "Complete review"
                : "Save corrections"}
        </Button>
      ) : (
        <Button
          disabled={!access.create || busy}
          onClick={() => editSavedDraft(activeInvoice)}
        >
          Review issues
        </Button>
      )}
      {canReopenReview && (
        <Button variant="outline" onClick={reopenReviewedInvoice} disabled={busy}>
          {reopeningReview ? "Reopening review…" : "Reopen review and fix products"}
        </Button>
      )}
      {editingSelectedInvoice && !stockAdded && !savedFormLocked && (
        <details className="text-sm">
          <summary className="cursor-pointer py-2">More options</summary>
          <div className="space-y-3 py-2">
            <Button variant="outline" onClick={saveIncompleteDraft} disabled={busy || draftWriteBlocked}>Save draft for later</Button>
            {access.automate && <div>
              <p className="mb-2 max-w-prose text-muted-foreground">Automatic processing saves corrections and adds stock if every check passes.</p>
              <Button variant="outline" disabled={busy || draftWriteBlocked} onClick={processSavedInvoice}>{saving ? "Saving…" : processing ? "Checking invoice…" : "Save & Process"}</Button>
            </div>}
          </div>
        </details>
      )}
    </div>
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
            <RefreshCw
              className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`}
            />
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
                  <ReviewStatus tone={purchaseInvoiceReviewTone(invoice)}>{purchaseInvoiceStatusLabel(invoice)}</ReviewStatus>
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
    <PurchaseFieldReviewContext.Provider value={fieldTones}>
    <PurchaseSourceContext.Provider
      value={{
        enabled: showSourcePreview,
        fieldIds: sourceTargets.map((target) => target.id),
        selectedId: selectedSourceId,
        select: (id) => selectSource(id),
      }}
    >
      <div
        onChangeCapture={invalidatePending}
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
          <section className="space-y-2 rounded-md border p-3 text-sm">
            <p className="font-medium">Correct the earlier stock receipt</p>
            <p>Choose the posted receipt for these goods. Removing a receipt link will make this bill add stock when posted.</p>
            <div className="flex flex-wrap items-end gap-2">
              <label>Receipt reference
                <input className="ml-2 rounded border p-2" value={receiptSearch} onChange={e => setReceiptSearch(e.target.value)} />
              </label>
              <Button type="button" variant="outline" disabled={busy} onClick={async () => {
                try {
                  const result = await apiClient.get<any>(`/inventory/workspace/documents?kind=INWARD_CHALLAN&status=POSTED&limit=100&search=${encodeURIComponent(receiptSearch)}`);
                  setReceiptOptions(result.rows || []);
                  if (!result.rows?.length) setNotice("No matching posted receipts. Check the reference and your receipt access.");
                } catch (err) { setError(getErrorMessage(err)); }
              }}>Find posted receipts</Button>
              {!!receiptOptions.length && <label>Posted receipt
                <select className="ml-2 rounded border p-2" value={workflowReceiptId} disabled={busy} onChange={e => {
                  setWorkflowReceiptId(e.target.value); setReviewAccepted(false);
                }}>
                  <option value="" disabled>Select the receipt for these goods</option>
                  {!receiptOptions.some(r => r.id === workflowReceiptId) && workflowReceiptId && <option value={workflowReceiptId}>Current receipt</option>}
                  {receiptOptions.map(receipt => <option key={receipt.id} value={receipt.id}>{receipt.reference} · {receipt.supplierGstin}</option>)}
                </select>
              </label>}
              {workflowReceiptId && <Button type="button" variant="outline" disabled={busy} onClick={() => {
                if (window.confirm("Remove the receipt link only if these goods have not already been added to inventory. Posting this bill will add stock. Continue?")) {
                  setWorkflowReceiptId(""); setReviewAccepted(false);
                }
              }}>Remove incorrect receipt link</Button>}
            </div>
          </section>
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
              className={`min-w-0 rounded-md border px-3 py-2 text-sm ${reviewColors[stockStatusUnknown ? "warning" : stockAdded ? "success" : "neutral"]}`}
            >
              <p className="font-semibold">
                {stockStatusUnknown
                  ? "Stock status unknown"
                  : committing
                    ? "Adding stock…"
                    : processing || saving
                      ? "Saving and checking invoice…"
                      : stockAdded
                        ? committedLabel
                        : "Stock not added"}
              </p>
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
              disabled={busy || !!unknownStockInvoiceId}
            >
              New invoice
            </Button>
            {invoiceActions}
          </nav>
        )}
        {stockAdded && activeInvoice?.committedItems?.length && (
          <section
            className="space-y-2 rounded-md border border-green-600 p-4"
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
        {activeInvoice && !showIntakeHome && (
          <PurchaseDocumentActions
            invoice={activeInvoice}
            onRefresh={async () => { await refreshStockStatus(activeInvoice.id); }}
            onEdit={
              !savedFormLocked ? () => editSavedDraft(activeInvoice) : undefined
            }
          />
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
              disabled={busy || !!unknownStockInvoiceId}
            >
              New invoice
            </Button>
            {!activeInvoice && (
              <Button
                variant="outline"
                onClick={saveIncompleteDraft}
                disabled={busy || savedFormLocked || draftWriteBlocked}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Draft
              </Button>
            )}
            {!activeInvoice && access.create && (
              <Button
                disabled={busy || draftWriteBlocked}
                onClick={saveDraft}
              >
                {saving ? "Saving…" : "Save invoice"}
              </Button>
            )}
            {!activeInvoice && access.automate && <details className="text-sm">
              <summary className="cursor-pointer py-2">Automatic processing</summary>
              <p className="my-2 max-w-prose text-muted-foreground">Saves corrections and adds stock if every automatic check passes.</p>
              <Button variant="outline" disabled={busy || draftWriteBlocked} onClick={processSavedInvoice}>{saving ? "Saving…" : processing ? "Checking invoice…" : "Save & Process"}</Button>
            </details>}
          </div>
        </div>

        {activeInvoice && showIntakeHome && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">
                {activeInvoice.invoiceNumber} · {activeInvoice.distributorName}
              </p>
              <p className="text-sm text-muted-foreground">
                Your place and any unsaved corrections are kept in this tab.
              </p>
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
        {!showIntakeHome && <ReviewLegend />}
        {!showIntakeHome && <PurchaseReviewSummary
          hasContent={hasDraftContent}
          saved={activeInvoice?.status === "REVIEWED"} committed={stockAdded} cancelled={activeInvoice?.status === "CANCELLED"} unknown={stockStatusUnknown}
          checks={checksRemaining} lines={sourceLines.length}
          calculated={viewingSavedInvoice ? calculateTotals(sourceHeader as HeaderForm, sourceLines).netPayable : totals.netPayable}
          printed={sourceAmounts?.netPayable} />}


        <div
          ref={actionFeedbackRef}
          id="purchase-action-feedback"
          tabIndex={-1}
          className="space-y-3"
        >
          <section aria-label="Interrupted import recovery" className="space-y-3 rounded-md border p-3">
            <Button type="button" variant="outline" disabled={resolvingImport} onClick={() => {
              setDelegatedRecovery(current => ({ ...current, attemptId: importAttemptId || current.attemptId,
                originalActorId: current.originalActorId || (!recoveryAttemptId && importAttemptId ? user?.id || '' : ''),
                invoiceId: unknownStockInvoiceId && unknownStockInvoiceId !== 'unconfirmed-import' ? unknownStockInvoiceId : current.invoiceId }));
              setShowDelegatedRecovery(true);
            }}>Recover interrupted import</Button>
            {showDelegatedRecovery && <div className="space-y-3">
              <p className="text-sm">Use the reference from the original operator's handoff. Recovery checks the exact invoice or stops unfinished work. Unknown historical stock stays locked for physical reconciliation.</p>
              <label className="block">Import attempt ID
                <input className="mt-1 block w-full rounded border p-2" value={delegatedRecovery.attemptId} disabled={resolvingImport || !!importAttemptId} onChange={event => setDelegatedRecovery(current => ({ ...current, attemptId: event.target.value }))} />
              </label>
              <label className="block">Original operator ID (optional)
                <input className="mt-1 block w-full rounded border p-2" value={delegatedRecovery.originalActorId} disabled={resolvingImport} onChange={event => setDelegatedRecovery(current => ({ ...current, originalActorId: event.target.value }))} />
              </label>
              <p className="text-sm">If the attempt has not registered yet, enter the original operator ID exactly as shown in their handoff.</p>
              <label className="block">Recovery reason
                <textarea className="mt-1 block w-full rounded border p-2" value={delegatedRecovery.reason} maxLength={500} disabled={resolvingImport} onChange={event => setDelegatedRecovery(current => ({ ...current, reason: event.target.value }))} />
              </label>
              {access.read && access.create && access.review ? <Button type="button" disabled={resolvingImport || extracting || !delegatedRecovery.attemptId.trim() || !delegatedRecovery.reason.trim()} onClick={recoverDelegatedImport}>Recover import outcome</Button>
                : <p>A colleague with purchase read, create and review access can recover this import using these details.</p>}
              <Button type="button" variant="outline" onClick={copyHandoff}>Copy recovery handoff</Button>
              {rejectedRecoveryReference && <p className="text-sm">This recovery reference was not accepted. This tab keeps the original reference and its stock lock. <a className="text-primary underline" target="_blank" rel="noopener noreferrer" href={`/dashboard/inventory?area=purchases&view=intake&new=recovery-${encodeURIComponent(rejectedRecoveryReference)}`}>Open another recovery page</a> to enter a corrected reference separately.</p>}
            </div>}
          </section>
          {recoveryPanel}
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
          {error && (error.startsWith("Could not copy.") || !recovery || !error.includes(recovery.message)) && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Request Failed</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{error}</p>
                {catalogueIssue && !stockAdded && !stockStatusUnknown && (
                  !savedFormLocked && access.create ? (
                    <Button variant="outline" onClick={openProductRecovery} disabled={busy || draftWriteBlocked}>
                      Fix products on this invoice
                    </Button>
                  ) : canReopenReview ? (
                    <p>Use “Reopen review and fix products” below to correct this bill before adding stock.</p>
                  ) : (
                    <p>A staff member with purchase edit and review permissions must correct the catalogue match.</p>
                  )
                )}
              </AlertDescription>
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
                  <ReviewStatus tone={stockStatusUnknown ? "warning" : purchaseInvoiceReviewTone(activeInvoice)}>{purchaseInvoiceStatusLabel(activeInvoice)}</ReviewStatus>
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
                          : awaitingManualReview
                            ? "Confirm your review below, then add stock."
                            : editingSelectedInvoice && access.automate
                              ? "Correct the highlighted details, then save corrections."
                              : canReview
                                ? "Confirm your review below, then add stock."
                                : "Check highlighted details, then save corrections."}
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
                    Compare with saved version
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
                          disabled={!access.create || busy || !!unknownStockInvoiceId || !ocrFile || !importReceivedDate} className="w-full md:w-auto">
                          {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                          {extracting ? "Reading bill…" : "Scan bill"}
                        </Button>
                        <a href="#distributor-name" className="text-center text-sm underline underline-offset-4" onClick={() => { setShowIntakeHome(false); setManualEntry(true); requestAnimationFrame(() => focusPurchaseField('distributor-name')); }}>Type instead</a>
                        {access.automate && <details className="text-sm">
                          <summary className="cursor-pointer py-2">Automatic import</summary>
                          <p className="my-2 text-muted-foreground">Adds stock if every automatic check passes.</p>
                          <Button type="button" variant="outline" onClick={() => extractFromInvoiceFile(true)} disabled={busy || !!unknownStockInvoiceId || !ocrFile || !importReceivedDate}>Import &amp; Add Stock</Button>
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
                        <CardDescription>
                          Review extracted values or enter the distributor bill
                          manually.
                        </CardDescription>
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
                                readOnly
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
                        <Card id="purchase-master-matching" tabIndex={-1}>
                          <CardHeader>
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <CardTitle className="flex items-center gap-2">
                                  <FileSearch className="h-5 w-5" />
                                  Product matching and details
                                </CardTitle>
                                <CardDescription>
                                  Match each invoice line to the correct saved
                                  product and pack before adding stock.
                                  Manufacturer is optional.
                                </CardDescription>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => refreshMasterMatches()}
                                disabled={
                                  !access.create ||
                                  busy ||
                                  masterRefreshing ||
                                  masterConfirming !== null
                                }
                              >
                                {masterRefreshing ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
                                Choose Refresh Matches to find saved products.
                                Confirm a match to fill its manufacturer and
                                pack details, then enter the stock unit (Bottle,
                                Tube or Strip) if it is still missing.
                              </p>
                            )}
                            {masterMatches.map((match) => {
                              if (!access.create) return;
                              const line = lines[match.lineIndex];
                              const best = match.recommendedAction === "CREATE_NEW" ? undefined : match.candidates[0];
                              const status = masterStatuses[match.lineIndex];
                              const confirmMatchKey = `${match.lineIndex}:MATCH_EXISTING`;
                              const savedProduct = status?.drug || best?.drug;
                              return (
                                <div
                                  key={`${match.lineIndex}-${fieldValue(match.ocr?.productName)}`}
                                  className="rounded-md border p-3"
                                >
                                  <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div>
                                      <p className="text-sm font-medium">
                                        Line {match.lineIndex + 1}:{" "}
                                        {line?.productName ||
                                          fieldValue(match.ocr?.productName)}
                                      </p>
                                    </div>
                                    {status ? (
                                      <ReviewStatus tone="success">
                                        {masterActionLabel(status.action)}{" "}
                                        {status.drug.name}
                                      </ReviewStatus>
                                    ) : best ? (
                                      <ReviewStatus tone="warning">
                                        {match.matchLabel || "Possible match"} · confirm
                                      </ReviewStatus>
                                    ) : (
                                      <Badge variant="outline">
                                        Not in inventory
                                      </Badge>
                                    )}
                                  </div>

                                  {line && <PurchaseLineNameCorrection
                                    key={`name-correction:${line.localId}`}
                                    lineNumber={match.lineIndex + 1}
                                    name={line.productName}
                                    disabled={busy || draftWriteBlocked}
                                    onCorrect={async (name) => {
                                      const corrected = lines.map(current => current.localId === line.localId ? { ...current, productName: name } : current);
                                      updateLine(line.localId, "productName", name);
                                      setCatalogueIssue(false);
                                      await refreshMasterMatches(corrected);
                                      focusProductMatching();
                                    }}
                                  />}
                                  <div className="grid grid-cols-1 gap-3">
                                    <div className="rounded-md bg-muted/40 p-3">
                                      <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                        OCR / Draft Line
                                      </p>
                                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                                        <Detail
                                          label="Product"
                                          value={
                                            line?.productName ||
                                            match.ocr?.productName
                                          }
                                        />
                                        <Detail
                                          label="Manufacturer"
                                          value={
                                            line?.manufacturer ||
                                            match.ocr?.manufacturer
                                          }
                                        />
                                        <Detail
                                          label="Pack"
                                          value={
                                            line?.packSize ||
                                            match.ocr?.packSize
                                          }
                                        />
                                        <Detail
                                          label="MRP"
                                          value={line?.mrp || match.ocr?.mrp}
                                          currencyValue
                                        />
                                        <Detail
                                          label="Rate"
                                          value={
                                            line?.purchaseRate ||
                                            match.ocr?.purchaseRate
                                          }
                                          currencyValue
                                        />
                                        <Detail
                                          label="Batch"
                                          value={
                                            line?.batchNumber ||
                                            match.ocr?.batchNumber
                                          }
                                        />
                                      </dl>
                                    </div>

                                    <div className="rounded-md bg-muted/40 p-3">
                                      <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                        Saved product
                                      </p>
                                      {savedProduct ? (
                                        <>
                                          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                                            <Detail
                                              label="Product"
                                              value={savedProduct.name}
                                            />
                                            <Detail
                                              label="Manufacturer"
                                              value={
                                                savedProduct.manufacturerName
                                              }
                                            />
                                            <Detail
                                              label="Pack"
                                              value={savedProduct.packSizeLabel}
                                            />
                                            <Detail
                                              label="MRP"
                                              value={savedProduct.price}
                                              currencyValue
                                            />
                                            <Detail
                                              label="Product kind"
                                              value={
                                                savedProduct.productKind ||
                                                savedProduct.type
                                              }
                                            />
                                            <Detail
                                              label="Prescription required"
                                              value={
                                                savedProduct.requiresPrescription ==
                                                null
                                                  ? "Not recorded"
                                                  : savedProduct.requiresPrescription
                                                    ? "Yes"
                                                    : "No"
                                              }
                                            />
                                            <Detail
                                              label="Composition"
                                              value={savedProduct.composition1}
                                            />
                                            <Detail
                                              label="Strength"
                                              value={savedProduct.strength}
                                            />
                                          </dl>
                                          {!status && best?.reasons?.length ? (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                              {best.reasons.map((reason) => (
                                                <Badge
                                                  key={reason}
                                                  variant="outline"
                                                >
                                                  {reason}
                                                </Badge>
                                              ))}
                                            </div>
                                          ) : null}
                                        </>
                                      ) : (
                                        <p className="text-sm text-muted-foreground">
                                          Choose a product kind below and save
                                          its known details. Clinical fields are
                                          optional for cosmetics and
                                          consumables.
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {!status && <label className="mt-3 block text-sm">
                                    Invoice product kind
                                    <select className="mt-1 block w-full rounded-md border bg-background p-2" value={line?.productKind || ""} disabled={busy || masterConfirming !== null} onChange={event => {
                                      if (line) updateLine(line.localId, "productKind", event.target.value);
                                    }}>
                                      <option value="">Not recorded</option><option value="MEDICINE">Medicine</option><option value="COSMETIC">Cosmetic / skin care</option><option value="CONSUMABLE">Other consumable</option>
                                    </select>
                                  </label>}
                                  <div className="mt-3 flex flex-col gap-2 md:flex-row md:justify-end">
                                    {best && !status && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                          confirmMasterLine(
                                            match,
                                            "MATCH_EXISTING",
                                            best,
                                          )
                                        }
                                        disabled={
                                          !access.create ||
                                          busy ||
                                          masterConfirming !== null
                                        }
                                      >
                                        {masterConfirming ===
                                          confirmMatchKey && (
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        )}
                                        Confirm Match
                                      </Button>
                                    )}
                                  </div>
                                  {savedProduct && access.catalogDetails && (
                                    <details
                                      className="mt-3"
                                      open={
                                        !!savedProduct.catalogIssues?.length &&
                                        (status ||
                                          match.recommendedAction ===
                                            "MATCH_EXISTING")
                                          ? true
                                          : undefined
                                      }
                                    >
                                      <summary className="cursor-pointer text-sm font-medium">
                                        Check or correct saved product details
                                      </summary>
                                      {!!savedProduct.catalogIssues?.length && (
                                        <p
                                          role="alert"
                                          className="my-2 text-sm text-destructive"
                                        >
                                          Complete the saved product details:{" "}
                                          {savedProduct.catalogIssues.join(
                                            ", ",
                                          )}
                                          . Choose the correct product kind if
                                          this is a cosmetic or consumable.
                                        </p>
                                      )}
                                      {access.editProduct ? (
                                        <PurchaseProductDetails
                                          key={JSON.stringify(savedProduct)}
                                          id={`product-${match.lineIndex}-edit`}
                                          product={savedProduct}
                                          disabled={
                                            busy || masterConfirming !== null
                                          }
                                          onSave={(catalog) =>
                                            saveProductDetails(
                                              savedProduct,
                                              catalog,
                                            )
                                          }
                                        />
                                      ) : (
                                        <p className="mt-2 text-sm">
                                          Staff with product-edit permission
                                          must correct this saved record.
                                        </p>
                                      )}
                                    </details>
                                  )}
                                  {!status &&
                                    (access.catalogDetails ? (
                                      best ? (
                                        <details
                                          className="mt-3"
                                          open={
                                            match.recommendedAction ===
                                              "CREATE_NEW" || undefined
                                          }
                                        >
                                          <summary className="cursor-pointer text-sm">
                                            This is a different product: create
                                            a new record
                                          </summary>
                                          <PurchaseProductDetails
                                            id={`product-${match.lineIndex}-new`}
                                            createLabel="Create new item"
                                            onKindChange={kind => { if (line) updateLine(line.localId, "productKind", kind); }}
                                            disabled={
                                              busy || masterConfirming !== null
                                            }
                                            onSave={(catalog) =>
                                              confirmMasterLine(
                                                match,
                                                "CREATE_NEW",
                                                undefined,
                                                catalog,
                                              )
                                            }
                                          />
                                        </details>
                                      ) : (
                                        <div className="mt-3">
                                          <PurchaseProductDetails
                                            id={`product-${match.lineIndex}-new`}
                                            createLabel="Create new item"
                                            onKindChange={kind => { if (line) updateLine(line.localId, "productKind", kind); }}
                                            disabled={
                                              busy || masterConfirming !== null
                                            }
                                            onSave={(catalog) =>
                                              confirmMasterLine(
                                                match,
                                                "CREATE_NEW",
                                                undefined,
                                                catalog,
                                              )
                                            }
                                          />
                                        </div>
                                      )
                                    ) : (
                                      <p className="mt-3 text-sm">
                                        Product creation requires the updated
                                        backend. Reload after the update
                                        completes.
                                      </p>
                                    ))}
                                  {!status && <PurchaseManualMatchSearch
                                    key={`manual-match:${line?.localId || match.lineIndex}`}
                                    lineNumber={match.lineIndex + 1}
                                    disabled={busy || masterConfirming !== null}
                                    onSelect={drug => { void confirmMasterLine(match, "MATCH_EXISTING", { drug, score: 0, confidence: "LOW" }); }}
                                  />}
                                </div>
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
                                  {currentLineFlags[index].length > 0 && (
                                    <span className="text-destructive">
                                      {
                                        groupPurchaseOcrFlags(
                                          currentLineFlags[index],
                                          index,
                                        ).length
                                      }{" "}
                                      {groupPurchaseOcrFlags(
                                        currentLineFlags[index],
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
                                {currentLineFlags[index].length > 0 && (
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
                                      value={currentLineFlags[index].join(", ")}
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
                          <p className="my-3 text-sm text-muted-foreground">
                            Trade, special, cash, damage, visibility and
                            credit/debit amounts are reported summaries already
                            included in line taxable values. To change the
                            payable, adjust the line discounts or scheme
                            amounts. TCS and rounding apply to the bill total.
                          </p>
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
                          />
                          <SummaryValue
                            label="Indicative margin at MRP"
                            value={
                              receiptSummary.marginPercent === null
                                ? "Unknown"
                                : `${receiptSummary.marginPercent.toFixed(2)}%`
                            }
                          />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Quantities count each line’s declared stock units,
                          including free units, without multiplying by pack
                          contents. Margin is a percentage of sales at each
                          unit’s MRP before selling discounts: GST is excluded
                          from sales and purchase cost; TCS and rounding are
                          excluded. Missing MRP makes margin unknown.
                        </p>
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
                                "Original selected for this draft. Save Draft links the file to the invoice.",
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
      </div>
    </PurchaseSourceContext.Provider>
    </PurchaseFieldReviewContext.Provider>
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
      <p className="my-3 text-xs text-muted-foreground">
        Check these amounts against the invoice and correct any reading errors.
        Printed amounts stay unchanged when quantities, rates or taxes change.
        Correct these fields only against the original invoice.
      </p>
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
  const tone = usePurchaseFieldTone(id);
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        <PurchaseFieldStatus id={id} />
        <SourceFieldLink id={id} label={label} />
      </div>
      <Input
        id={id}
        {...props}
        aria-invalid={tone === "error" || undefined}
        aria-describedby={tone ? `${id}-review-state` : undefined}
        className={`${tone ? reviewColors[tone] : ""} ${source.enabled && source.selectedId === id ? "outline-2 outline-sky-700 dark:outline-sky-300" : ""}`}
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
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
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

/**
 * @cc [owner:nareshshah139,label:product] invoice-name-correction-explicit
 * Typing or cancelling a name correction MUST leave the invoice untouched; applying a nonblank
 * name MUST change only that invoice line through the parent and MUST NOT rename a catalogue record.
 */
function PurchaseLineNameCorrection({ lineNumber, name, disabled, onCorrect }: {
  lineNumber: number;
  name: string;
  disabled: boolean;
  onCorrect: (name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  if (!editing) return (
    <Button type="button" variant="outline" size="sm" className="mb-3" disabled={disabled}
      onClick={() => { setValue(name); setEditing(true); }}>Correct invoice name</Button>
  );
  return (
    <div className="mb-4 space-y-2">
      <Label htmlFor={`purchase-correct-name-${lineNumber}`}>Corrected name for line {lineNumber}</Label>
      <p id={`purchase-correct-name-help-${lineNumber}`} className="text-sm text-muted-foreground">Correct the name read from this bill. Existing catalogue names stay unchanged.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id={`purchase-correct-name-${lineNumber}`} aria-describedby={`purchase-correct-name-help-${lineNumber}`}
          value={value} disabled={disabled} onChange={event => setValue(event.target.value)} className="min-w-0 flex-1" />
        <Button type="button" disabled={disabled || !value.trim()} onClick={() => { void onCorrect(value.trim()); setEditing(false); }}>Apply name</Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}
