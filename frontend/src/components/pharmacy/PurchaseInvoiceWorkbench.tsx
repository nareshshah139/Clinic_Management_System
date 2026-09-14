'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Upload,
} from 'lucide-react';
import { PurchaseProductDetails, type PurchaseProductCatalog } from './PurchaseProductDetails';
import { PurchaseSupplierReview } from './PurchaseSupplierReview';
import { PurchaseOcrChecklist } from './PurchaseOcrChecklist';
import { purchaseBlockingIssues, purchaseReviewIssue, uniquePurchaseReviewIssues } from '@/lib/purchase-invoice-review';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { preserveInvoiceTotals, reportedAmountErrors, reportedHeaderAmounts, reportedLineAmounts } from '@/lib/purchase-invoice-totals';
import { usePurchasePermissions } from '@/hooks/usePurchasePermissions';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type BillType = 'CASH' | 'CREDIT';
type SourceType = 'MANUAL' | 'OCR';
type PurchaseStatus =
  | 'DRAFT'
  | 'OCR_REVIEW_REQUIRED'
  | 'RECONCILIATION_FAILED'
  | 'REVIEWED'
  | 'STOCK_COMMITTED'
  | 'CANCELLED';

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
  purchaseRate: string;
  cgstPercent: string;
  sgstPercent: string;
  igstPercent: string;
  ocrConfidence: string;
  ocrFlags: string;
};

type PurchaseInvoiceItem = {
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
  batchNumber: string;
  expiryDate: string;
};

type OriginalDocument = {
  id: string; fileName: string; mimeType: string; sizeBytes: number;
  purchaseInvoiceId?: string | null;
};

type PurchaseInvoice = {
  id: string;
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
    status: 'NOT_SAVED' | 'SAVED_FOR_REVIEW' | 'STOCK_COMMITTED' | 'DUPLICATE';
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
  productKind?: PurchaseProductCatalog['productKind'];
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
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons?: string[];
};

type MasterMatch = {
  lineIndex: number;
  ocr: Record<string, unknown>;
  candidates: MasterCandidate[];
  recommendedAction: 'MATCH_EXISTING' | 'CREATE_NEW';
};

type MasterMatchResponse = {
  matches?: MasterMatch[];
};

type MasterConfirmationResponse = {
  action: 'MATCH_EXISTING' | 'CREATE_NEW';
  drug: MasterDrug;
  linePatch?: Partial<Record<keyof LineForm, string | number | null | undefined>>;
  message?: string;
};

type MasterStatus = {
  action: 'MATCH_EXISTING' | 'CREATE_NEW';
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

const GSTIN_PATTERN =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

const numberFormat = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

function makeLocalId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateInputFromIso(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : toDateInput(parsed);
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
  if (value === '' || value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function formString(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function splitFlags(value: string) {
  const flags = purchaseBlockingIssues(value
    .split(',')
    .map((flag) => flag.trim())
    .filter(Boolean));
  return flags.length ? flags : undefined;
}

function defaultHeader(): HeaderForm {
  const today = todayInput();
  return {
    distributorName: '',
    distributorAddress: '',
    distributorGstin: '',
    distributorDlNo: '',
    distributorFoodLicense: '',
    invoiceNumber: '',
    invoiceDate: today,
    goodsReceivedDate: today,
    billType: 'CASH',
    dueDate: '',
    eWayBillNo: '',
    casesTransport: '',
    lrNo: '',
    salesmanName: '',
    salesmanContact: '',
    buyerCode: '',
    doctorNameOrRegNo: '',
    urcCode: '',
    handwrittenNotes: '',
    source: 'MANUAL',
    tradeDiscount: '0',
    specialDiscount: '0',
    cashDiscount: '0',
    damageAdjustment: '0',
    visibilityAmount: '0',
    creditDebitAdjustment: '0',
    tcsAmount: '0',
    rounding: '0',
  };
}

function emptyLine(serialNumber: number): LineForm {
  return {
    localId: makeLocalId(),
    serialNumber: String(serialNumber),
    productName: '',
    manufacturer: '',
    packSize: '',
    packUnitType: 'Strip',
    hsnCode: '',
    batchNumber: '',
    expiryMonth: '12',
    expiryYear: nextExpiryYear(),
    quantityPurchased: '1',
    freeQuantity: '0',
    mrp: '0',
    oldMrp: '',
    discountPercent: '0',
    specialDiscountPercent: '0',
    purchaseRate: '0',
    cgstPercent: '6',
    sgstPercent: '6',
    igstPercent: '0',
    ocrConfidence: '',
    ocrFlags: '',
  };
}

function calculateLine(line: LineForm): LineAmounts {
  const purchasedQty = numeric(line.quantityPurchased);
  const rate = numeric(line.purchaseRate);
  const discountPercent = Math.min(100, Math.max(0, numeric(line.discountPercent)));
  const specialDiscountPercent = Math.min(
    100,
    Math.max(0, numeric(line.specialDiscountPercent)),
  );
  const discountMultiplier = Math.max(
    0,
    1 - (discountPercent + specialDiscountPercent) / 100,
  );
  const gross = money(purchasedQty * rate);
  const taxable = money(gross * discountMultiplier);
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
  const totalCgst = money(lineAmounts.reduce((sum, line) => sum + line.cgst, 0));
  const totalSgst = money(lineAmounts.reduce((sum, line) => sum + line.sgst, 0));
  const totalIgst = money(lineAmounts.reduce((sum, line) => sum + line.igst, 0));
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
    ['distributorName', 'Distributor name'],
    ['distributorGstin', 'Distributor GSTIN'],
    ['invoiceNumber', 'Invoice number'],
    ['invoiceDate', 'Invoice date'],
  ];

  for (const [key, label] of requiredHeader) {
    if (!header[key].trim()) errors.push(`${label} is required`);
  }

  const gstin = header.distributorGstin.trim().toUpperCase();
  if (gstin && !GSTIN_PATTERN.test(gstin)) {
    errors.push('Distributor GSTIN must be a valid 15-character GSTIN');
  }

  const invoiceDate = parseDateInput(header.invoiceDate);
  const goodsDate = header.goodsReceivedDate
    ? parseDateInput(header.goodsReceivedDate)
    : undefined;
  const dueDate = header.dueDate ? parseDateInput(header.dueDate) : undefined;
  if (!invoiceDate) errors.push('Invoice date must be valid');
  if (header.goodsReceivedDate && !goodsDate) {
    errors.push('Goods received date must be valid');
  }
  if (header.dueDate && !dueDate) errors.push('Due date must be valid');
  if (invoiceDate && goodsDate && goodsDate < invoiceDate) {
    errors.push('Goods received date cannot be before invoice date');
  }
  if (invoiceDate && dueDate && dueDate < invoiceDate) {
    errors.push('Due date cannot be before invoice date');
  }
  if (Math.abs(numeric(header.rounding)) > 1) {
    errors.push('Rounding adjustment cannot exceed Rs. 1');
  }

  if (lines.length === 0) {
    errors.push('At least one purchase line is required');
  }

  lines.forEach((line, index) => {
    const prefix = `Line ${index + 1}`;
    const requiredLine: Array<[keyof LineForm, string]> = [
      ['productName', 'product'],
    ];
    for (const [key, label] of requiredLine) {
      if (!line[key].trim()) errors.push(`${prefix}: ${label} is required`);
    }

    const purchased = numeric(line.quantityPurchased);
    const free = numeric(line.freeQuantity);
    if (!Number.isInteger(purchased) || !Number.isInteger(free)) {
      errors.push(`${prefix}: purchase and free quantities must be whole numbers`);
    }
    if (purchased < 0 || free < 0) errors.push(`${prefix}: quantities cannot be negative`);
    if (purchased + free <= 0) {
      errors.push(`${prefix}: purchased plus free quantity must be greater than zero`);
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
      expiryYear < 2020 || expiryYear > 2100
    ) {
      errors.push(`${prefix}: expiry month/year is invalid`);
    }
    const discount = numeric(line.discountPercent);
    const specialDiscount = numeric(line.specialDiscountPercent);
    if (discount < 0 || discount > 100 || specialDiscount < 0 || specialDiscount > 100) {
      errors.push(`${prefix}: discount percentages must be between 0 and 100`);
    }
    if (discount + specialDiscount > 100) {
      errors.push(`${prefix}: combined discounts cannot exceed 100%`);
    }
    for (const [field, label] of [
      [line.cgstPercent, 'CGST'],
      [line.sgstPercent, 'SGST'],
      [line.igstPercent, 'IGST'],
    ] as Array<[string, string]>) {
      const rate = numeric(field);
      if (rate < 0 || rate > 100) errors.push(`${prefix}: ${label} must be 0 to 100`);
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
    dueDate: header.billType === 'CREDIT' ? optionalString(header.dueDate) : undefined,
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

function lineFromExtracted(item: ExtractedPurchaseLine, index: number): LineForm {
  const base = emptyLine(index + 1);
  return {
    ...base,
    serialNumber: formString(item.serialNumber, String(index + 1)),
    productName: formString(item.productName),
    manufacturer: formString(item.manufacturer),
    packSize: formString(item.packSize),
    packUnitType: formString(item.packUnitType, base.packUnitType),
    hsnCode: formString(item.hsnCode),
    batchNumber: formString(item.batchNumber),
    expiryMonth: formString(item.expiryMonth, base.expiryMonth),
    expiryYear: formString(item.expiryYear, base.expiryYear),
    quantityPurchased: formString(
      item.quantityPurchased,
      base.quantityPurchased,
    ),
    freeQuantity: formString(item.freeQuantity, base.freeQuantity),
    mrp: formString(item.mrp, base.mrp),
    oldMrp: formString(item.oldMrp),
    discountPercent: formString(
      item.discountPercent,
      base.discountPercent,
    ),
    specialDiscountPercent: formString(
      item.specialDiscountPercent,
      base.specialDiscountPercent,
    ),
    purchaseRate: formString(item.purchaseRate, base.purchaseRate),
    cgstPercent: formString(item.cgstPercent, base.cgstPercent),
    sgstPercent: formString(item.sgstPercent, base.sgstPercent),
    igstPercent: formString(item.igstPercent, base.igstPercent),
    ocrConfidence: formString(item.ocrConfidence),
    ocrFlags: purchaseBlockingIssues(item.ocrFlags || []).join(', '),
  };
}

function masterActionLabel(action: MasterStatus['action']) {
  return action === 'MATCH_EXISTING' ? 'Matched' : 'Created';
}

function fieldValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return numberFormat.format(value);
  return String(value);
}

function statusVariant(status?: PurchaseStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'STOCK_COMMITTED' || status === 'REVIEWED') return 'default';
  if (status === 'RECONCILIATION_FAILED' || status === 'OCR_REVIEW_REQUIRED') {
    return 'destructive';
  }
  if (status === 'CANCELLED') return 'secondary';
  return 'outline';
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusLabel(status?: string) {
  return String(status || 'DRAFT').replaceAll('_', ' ');
}

function manualReviewOnlyIssue(raw: string) {
  const issue = raw.replace(/^AUTO:\s*/i, '').trim();
  return /^Automatic intake requires one active saved supplier with matching name and GSTIN\. Select a saved supplier or review manually\.$/.test(issue) ||
    /^Line \d+: OCR confidence must be at least 98% for automatic stock intake; review this line manually\.$/.test(issue);
}

function canResumeManualReview(invoice: PurchaseInvoice) {
  const issues = purchaseBlockingIssues(invoice.reconciliationIssues || []);
  return ['DRAFT', 'OCR_REVIEW_REQUIRED', 'RECONCILIATION_FAILED'].includes(invoice.status) &&
    !invoice.unresolvedOcrFlags && !purchaseBlockingIssues(invoice.ocrFlags || []).length &&
    !invoice.items?.some(item => purchaseBlockingIssues(item.ocrFlags || []).length) &&
    issues.length > 0 && issues.every(manualReviewOnlyIssue);
}

export function PurchaseInvoiceWorkbench() {
  const { user } = useDashboardUser();
  const recoveryKey = user ? `purchase-intake:${user.branchId}:${user.id}` : null;
  return <PurchaseInvoiceEditor key={recoveryKey || 'anonymous'} recoveryKey={recoveryKey} />;
}

function PurchaseInvoiceEditor({ recoveryKey }: { recoveryKey: string | null }) {
  const { user } = useDashboardUser();
  const { permissions: access, loading: permissionsLoading, error: permissionsError } = usePurchasePermissions(user?.id);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [header, setHeader] = useState<HeaderForm>(() => defaultHeader());
  const [lines, setLines] = useState<LineForm[]>(() => [emptyLine(1)]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalAmounts, setOriginalAmounts] = useState<Record<string, unknown> | null>(null);
  const [sourceDocument, setSourceDocument] = useState<OriginalDocument | null>(null);
  const [unlinkedUploads, setUnlinkedUploads] = useState<OriginalDocument[]>([]);
  const [uploadListError, setUploadListError] = useState<string | null>(null);
  const saveLock = useRef(false);
  const processLock = useRef(false);
  const [manualReviewCandidateId, setManualReviewCandidateId] = useState<string | null>(null);
  const [unknownStockInvoiceId, setUnknownStockInvoiceId] = useState<string | null>(null);
  const [refreshingStockStatus, setRefreshingStockStatus] = useState(false);
  const actionFeedbackRef = useRef<HTMLDivElement>(null);
  const focusActionFeedback = () => requestAnimationFrame(() => {
    actionFeedbackRef.current?.focus({ preventScroll: true });
    actionFeedbackRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [headerFlags, setHeaderFlags] = useState('');
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrSummary, setOcrSummary] = useState<OcrExtractionResponse['extraction'] | null>(null);
  const [masterMatches, setMasterMatches] = useState<MasterMatch[]>([]);
  const [masterConfirming, setMasterConfirming] = useState<string | null>(null);
  const [masterRefreshing, setMasterRefreshing] = useState(false);
  const [masterStatuses, setMasterStatuses] = useState<Record<number, MasterStatus>>({});
  const [recent, setRecent] = useState<PurchaseInvoice[]>([]);
  const [activeInvoice, setActiveInvoice] = useState<PurchaseInvoice | null>(null);
  const [showIntakeHome, setShowIntakeHome] = useState(false);
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
  const draftSelection = useRef({ editingId, hasContent: false });
  draftSelection.current = { editingId, hasContent: !!sourceDocument || !!header.distributorName || !!header.invoiceNumber || lines.some(line => !!line.productName) };


  useEffect(() => {
    if (!recoveryKey) return;
    try {
      const raw = sessionStorage.getItem(recoveryKey);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved?.version === 1 && saved.header && Array.isArray(saved.lines)) {
        setHeader(saved.header);
        setLines(saved.lines.map((line: LineForm) => ({ ...line, ocrFlags: (splitFlags(line.ocrFlags || '') || []).join(', ') })));
        setEditingId(saved.editingId || null);
        setOriginalAmounts(saved.originalAmounts || null);
        setSourceDocument(saved.sourceDocument || null);
        setHeaderFlags((splitFlags(saved.headerFlags || '') || []).join(', '));
        setOcrSummary(saved.ocrSummary || null);
        setNotice('Restored your unfinished purchase draft from this tab. Save Draft stores it on the server.');
      }
    } catch {
      setRecoveryError('Draft recovery is unavailable in this browser. Keep this tab open until Save Draft succeeds.');
    }
    setRecoveryReady(true);
  }, [recoveryKey]);

  useEffect(() => {
    if (!recoveryKey || !recoveryReady) return;
    try {
      sessionStorage.setItem(recoveryKey, JSON.stringify({ version: 1, header, lines, editingId, headerFlags, ocrSummary, originalAmounts, sourceDocument }));
    } catch {
      setRecoveryError('Draft recovery is unavailable in this browser. Keep this tab open until Save Draft succeeds.');
    }
  }, [recoveryKey, recoveryReady, header, lines, editingId, headerFlags, ocrSummary, originalAmounts, sourceDocument]);

  const totals = useMemo(() => calculateTotals(header, lines), [header, lines]);
  const warnings = useMemo(() => draftWarnings(lines), [lines]);
  const loadUnlinkedUploads = useCallback(async () => {
    if (!access.read) return;
    try {
      const documents = await apiClient.getUnlinkedPurchaseDocuments<OriginalDocument[]>();
      setUnlinkedUploads(Array.isArray(documents) ? documents : []);
      setUploadListError(null);
    } catch (err) { setUploadListError(getErrorMessage(err)); }
  }, [access.read]);

  useEffect(() => { void loadUnlinkedUploads(); }, [loadUnlinkedUploads]);

  const loadRecent = useCallback(async () => {
    if (!access.read) return;
    setLoadingList(true);
    setError(null);
    try {
      const response = await apiClient.getPharmacyPurchaseInvoices<PurchaseListResponse>({
        limit: 8,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
      const rows = Array.isArray(response?.data) ? response.data : [];
      setRecent(rows);
      setActiveInvoice((current) => {
        if (!current) {
          const draft = draftSelection.current;
          if (draft.editingId) return rows.find(invoice => invoice.id === draft.editingId) ?? null;
          return draft.hasContent ? null : rows[0] ?? null;
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
    setReviewDate(dateInputFromIso(activeInvoice?.goodsReceivedDate) || todayInput());
  }, [activeInvoice?.goodsReceivedDate, activeInvoice?.id]);

  useEffect(() => {
    // Restore the manual path from known saved automatic-only exceptions. A
    // review still saves the current values and the backend revalidates them.
    setManualReviewCandidateId(activeInvoice && editingId === activeInvoice.id && canResumeManualReview(activeInvoice) ? activeInvoice.id : null);
  }, [activeInvoice?.id, editingId]);

  const updateHeader = (key: keyof HeaderForm, value: string) => {
    setManualReviewCandidateId(null);
    if (key === 'goodsReceivedDate') setReviewDate(value);
    setHeader((current) => {
      const next = { ...current, [key]: value };
      if (key === 'billType' && value === 'CASH') next.dueDate = '';
      return next;
    });
  };

  const updateLine = (localId: string, key: keyof LineForm, value: string) => {
    setManualReviewCandidateId(null);
    setLines((current) =>
      current.map((line) =>
        line.localId === localId ? { ...line, [key]: value } : line,
      ),
    );
  };

  const addLine = () => {
    setManualReviewCandidateId(null);
    setLines((current) => [...current, emptyLine(current.length + 1)]);
  };

  const removeLine = (localId: string) => {
    setManualReviewCandidateId(null);
    if (lines.length <= 1) return;
    const removedIndex = lines.findIndex((line) => line.localId === localId);
    setOriginalAmounts((current) => current && Array.isArray(current.items)
      ? { ...current, itemsChanged: true, items: current.items.filter((_, index) => index !== removedIndex) }
      : current);
    setLines((current) => {
      if (current.length <= 1) return current;
      return current
        .filter((line) => line.localId !== localId)
        .map((line, index) => ({ ...line, serialNumber: String(index + 1) }));
    });
  };

  const updateReportedAmount = (key: string, value: string, lineIndex?: number) => {
    setManualReviewCandidateId(null);
    setOriginalAmounts((current) => {
      if (!current) return current;
      if (lineIndex === undefined) return { ...current, [key]: value };
      if (!Array.isArray(current.items)) return current;
      return { ...current, items: current.items.map((item, index) => index === lineIndex ? { ...item, [key]: value } : item) };
    });
  };

  const resetDraft = () => {
    setShowIntakeHome(false);
    setManualReviewCandidateId(null);
    setActiveInvoice(null);
    setUnknownStockInvoiceId(null);
    setEditingId(null);
    setOriginalAmounts(null);
    setSourceDocument(null);
    setHeaderFlags('');
    setHeader(defaultHeader());
    setLines([emptyLine(1)]);
    setOcrFile(null);
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
    extraction?: OcrExtractionResponse['extraction'],
    matches?: MasterMatchResponse,
  ) => {
    const defaults = defaultHeader();
    setShowIntakeHome(false);
    setManualReviewCandidateId(null);
    setActiveInvoice(null);
    setUnknownStockInvoiceId(null);
    setOriginalAmounts(draft as Record<string, unknown>);
    setEditingId(null);
    setHeaderFlags(purchaseBlockingIssues(draft.ocrFlags || extraction?.flags || []).join(', '));
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
      billType: draft.billType === 'CREDIT' ? 'CREDIT' : 'CASH',
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
      source: draft.source === 'MANUAL' ? 'MANUAL' : 'OCR',
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
    return item as Record<string, unknown>;
  };

  const applyLinePatch = (
    lineIndex: number,
    patch?: MasterConfirmationResponse['linePatch'],
  ) => {
    if (!patch) return;
    setManualReviewCandidateId(null);
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
            patch.packSize !== undefined ? formString(patch.packSize) : line.packSize,
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

  const refreshMasterMatches = async () => {
    if (!access.create) return;
    setMasterRefreshing(true);
    setError(null);
    try {
      const response =
        await apiClient.suggestPharmacyPurchaseMasterMatches<MasterMatchResponse>({
          items: lines.map(linePayload),
        });
      setMasterMatches(response.matches || []);
      setMasterStatuses({});
      setNotice(`Refreshed drug master suggestions for ${lines.length} line${lines.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setMasterRefreshing(false);
    }
  };

  const confirmMasterLine = async (
    match: MasterMatch,
    action: 'MATCH_EXISTING' | 'CREATE_NEW',
    candidate?: MasterCandidate,
    catalog?: PurchaseProductCatalog,
  ): Promise<string | undefined> => {
    if (!access.create) return;
    const line = lines[match.lineIndex];
    if (!line) {
      setError('The purchase line was removed. Refresh drug master suggestions.');
      return;
    }

    if (action === 'CREATE_NEW' && !access.catalogDetails) return 'Product details are not available yet. Reload after the update completes.';
    const confirmed = action === 'CREATE_NEW' || window.confirm(`Confirm this DB master match for ${line.productName || 'this OCR line'}?`);
    if (!confirmed) return;

    const key = `${match.lineIndex}:${action}`;
    setMasterConfirming(key);
    setNotice(null);
    setError(null);
    try {
      const response =
        await apiClient.confirmPharmacyPurchaseMaster<MasterConfirmationResponse>({
          action,
          drugId: candidate?.drug.id,
          catalog,
          item: linePayload(line),
        });
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

  const saveProductDetails = async (drug: MasterDrug, catalog: PurchaseProductCatalog): Promise<string | undefined> => {
    if (!access.editProduct) return 'Product-edit permission is required to correct this saved product.';
    setMasterConfirming(`edit:${drug.id}`);
    setError(null);
    try {
      const updated = await apiClient.patch<MasterDrug>(`/pharmacy/purchase-invoices/master-records/${drug.id}`, catalog);
      setMasterMatches(current => current.map(match => ({ ...match, candidates: match.candidates.map(candidate => candidate.drug.id === drug.id ? { ...candidate, drug: updated } : candidate) })));
      setMasterStatuses(current => Object.fromEntries(Object.entries(current).map(([key, status]) => [key, status.drug.id === drug.id ? { ...status, drug: updated } : status])));
      setManualReviewCandidateId(null);
      setNotice(`Saved product details for ${updated.name}. Choose Save & Process to check the invoice again.`);
    } catch (err) {
      const message = getErrorMessage(err); setError(message); return message;
    } finally { setMasterConfirming(null); }
  };

  const applyAutomationResult = (data: Pick<OcrExtractionResponse, 'invoice' | 'automation'>) => {
    const invoice = data.invoice && data.automation?.status === 'SAVED_FOR_REVIEW'
      ? { ...data.invoice, reconciliationIssues: [...(data.invoice.reconciliationIssues || []), ...data.automation.issues] }
      : data.invoice;
    if (invoice) {
      editSavedDraft(invoice);
      setUnlinkedUploads((current) => current.filter((document) => !invoice.documents?.some((linked) => linked.id === document.id)));
      setRecent((current) => [invoice, ...current.filter((row) => row.id !== invoice.id)].slice(0, 8));
    } else {
      setActiveInvoice(null);
    }
    const outcome = data.automation;
    if (outcome?.status === 'STOCK_COMMITTED') {
      setNotice(`Invoice ${invoice?.invoiceNumber} saved and stock added automatically.`);
      window.dispatchEvent(new CustomEvent('pharmacy-dashboard-refresh'));
    } else if (outcome?.status === 'DUPLICATE') {
      setNotice(`Invoice ${invoice?.invoiceNumber} is already saved. Opened the existing invoice; its values and stock were not changed.`);
    } else if (outcome?.status === 'SAVED_FOR_REVIEW') {
      setNotice(`Invoice ${invoice?.invoiceNumber} saved for correction. Stock has not been added.`);
      setError(null);
    } else {
      setNotice(null);
      setError(`Invoice was not saved. ${outcome?.issues.join(' ') || 'Save the extracted draft after checking the required fields.'}`);
    }
  };

  const processSavedInvoice = async () => {
    if (!access.automate || !activeInvoice || processLock.current) return;
    processLock.current = true;
    setProcessing(true);
    setManualReviewCandidateId(null);
    setError(null);
    setNotice(null);
    try {
      let invoiceId = activeInvoice.id;
      let savedForReview: PurchaseInvoice | undefined;
      if (editingId === activeInvoice.id && !['REVIEWED', 'STOCK_COMMITTED', 'CANCELLED'].includes(activeInvoice.status)) {
        const saved = await saveDraft();
        if (!saved) return;
        invoiceId = saved.id;
        savedForReview = saved;
      }
      const result = await apiClient.processPharmacyPurchaseInvoice<OcrExtractionResponse>(invoiceId);
      if (result.invoice?.id !== invoiceId || !result.automation?.status) {
        throw new Error('Processing did not return a confirmed invoice status. Checking the saved record.');
      }
      applyAutomationResult(result);
      // A clean human-corrected draft may fail stricter automatic checks (such
      // as 98% OCR confidence). Keep manual review reachable after that result.
      // reviewInvoice saves again and the backend revalidates before reviewing.
      if (result.automation?.status === 'SAVED_FOR_REVIEW' && result.invoice?.id === savedForReview?.id &&
        purchaseBlockingIssues(result.automation.issues || []).every(manualReviewOnlyIssue) &&
        savedForReview?.status === 'DRAFT' && !savedForReview.unresolvedOcrFlags && !savedForReview.reconciliationIssues?.length) {
        setManualReviewCandidateId(savedForReview.id);
        setNotice(`Invoice ${savedForReview.invoiceNumber} saved. Automatic intake needs a human review; check the original, then choose Mark Reviewed.`);
      }
    } catch (err) {
      setError(getErrorMessage(err));
      await refreshStockStatus(activeInvoice.id);
    } finally {
      processLock.current = false;
      setProcessing(false);
      focusActionFeedback();
    }
  };

  const extractFromInvoiceFile = async (automate = false) => {
    if (!access.create || (automate && !access.automate)) return;
    if (!ocrFile) {
      setError('Choose an invoice PDF or image first');
      return;
    }

    setExtracting(true);
    setNotice(null);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', ocrFile);
      if (automate && importReceivedDate) form.append('goodsReceivedDate', importReceivedDate);
      const response = await fetch(
        `/api/pharmacy/purchase-invoices/ocr/${automate ? 'import' : 'extract'}`,
        {
          method: 'POST',
          body: form,
          credentials: 'include',
        },
      );

      if (response.status === 401 && typeof window !== 'undefined') {
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
            setNotice('Original file saved. Enter the invoice details manually or retry the upload.');
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
        throw new Error('No purchase invoice draft was extracted');
      }

      applyExtractedDraft(draft, data.extraction, data.masterMatches);
      setSourceDocument(data.sourceDocument || null);
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
          draft.items?.length === 1 ? '' : 's'
        } from ${ocrFile.name}. Review the draft before saving${
          flagCount ? `; ${flagCount} OCR flag${flagCount === 1 ? '' : 's'} need attention` : ''
        }.`,
      );
    } catch (err) {
      setError(getErrorMessage(err) || 'Invoice OCR failed. Try another file or enter manually.');
    } finally {
      setExtracting(false);
      void loadUnlinkedUploads();
    }
  };

  const saveDraft = async () => {
    if (!access.create || saveLock.current || extracting) return;
    setNotice(null);
    setError(null);
    const errors = [...validateDraft(header, lines), ...reportedAmountErrors(originalAmounts)];
    setValidationErrors(errors);
    if (errors.length > 0) { focusActionFeedback(); return; }

    saveLock.current = true;
    setSaving(true);
    try {
      const payload = { ...preserveInvoiceTotals(buildDraftPayload(header, lines), originalAmounts), ocrFlags: splitFlags(headerFlags) || [], sourceDocumentId: sourceDocument?.id };
      const created = editingId
        ? await apiClient.updatePharmacyPurchaseInvoiceDraft<PurchaseInvoice>(editingId, payload)
        : await apiClient.createPharmacyPurchaseInvoiceDraft<PurchaseInvoice>(payload);
      setEditingId(created.id);
      setRecent((current) => [created, ...current.filter((row) => row.id !== created.id)].slice(0, 8));
      setActiveInvoice(created);
      setOriginalAmounts(created as unknown as Record<string, unknown>);
      setSourceDocument(created.documents?.[0] || sourceDocument);
      void loadUnlinkedUploads();
      setNotice(`Purchase invoice ${created.invoiceNumber} saved as ${statusLabel(created.status)}.`);
      return created;
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      saveLock.current = false;
      setSaving(false);
      focusActionFeedback();
    }
  };

  const reviewInvoice = async () => {
    if (!access.review || !activeInvoice || reviewing) return;
    setNotice(null);
    setError(null);
    setReviewing(true);
    try {
      let invoiceToReview = activeInvoice;
      if (access.create && editingId === activeInvoice.id && !['REVIEWED', 'STOCK_COMMITTED', 'CANCELLED'].includes(activeInvoice.status)) {
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

  const commitStock = async () => {
    if (!activeInvoice) return;
    const confirmed = window.confirm(
      `Commit stock for purchase invoice ${activeInvoice.invoiceNumber}? This updates branch inventory and cannot be undone from this screen.`,
    );
    if (!confirmed) return;

    setNotice(null);
    setError(null);
    setCommitting(true);
    try {
      const committed =
        await apiClient.commitPharmacyPurchaseInvoiceStock<PurchaseInvoice>(
          activeInvoice.id,
        );
      if (committed?.id !== activeInvoice.id || (committed.status !== 'STOCK_COMMITTED' && !committed.stockCommittedAt)) {
        throw new Error('Stock commit did not return a confirmed outcome. Checking the saved record.');
      }
      setActiveInvoice(committed);
      setNotice(
        `Stock committed for ${committed.invoiceNumber}${committed.stockCommitReference ? ` (${committed.stockCommitReference})` : ''}.`,
      );
      await loadRecent();
      window.dispatchEvent(new CustomEvent('pharmacy-dashboard-refresh'));
    } catch (err) {
      setError(getErrorMessage(err));
      await refreshStockStatus(activeInvoice.id);
    } finally {
      setCommitting(false);
      focusActionFeedback();
    }
  };

  const refreshStockStatus = async (invoiceId: string) => {
    setRefreshingStockStatus(true);
    setUnknownStockInvoiceId(invoiceId);
    try {
      if (!access.read) throw new Error('Invoice read permission is required');
      const invoice = await apiClient.getPharmacyPurchaseInvoiceById<PurchaseInvoice>(invoiceId);
      if (invoice?.id !== invoiceId || !invoice.status) throw new Error('Invoice status was not returned');
      setActiveInvoice(invoice);
      setManualReviewCandidateId(editingId === invoice.id && canResumeManualReview(invoice) ? invoice.id : null);
      setRecent(current => [invoice, ...current.filter(row => row.id !== invoice.id)].slice(0, 8));
      setUnknownStockInvoiceId(null);
      if (invoice.status === 'STOCK_COMMITTED' || invoice.stockCommittedAt) {
        setError(null);
        setNotice(`Stock added for ${invoice.invoiceNumber}. The saved record confirms the operation completed.`);
        window.dispatchEvent(new CustomEvent('pharmacy-dashboard-refresh'));
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
    setSourceDocument(invoice.documents?.[0] || null);
    setActiveInvoice(invoice);
    setManualReviewCandidateId(canResumeManualReview(invoice) ? invoice.id : null);
    setNotice(null);
  };

  const editingSelectedInvoice = !!activeInvoice && editingId === activeInvoice.id;
  const busy = saving || extracting || processing || reviewing || committing || refreshingStockStatus || savingSupplier || masterConfirming !== null || masterRefreshing;
  const stockStatusUnknown = !!activeInvoice && unknownStockInvoiceId === activeInvoice.id;
  const stockAdded = activeInvoice?.status === 'STOCK_COMMITTED' || !!activeInvoice?.stockCommittedAt;
  const activeIssues = purchaseBlockingIssues(activeInvoice?.reconciliationIssues || []);
  const activeOcrFlags = activeInvoice?.unresolvedOcrFlags || 0;
  const awaitingManualReview = !!activeInvoice && manualReviewCandidateId === activeInvoice.id;
  const canReview =
    access.review && !!activeInvoice && !stockStatusUnknown &&
    (activeInvoice.status === 'DRAFT' && activeIssues.length === 0 || awaitingManualReview &&
      ['DRAFT', 'OCR_REVIEW_REQUIRED', 'RECONCILIATION_FAILED'].includes(activeInvoice.status)) &&
    activeOcrFlags === 0 &&
    (editingId !== activeInvoice.id || (!(splitFlags(headerFlags)?.length) && lines.every(line => !splitFlags(line.ocrFlags)?.length))) &&
    !!reviewDate;
  const canCommit = access.commit && activeInvoice?.status === 'REVIEWED' && !stockStatusUnknown;
  const savedFormLocked = !access.create || stockAdded || stockStatusUnknown || !!editingId && activeInvoice?.id === editingId &&
    ['REVIEWED', 'STOCK_COMMITTED', 'CANCELLED'].includes(activeInvoice.status);
  const navigateIntake = (showHome: boolean) => {
    setShowIntakeHome(showHome);
    headingRef.current?.focus({ preventScroll: true });
    workbenchRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const showSupplierReview = !activeInvoice || !stockAdded && !['REVIEWED', 'CANCELLED'].includes(activeInvoice.status);
  const editingChecks = !savedFormLocked && (!activeInvoice || editingSelectedInvoice);
  const currentHeaderFlags = splitFlags(headerFlags) || [];
  const currentLineFlags = lines.map(line => splitFlags(line.ocrFlags) || []);
  const coveredOcrKeys = new Set([
    ...(editingChecks ? currentHeaderFlags.map(flag => purchaseReviewIssue(flag).key) : []),
    ...(editingChecks ? currentLineFlags.flatMap((flags, index) => flags.map(flag => purchaseReviewIssue(flag, index).key)) : []),
    ...(editingSelectedInvoice ? (activeInvoice?.ocrFlags || []).map(flag => purchaseReviewIssue(flag).key) : []),
    ...(editingSelectedInvoice ? (activeInvoice?.items || []).flatMap((item, index) => (item.ocrFlags || []).map(flag => purchaseReviewIssue(flag, index).key)) : []),
  ]);
  const missingStockFields = editingChecks ? [
    ...(!header.distributorDlNo.trim() ? ['distributorDlNo is required before review'] : []),
    ...(!header.goodsReceivedDate ? ['goodsReceivedDate is required before review'] : []),
    ...(header.billType === 'CREDIT' && !header.dueDate ? ['dueDate is required before review'] : []),
    ...lines.flatMap((line, index) => (['productName', 'packSize', 'packUnitType', 'hsnCode', 'batchNumber'] as const)
      .filter(field => !line[field].trim()).map(field => `Line ${index + 1}: ${field} is required before review`)),
  ] : [];
  const otherReviewIssues = uniquePurchaseReviewIssues([...activeIssues, ...missingStockFields]).filter(issue => !coveredOcrKeys.has(issue.key));
  const manualIssueKeys = new Set(activeIssues.filter(manualReviewOnlyIssue).map(issue => purchaseReviewIssue(issue).key));
  const correctionIssues = otherReviewIssues.filter(issue => !manualIssueKeys.has(issue.key) && issue.key !== 'header:supplier-match');
  const manualConfidenceLines = otherReviewIssues.filter(issue => manualIssueKeys.has(issue.key) && issue.key.endsWith(':confidence')).map(issue => (issue.lineIndex ?? 0) + 1);
  const confirmationCount = editingChecks ? currentHeaderFlags.length + currentLineFlags.reduce((sum, flags) => sum + flags.length, 0) : activeOcrFlags;
  const reviewChecklist = <section id="purchase-review-checklist" aria-labelledby="purchase-review-checklist-title" className="space-y-4 border-t pt-4">
    <div>
      <h4 id="purchase-review-checklist-title" className="font-semibold">Check before adding stock</h4>
      <p className="mt-1 text-sm text-muted-foreground">{editingChecks
        ? `${confirmationCount} field confirmation${confirmationCount === 1 ? '' : 's'} remaining. Correct each value using its link, then confirm it here. Save & Process saves your work and checks the invoice again.`
        : 'Choose Review issues to open the invoice fields and confirmation controls.'}</p>
    </div>
    <PurchaseSupplierReview name={!activeInvoice || editingSelectedInvoice ? header.distributorName : activeInvoice.distributorName}
      gstNumber={!activeInvoice || editingSelectedInvoice ? header.distributorGstin : activeInvoice.distributorGstin}
      canLoad={access.create || access.read} canSave={!!access.saveSupplier} readOnly={!editingChecks} disabled={busy}
      nextAction={access.automate ? 'Save & Process' : access.review ? 'Mark Reviewed' : 'Save corrections'}
      onChange={(distributorName, distributorGstin) => { setManualReviewCandidateId(null); setHeader(current => ({ ...current, distributorName, distributorGstin })); }}
      onSaved={() => setManualReviewCandidateId(null)} onBusy={setSavingSupplier}
      onEdit={activeInvoice && access.create && !savedFormLocked ? () => editSavedDraft(activeInvoice) : undefined} />
    {editingChecks && <>
      <PurchaseOcrChecklist flags={currentHeaderFlags} values={header} disabled={busy}
        onResolve={flag => { setManualReviewCandidateId(null); setHeaderFlags(current => (splitFlags(current) || []).filter(value => value !== flag).join(', ')); }} />
      {lines.map((line, index) => <PurchaseOcrChecklist key={line.localId} flags={currentLineFlags[index]} lineIndex={index} lineId={line.localId} values={line} disabled={busy}
        onResolve={flag => updateLine(line.localId, 'ocrFlags', currentLineFlags[index].filter(value => value !== flag).join(', '))} />)}
    </>}
    {correctionIssues.length > 0 && <ul className="divide-y text-sm">
      {correctionIssues.map(issue => {
        const lineId = issue.lineIndex === undefined ? undefined : lines[issue.lineIndex]?.localId;
        const target = issue.target && (lineId && issue.field ? `${lineId}-${issue.target}` : issue.target);
        return <li key={issue.key} className="space-y-2 py-3 first:pt-0">
          <p className="font-medium">{issue.message}</p>
          <p className="max-w-prose text-muted-foreground">{issue.help}</p>
          <p className="font-medium">{issue.requiresUpload ? 'Upload the complete invoice to resolve this check.' : 'Correct the value, then Save & Process. This check cannot be dismissed with a confirmation.'}</p>
          {editingChecks && <a className="inline-block underline underline-offset-4" href={`#${target || 'distributor-name'}`}>Go to {issue.label}</a>}
        </li>;
      })}
    </ul>}
    {manualConfidenceLines.length > 0 && <div className="space-y-2 border-t pt-3 text-sm">
      <p className="font-semibold">Manual review required</p>
      {manualConfidenceLines.length > 0 && <p>Check the OCR reading on line{manualConfidenceLines.length === 1 ? '' : 's'} {manualConfidenceLines.join(', ')} against the original. Keep the recorded confidence scores unchanged.</p>}
      <p className="font-medium">These checks use Mark Reviewed, then Commit Stock; there is no separate checkbox for them. Resolve the other checks first.</p>
    </div>}
    {editingChecks && confirmationCount === 0 && otherReviewIssues.length === 0 && <p className="text-sm">No outstanding OCR checks. Verify the invoice details, quantities, rates and totals before continuing.</p>}
  </section>;

  const invoiceActions = activeInvoice && (
    <div className="flex flex-wrap items-center gap-2">
      {stockStatusUnknown ? <Button variant="outline" onClick={() => refreshStockStatus(activeInvoice.id)} disabled={busy}>Refresh stock status</Button> : stockAdded || activeInvoice.status === 'CANCELLED' ? null : activeInvoice.status === 'REVIEWED' ? <Button onClick={commitStock} disabled={!canCommit || busy}>
        {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}Commit Stock
      </Button> : canReview && (!editingSelectedInvoice || !access.automate || awaitingManualReview) ? <Button onClick={reviewInvoice} disabled={busy}>
        {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Mark Reviewed
      </Button> : editingSelectedInvoice ? <Button disabled={savedFormLocked || busy} onClick={() => access.automate ? processSavedInvoice() : saveDraft()}>
        {(saving || processing) && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? 'Saving…' : processing ? 'Checking invoice…' : access.automate ? 'Save & Process' : 'Save corrections'}
      </Button> : <Button disabled={!access.create || busy} onClick={() => editSavedDraft(activeInvoice)}>Review issues</Button>}
      {!stockStatusUnknown && !stockAdded && activeInvoice.status !== 'CANCELLED' && activeInvoice.status !== 'REVIEWED' && (!editingSelectedInvoice || !access.automate && canReview) && <details className="relative text-sm" onClick={event => { if ((event.target as HTMLElement).closest('button')) event.currentTarget.open = false; }}>
        <summary className="cursor-pointer rounded-md px-3 py-2 text-muted-foreground">More actions</summary>
        <div className="mt-2 flex flex-wrap gap-2 rounded-md border bg-background p-3">
          {['DRAFT', 'OCR_REVIEW_REQUIRED', 'RECONCILIATION_FAILED'].includes(activeInvoice.status) && <>
            {!editingSelectedInvoice && canReview && <Button size="sm" variant="outline" disabled={!access.create || busy} onClick={() => editSavedDraft(activeInvoice)}>Review issues</Button>}
            {editingSelectedInvoice && canReview && <Button size="sm" variant="outline" disabled={savedFormLocked || busy} onClick={() => saveDraft()}>Save corrections</Button>}
            {access.automate && <Button size="sm" variant="outline" onClick={processSavedInvoice} disabled={busy}>{processing && <Loader2 className="h-4 w-4 animate-spin" />}Process Saved Invoice</Button>}
          </>}
        </div>
      </details>}
    </div>
  );

  const recentInvoices = (
    <details className="rounded-lg border p-4" open={showIntakeHome}>
      <summary className="cursor-pointer text-sm font-medium">Recent invoices ({recent.length})</summary>
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
              className={`h-4 w-4 ${loadingList ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>
      <div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchase invoices found</p>
          ) : (
            recent.map((invoice) => (
              <button
                type="button"
                key={invoice.id}
                disabled={busy}
                onClick={() => { setActiveInvoice(invoice); navigateIntake(false); }}
                className={`min-w-0 w-full rounded-md border p-3 text-left transition-colors ${
                  activeInvoice?.id === invoice.id
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {invoice.invoiceNumber}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {invoice.distributorName}
                    </p>
                  </div>
                  <Badge variant={statusVariant(invoice.status)}>
                    {statusLabel(invoice.status)}
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
    <div ref={workbenchRef} className="space-y-5 [&_[id]]:scroll-mt-40 md:[&_[id]]:scroll-mt-24 [&_input]:min-w-0 [&_[data-slot=card]]:shadow-none" onClick={event => {
      const link = (event.target as HTMLElement).closest('a[href^="#"]');
      const target = link && document.getElementById(link.getAttribute('href')!.slice(1));
      for (let element = target; element; element = element.parentElement) {
        if (element instanceof HTMLDetailsElement) element.open = true;
      }
      if (target?.id === 'purchase-totals') target.querySelectorAll('details').forEach(details => { details.open = true; });
    }}>
      {activeInvoice && !showIntakeHome && <nav aria-label="Invoice navigation" className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b bg-background py-3">
        <Button variant="ghost" onClick={() => navigateIntake(true)} disabled={busy}>
          <ArrowLeft className="h-4 w-4" />Back to Invoice OCR
        </Button>
        <div role="status" aria-label="Stock status" className="min-w-0 text-sm">
          <p className="font-semibold">{stockStatusUnknown ? 'Stock status unknown' : committing ? 'Adding stock…' : processing || saving ? 'Saving and checking invoice…' : stockAdded ? 'Stock added' : 'Stock not added'}</p>
          {stockAdded && activeInvoice.stockCommitReference && <p className="break-all text-xs text-muted-foreground">Reference: {activeInvoice.stockCommitReference}</p>}
        </div>
        {editingSelectedInvoice && !stockAdded && activeInvoice.status !== 'REVIEWED' && <a className="text-sm underline underline-offset-4" href="#purchase-review-checklist">Review checklist</a>}
        {invoiceActions}
      </nav>}
      {permissionsLoading && <p role="status">Loading invoice permissions…</p>}
      {permissionsError && <Alert variant="destructive"><AlertDescription>{permissionsError}</AlertDescription></Alert>}
      {!permissionsLoading && !access.automate && <p className="text-sm text-muted-foreground">Available actions reflect your invoice permissions. Automatic import requires create, review and stock access.</p>}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight">{showIntakeHome ? 'Invoice OCR' : 'Purchase Invoice Intake'}</h3>
          <p className="text-sm text-muted-foreground">
            Upload a bill or continue a saved invoice.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetDraft} disabled={busy}>
            New invoice
          </Button>
          {!activeInvoice && <Button variant="outline" onClick={() => saveDraft()} disabled={busy || savedFormLocked}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Draft
          </Button>}
        </div>
      </div>

      {activeInvoice && showIntakeHome && <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{activeInvoice.invoiceNumber} · {activeInvoice.distributorName}</p>
          <p className="text-sm text-muted-foreground">Your place and any unsaved corrections are kept in this tab.</p>
        </div>
        <Button variant="outline" onClick={() => navigateIntake(false)} disabled={busy}>Resume invoice</Button>
      </div>}

      {!showIntakeHome && recentInvoices}


      <div ref={actionFeedbackRef} id="purchase-action-feedback" tabIndex={-1} className="space-y-3">
        {notice && <p role="status" className="flex items-start gap-2 text-sm">
          {stockAdded ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <FileSearch className="mt-0.5 h-4 w-4 shrink-0" />}{notice}
        </p>}
        {error && <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Request Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>}
        {validationErrors.length > 0 && <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fix Required</AlertTitle>
          <AlertDescription>
            <p className="mb-2">These corrections were not saved. Fix the fields below, then try again.</p>
            <ul className="list-disc pl-4 space-y-1">{validationErrors.map(item => <li key={item}>{item}</li>)}</ul>
          </AlertDescription>
        </Alert>}
      </div>

      {activeInvoice && <section hidden={showIntakeHome} aria-labelledby="purchase-review-title" className="space-y-4 rounded-md border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 id="purchase-review-title" className="text-lg font-semibold">{activeInvoice.status === 'STOCK_COMMITTED' ? 'Stock added' : 'Finish invoice review'}</h4>
            <p className="text-sm text-muted-foreground">{activeInvoice.invoiceNumber} · {activeInvoice.distributorName}</p>
          </div>
          <Badge variant={statusVariant(activeInvoice.status)}>{canResumeManualReview(activeInvoice) ? 'MANUAL REVIEW NEEDED' : statusLabel(activeInvoice.status)}</Badge>
        </div>
        {activeInvoice.status === 'STOCK_COMMITTED' ? <p className="text-sm">This invoice has already added stock. It cannot be committed again.</p>
          : activeInvoice.status === 'CANCELLED' ? <p className="text-sm">This invoice is cancelled and cannot add stock.</p>
          : <>
            <p className="text-sm font-medium">{stockStatusUnknown
              ? 'The request was interrupted. Refresh stock status to confirm the saved outcome before continuing.'
              : activeInvoice.status === 'REVIEWED'
              ? 'Next: Commit Stock. Review is complete; stock has not been added yet.'
              : awaitingManualReview ? 'Next: Mark Reviewed after checking the original, then Commit Stock. Your corrections are saved; stock has not been added.'
              : editingSelectedInvoice && access.automate ? 'Save & Process saves your corrections, checks the invoice and adds stock when every automatic check passes.'
              : canReview ? 'Next: Mark Reviewed, then Commit Stock. Stock has not been added yet.'
              : 'Check the highlighted details against the original, then save your corrections.'}</p>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span>{activeInvoice.items?.length || 0} items · {currency.format(activeInvoice.netPayable || 0)}</span>
                {activeInvoice.documents?.[0] && <a className="text-primary underline underline-offset-4" href={`/api/pharmacy/purchase-invoices/documents/${encodeURIComponent(activeInvoice.documents[0].id)}`} download={activeInvoice.documents[0].fileName}>Open original invoice</a>}
                {!editingSelectedInvoice && <div>
                  <Label htmlFor="review-goods-date">Goods Received Date</Label>
                  <Input id="review-goods-date" type="date" value={reviewDate} disabled={!access.review || activeInvoice.status === 'REVIEWED' || busy} onChange={event => setReviewDate(event.target.value)} />
                </div>}
              </div>

            </div>
            {editingSelectedInvoice && <nav aria-label="Invoice sections" className="flex flex-wrap gap-4 text-sm">
              <a className="underline underline-offset-4" href="#distributor-name">Invoice details</a>
              <a className="underline underline-offset-4" href="#purchase-line-items">Products ({lines.length})</a>
              <a className="underline underline-offset-4" href="#purchase-totals">Totals</a>
            </nav>}
            {!access.review && <p className="text-sm text-muted-foreground">A staff member with invoice review permission must approve this invoice.</p>}
            {activeInvoice.status === 'REVIEWED' && !access.commit && <p className="text-sm text-muted-foreground">A staff member with stock permission must commit it.</p>}
            {!access.create && activeInvoice.status !== 'REVIEWED' && <p className="text-sm text-muted-foreground">A staff member with purchase draft permission must save corrections.</p>}

          </>}
        {!stockAdded && activeInvoice.status !== 'REVIEWED' && activeInvoice.status !== 'CANCELLED' && reviewChecklist}

      </section>}

      {recoveryError && <Alert><AlertDescription>{recoveryError}</AlertDescription></Alert>}


      <div className="space-y-5">
        <div className="space-y-5 min-w-0" hidden={!showIntakeHome && !!activeInvoice && !editingSelectedInvoice}>
          <details className="rounded-lg border p-4" open={showIntakeHome || !editingSelectedInvoice}>
            <summary className="cursor-pointer text-sm font-medium">{editingSelectedInvoice && !showIntakeHome ? 'Replace invoice file' : 'Upload invoice'}</summary>
            <div className="mt-3">
              <CardDescription>
                Import saves the original and adds stock only when every check passes.
              </CardDescription>
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
                    onChange={(event) =>
                      setOcrFile(event.target.files?.[0] || null)
                    }
                    disabled={extracting || saving || processing}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF, JPG, PNG or WebP.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <Label htmlFor="import-received-date">Received on</Label>
                    <Input id="import-received-date" type="date" value={importReceivedDate}
                      onChange={(event) => setImportReceivedDate(event.target.value)}
                      disabled={extracting || saving || processing} />
                  </div>
                  <Button
                    type="button"
                    onClick={() => extractFromInvoiceFile(true)}
                    disabled={!access.automate || extracting || saving || processing || !ocrFile || !importReceivedDate}
                    className="w-full md:w-auto"
                  >
                    {extracting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {extracting ? 'Processing Invoice' : 'Import & Add Stock'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => extractFromInvoiceFile(false)}
                    disabled={!access.create || extracting || saving || processing || !ocrFile}>Extract Draft</Button>
                  <p className="max-w-xs text-xs text-muted-foreground">Extract Draft previews details without adding stock.</p>
                </div>
              </div>

              {sourceDocument && !showIntakeHome && <div className="rounded-md border p-3 text-sm"><p className="mb-1 font-medium">Original file saved</p>{access.read && <OriginalDocumentLink document={sourceDocument} />}</div>}
              {ocrSummary && !showIntakeHome && (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <span className="font-medium">{ocrSummary.fileName || 'Invoice'}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    extracted from {ocrSummary.includedPageCount || 1}
                    {ocrSummary.pageCount && ocrSummary.pageCount !== ocrSummary.includedPageCount
                      ? ` of ${ocrSummary.pageCount}`
                      : ''}{' '}
                    page{(ocrSummary.includedPageCount || 1) === 1 ? '' : 's'}.
                  </span>
                  {ocrSummary.flags?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ocrSummary.flags.map((flag) => (
                        <Badge key={flag} variant="destructive">
                          {flag.replaceAll('_', ' ')}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </details>

          {showIntakeHome && recentInvoices}

          <section hidden={showIntakeHome} aria-label="Invoice details and products">
            {!activeInvoice && reviewChecklist}
          <fieldset disabled={savedFormLocked || busy} className="mt-4 space-y-5 min-w-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Distributor Bill
              </CardTitle>
              <CardDescription>
                Review extracted values or enter the distributor bill manually.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
      {headerFlags && <section id="purchase-header-checks" className="space-y-3 border-b pb-4">
        <details><summary className="cursor-pointer text-sm text-muted-foreground">Advanced OCR flags</summary>
          <Label htmlFor="invoice-ocr-flags">Invoice OCR Flags</Label><Input id="invoice-ocr-flags" disabled={savedFormLocked || saving || extracting || processing} value={headerFlags} onChange={(event) => setHeaderFlags(event.target.value)} />
        </details>
      </section>}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {!showSupplierReview && <>
                <Field
                  id="distributor-name"
                  label="Distributor"
                  value={header.distributorName}
                  onChange={(event) => updateHeader('distributorName', event.target.value)}
                  placeholder="Distributor name"
                />
                <Field
                  id="distributor-gstin"
                  label="GSTIN"
                  value={header.distributorGstin}
                  onChange={(event) =>
                    updateHeader('distributorGstin', event.target.value.toUpperCase())
                  }
                  placeholder="36ABCDE1234F1Z5"
                />
                </>}
                <Field
                  id="distributor-dl"
                  label="DL No."
                  value={header.distributorDlNo}
                  onChange={(event) => updateHeader('distributorDlNo', event.target.value)}
                  placeholder="Drug license number"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field
                  id="invoice-number"
                  label="Invoice No."
                  value={header.invoiceNumber}
                  onChange={(event) => updateHeader('invoiceNumber', event.target.value)}
                />
                <Field
                  id="invoice-date"
                  label="Invoice Date"
                  type="date"
                  value={header.invoiceDate}
                  onChange={(event) => updateHeader('invoiceDate', event.target.value)}
                />
                <Field
                  id="goods-date"
                  label="Goods Received"
                  type="date"
                  value={header.goodsReceivedDate}
                  onChange={(event) => updateHeader('goodsReceivedDate', event.target.value)}
                />
                <div>
                  <Label htmlFor="bill-type">Bill Type</Label>
                  <Select
                    value={header.billType}
                    onValueChange={(value: string) =>
                      updateHeader('billType', value as BillType)
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

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field
                  id="due-date"
                  label="Due Date"
                  type="date"
                  value={header.dueDate}
                  onChange={(event) => updateHeader('dueDate', event.target.value)}
                  disabled={header.billType === 'CASH'}
                />
              </div>
              <details className="border-t pt-3">
                <summary className="cursor-pointer text-sm font-medium">Additional invoice details</summary>
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field
                  id="food-license"
                  label="Food License"
                  value={header.distributorFoodLicense}
                  onChange={(event) =>
                    updateHeader('distributorFoodLicense', event.target.value)
                  }
                  placeholder="Optional"
                />
                <Field
                  id="doctor-reg"
                  label="Doctor / Reg. No. (optional)"
                  value={header.doctorNameOrRegNo}
                  onChange={(event) =>
                    updateHeader('doctorNameOrRegNo', event.target.value)
                  }
                  placeholder="Doctor name or registration"
                />
                <Field
                  id="eway-bill"
                  label="E-Way Bill"
                  value={header.eWayBillNo}
                  onChange={(event) => updateHeader('eWayBillNo', event.target.value)}
                  placeholder="Optional"
                />
                <Field
                  id="lr-no"
                  label="LR No."
                  value={header.lrNo}
                  onChange={(event) => updateHeader('lrNo', event.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field
                  id="buyer-code"
                  label="Buyer Code"
                  value={header.buyerCode}
                  onChange={(event) => updateHeader('buyerCode', event.target.value)}
                  placeholder="Optional"
                />
                <Field
                  id="urc-code"
                  label="URC Code"
                  value={header.urcCode}
                  onChange={(event) => updateHeader('urcCode', event.target.value)}
                  placeholder="Optional"
                />
                <Field
                  id="salesman"
                  label="Salesman"
                  value={header.salesmanName}
                  onChange={(event) => updateHeader('salesmanName', event.target.value)}
                  placeholder="Optional"
                />
                <Field
                  id="salesman-contact"
                  label="Salesman Contact"
                  value={header.salesmanContact}
                  onChange={(event) =>
                    updateHeader('salesmanContact', event.target.value)
                  }
                  placeholder="Optional"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="distributor-address">Distributor Address</Label>
                  <Textarea
                    id="distributor-address"
                    value={header.distributorAddress}
                    onChange={(event) =>
                      updateHeader('distributorAddress', event.target.value)
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
                      updateHeader('handwrittenNotes', event.target.value)
                    }
                    placeholder="Handwritten or OCR notes"
                  />
                </div>
              </div>
                </div>
              </details>
            </CardContent>
          </Card>

          {lines.some((line) => line.productName.trim()) && !savedFormLocked && (
            <details id="purchase-master-matching" open={masterMatches.length > 0 || undefined} className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium">Match products to saved inventory</summary>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileSearch className="h-5 w-5" />
                      Product matching and details
                    </CardTitle>
                    <CardDescription>
                      Match each invoice line to the correct saved product and pack before adding stock. Manufacturer is optional.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={refreshMasterMatches}
                    disabled={!access.create || busy || masterRefreshing || masterConfirming !== null}
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
                {masterMatches.length === 0 && <p className="text-sm text-muted-foreground">Choose Refresh Matches to find saved products. Confirm a match to fill its manufacturer and pack details, then enter the stock unit (Bottle, Tube or Strip) if it is still missing.</p>}
                {masterMatches.map((match) => {
                  if (!access.create) return;
                  const line = lines[match.lineIndex];
                  const best = match.candidates[0];
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
                            Line {match.lineIndex + 1}: {line?.productName || fieldValue(match.ocr?.productName)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Recommended: {match.recommendedAction.replaceAll('_', ' ').toLowerCase()}
                          </p>
                        </div>
                        {status ? (
                          <Badge variant="default">
                            {masterActionLabel(status.action)} {status.drug.name}
                          </Badge>
                        ) : best ? (
                          <Badge variant={best.confidence === 'LOW' ? 'outline' : 'secondary'}>
                            {best.confidence} · {numberFormat.format(best.score)}
                          </Badge>
                        ) : (
                          <Badge variant="outline">No close match</Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <div className="rounded-md bg-muted/40 p-3">
                          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                            OCR / Draft Line
                          </p>
                          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                            <Detail label="Product" value={line?.productName || match.ocr?.productName} />
                            <Detail label="Manufacturer" value={line?.manufacturer || match.ocr?.manufacturer} />
                            <Detail label="Pack" value={line?.packSize || match.ocr?.packSize} />
                            <Detail label="MRP" value={line?.mrp || match.ocr?.mrp} currencyValue />
                            <Detail label="Rate" value={line?.purchaseRate || match.ocr?.purchaseRate} currencyValue />
                            <Detail label="Batch" value={line?.batchNumber || match.ocr?.batchNumber} />
                          </dl>
                        </div>

                        <div className="rounded-md bg-muted/40 p-3">
                          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                            DB Master Candidate
                          </p>
                          {savedProduct ? (
                            <>
                              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                                <Detail label="Product" value={savedProduct.name} />
                                <Detail label="Manufacturer" value={savedProduct.manufacturerName} />
                                <Detail label="Pack" value={savedProduct.packSizeLabel} />
                                <Detail label="MRP" value={savedProduct.price} currencyValue />
                                <Detail label="Product kind" value={savedProduct.productKind || savedProduct.type} />
                                <Detail label="Prescription required" value={savedProduct.requiresPrescription == null ? 'Not recorded' : savedProduct.requiresPrescription ? 'Yes' : 'No'} />
                                <Detail label="Composition" value={savedProduct.composition1} />
                                <Detail label="Strength" value={savedProduct.strength} />
                              </dl>
                              {!status && best?.reasons?.length ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {best.reasons.map((reason) => (
                                    <Badge key={reason} variant="outline">
                                      {reason}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Choose a product kind below and save its known details. Clinical fields are optional for cosmetics and consumables.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col gap-2 md:flex-row md:justify-end">
                        {best && !status && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              confirmMasterLine(match, 'MATCH_EXISTING', best)
                            }
                            disabled={!access.create || busy || masterConfirming !== null}
                          >
                            {masterConfirming === confirmMatchKey && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            Confirm Match
                          </Button>
                        )}
                      </div>
                      {savedProduct && access.catalogDetails && <details className="mt-3" open={(!!savedProduct.catalogIssues?.length && (status || match.recommendedAction === 'MATCH_EXISTING') ? true : undefined)}>
                        <summary className="cursor-pointer text-sm font-medium">Check or correct saved product details</summary>
                        {!!savedProduct.catalogIssues?.length && <p role="alert" className="my-2 text-sm text-destructive">Complete the saved product details: {savedProduct.catalogIssues.join(', ')}. Choose the correct product kind if this is a cosmetic or consumable.</p>}
                        {access.editProduct ? <PurchaseProductDetails key={JSON.stringify(savedProduct)} id={`product-${match.lineIndex}-edit`} product={savedProduct} disabled={busy || masterConfirming !== null} onSave={catalog => saveProductDetails(savedProduct, catalog)} />
                          : <p className="mt-2 text-sm">Staff with product-edit permission must correct this saved record.</p>}
                      </details>}
                      {!status && (access.catalogDetails ? best ? <details className="mt-3" open={match.recommendedAction === 'CREATE_NEW' || undefined}><summary className="cursor-pointer text-sm">This is a different product: create a new record</summary>
                        <PurchaseProductDetails id={`product-${match.lineIndex}-new`} disabled={busy || masterConfirming !== null} onSave={catalog => confirmMasterLine(match, 'CREATE_NEW', undefined, catalog)} />
                      </details> : <div className="mt-3"><PurchaseProductDetails id={`product-${match.lineIndex}-new`} disabled={busy || masterConfirming !== null} onSave={catalog => confirmMasterLine(match, 'CREATE_NEW', undefined, catalog)} /></div>
                        : <p className="mt-3 text-sm">Product creation requires the updated backend. Reload after the update completes.</p>)}
                    </div>
                  );
                })}
            </CardContent>
            </details>
          )}

          <section id="purchase-line-items" className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Line Items</h4>
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
                <section key={line.localId} id={`${line.localId}-review`} className="rounded-lg border" aria-label={`Product line ${index + 1}`}>
                  <div className="p-4">
                    <span className="inline-flex w-full flex-wrap items-center justify-between gap-2 align-middle text-sm">
                      <span className="min-w-0"><strong>{index + 1}. {line.productName.trim() || 'New product'}</strong><span className="mt-1 block text-muted-foreground">{line.batchNumber || 'Batch needed'} · {line.quantityPurchased || '0'} paid + {line.freeQuantity || '0'} free</span></span>
                      <span className="flex items-center gap-3">{line.ocrFlags && <span className="text-destructive">{splitFlags(line.ocrFlags)?.length} checks</span>}<strong>{currency.format(amounts.total)}</strong></span>
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
                        {line.ocrFlags && <details className="mt-2"><summary className="cursor-pointer text-sm text-muted-foreground">Advanced line OCR flags</summary>
                          <Label htmlFor={`${line.localId}-ocr-flags`}>OCR Flags</Label>
                          <Input id={`${line.localId}-ocr-flags`} value={line.ocrFlags} onChange={event => updateLine(line.localId, 'ocrFlags', event.target.value)} />
                        </details>}
                      </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-6 gap-3">
                      <Field
                        id={`${line.localId}-product`}
                        label="Product"
                        value={line.productName}
                        onChange={(event) =>
                          updateLine(line.localId, 'productName', event.target.value)
                        }
                      />
                      <Field
                        id={`${line.localId}-manufacturer`}
                        label="Manufacturer (optional)"
                        value={line.manufacturer}
                        onChange={(event) =>
                          updateLine(line.localId, 'manufacturer', event.target.value)
                        }
                      />
                      <Field
                        id={`${line.localId}-pack-size`}
                        label="Pack Size"
                        value={line.packSize}
                        onChange={(event) =>
                          updateLine(line.localId, 'packSize', event.target.value)
                        }
                        placeholder="Strip of 10"
                      />
                      <Field
                        id={`${line.localId}-unit`}
                        label="Stock unit"
                        placeholder="Bottle, Tube or Strip"
                        value={line.packUnitType}
                        onChange={(event) =>
                          updateLine(line.localId, 'packUnitType', event.target.value)
                        }
                      />
                      <Field
                        id={`${line.localId}-hsn`}
                        label="HSN"
                        value={line.hsnCode}
                        onChange={(event) =>
                          updateLine(line.localId, 'hsnCode', event.target.value)
                        }
                      />
                      <Field
                        id={`${line.localId}-batch`}
                        label="Batch"
                        value={line.batchNumber}
                        onChange={(event) =>
                          updateLine(line.localId, 'batchNumber', event.target.value)
                        }
                      />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                      <Field
                        id={`${line.localId}-expiry-month`}
                        label="Exp. Month"
                        type="number"
                        min="1"
                        max="12"
                        value={line.expiryMonth}
                        onChange={(event) =>
                          updateLine(line.localId, 'expiryMonth', event.target.value)
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
                          updateLine(line.localId, 'expiryYear', event.target.value)
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
                            'quantityPurchased',
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
                          updateLine(line.localId, 'freeQuantity', event.target.value)
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
                          updateLine(line.localId, 'purchaseRate', event.target.value)
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
                          updateLine(line.localId, 'mrp', event.target.value)
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
                          updateLine(line.localId, 'oldMrp', event.target.value)
                        }
                        placeholder="Optional"
                      />
                      <ReadOnlyAmount label="Taxable" value={amounts.taxable} />
                    </div>

                    <details open className="border-t pt-3">
                      <summary className="cursor-pointer text-sm font-medium">Tax, discounts and OCR details</summary>
                      <div className="mt-3 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                      <Field
                        id={`${line.localId}-discount`}
                        label="Disc %"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={line.discountPercent}
                        onChange={(event) =>
                          updateLine(line.localId, 'discountPercent', event.target.value)
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
                            'specialDiscountPercent',
                            event.target.value,
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
                          updateLine(line.localId, 'cgstPercent', event.target.value)
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
                          updateLine(line.localId, 'sgstPercent', event.target.value)
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
                          updateLine(line.localId, 'igstPercent', event.target.value)
                        }
                      />
                      <ReadOnlyAmount label="GST" value={amounts.gst} />
                      <ReadOnlyAmount label="Line Total" value={amounts.total} />
                      <ReadOnlyAmount
                        label="Effective Cost"
                        value={
                          numeric(line.quantityPurchased) + numeric(line.freeQuantity) > 0
                            ? money(
                                amounts.taxable /
                                  (numeric(line.quantityPurchased) +
                                    numeric(line.freeQuantity)),
                              )
                            : 0
                        }
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                    <ReportedAmountsEditor id={line.localId} values={Array.isArray(originalAmounts?.items) ? originalAmounts.items[index] : null}
                      labels={reportedLineAmounts} disabled={savedFormLocked || saving || extracting || processing}
                      onChange={(key, value) => updateReportedAmount(key, value, index)} />
                      </div>
                    </details>
                  </div>
                </section>
              );
            })}
          </section>

          <Card>
            <CardHeader>
              <CardTitle id="purchase-totals" className="text-base">Invoice Totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <details>
                <summary className="cursor-pointer text-sm font-medium">Discounts and adjustments</summary>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                <Field
                  id="trade-discount"
                  label="Trade Disc."
                  type="number"
                  step="0.01"
                  value={header.tradeDiscount}
                  onChange={(event) =>
                    updateHeader('tradeDiscount', event.target.value)
                  }
                />
                <Field
                  id="special-discount"
                  label="Special Disc."
                  type="number"
                  step="0.01"
                  value={header.specialDiscount}
                  onChange={(event) =>
                    updateHeader('specialDiscount', event.target.value)
                  }
                />
                <Field
                  id="cash-discount"
                  label="Cash Disc."
                  type="number"
                  step="0.01"
                  value={header.cashDiscount}
                  onChange={(event) => updateHeader('cashDiscount', event.target.value)}
                />
                <Field
                  id="damage-adjustment"
                  label="Damage Adj."
                  type="number"
                  step="0.01"
                  value={header.damageAdjustment}
                  onChange={(event) =>
                    updateHeader('damageAdjustment', event.target.value)
                  }
                />
                <Field
                  id="visibility-amount"
                  label="Visibility"
                  type="number"
                  step="0.01"
                  value={header.visibilityAmount}
                  onChange={(event) =>
                    updateHeader('visibilityAmount', event.target.value)
                  }
                />
                <Field
                  id="credit-debit-adjustment"
                  label="Cr/Db Adj."
                  type="number"
                  step="0.01"
                  value={header.creditDebitAdjustment}
                  onChange={(event) =>
                    updateHeader('creditDebitAdjustment', event.target.value)
                  }
                />
                <Field
                  id="tcs-amount"
                  label="TCS"
                  type="number"
                  step="0.01"
                  value={header.tcsAmount}
                  onChange={(event) => updateHeader('tcsAmount', event.target.value)}
                />
                <Field
                  id="rounding"
                  label="Rounding"
                  type="number"
                  step="0.01"
                  value={header.rounding}
                  onChange={(event) => updateHeader('rounding', event.target.value)}
                />
              </div>

              </details>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SummaryValue label="Gross" value={currency.format(totals.grossAmount)} />
                <SummaryValue
                  label="Taxable"
                  value={currency.format(totals.taxableAmount)}
                />
                <SummaryValue label="GST" value={currency.format(totals.totalGst)} />
                <SummaryValue label="TCS" value={currency.format(totals.tcsAmount)} />
                <SummaryValue
                  label="Net Payable"
                  value={currency.format(totals.netPayable)}
                  strong
                />
              </div>
              <ReportedAmountsEditor id="invoice" values={originalAmounts} labels={reportedHeaderAmounts}
                disabled={savedFormLocked || saving || extracting || processing}
                onChange={(key, value) => updateReportedAmount(key, value)} />
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
          {(unlinkedUploads.length > 0 || uploadListError) && <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">Saved uploads ({unlinkedUploads.length})</summary>
            <CardHeader><CardTitle className="text-base">Uploads awaiting invoice details</CardTitle>
              <CardDescription>Originals stay saved even when extraction fails. Showing the latest 20.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {uploadListError && <p className="text-sm text-destructive">Could not load saved uploads: {uploadListError}</p>}
              {unlinkedUploads.map((document) => <div key={document.id} className="space-y-2 rounded-md border p-3">
                <OriginalDocumentLink document={document} />
                <Button variant="outline" size="sm" disabled={saving || extracting || processing || savedFormLocked}
                  onClick={() => { setSourceDocument(document); setNotice('Original selected for this draft. Save Draft links the file to the invoice.'); }}>
                  Use for this draft
                </Button>
              </div>)}
              <Button variant="outline" size="sm" onClick={loadUnlinkedUploads}>Refresh saved uploads</Button>
            </CardContent>
          </details>}

          {activeInvoice && !showIntakeHome && <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">Saved invoice details</summary>
            <div className="mt-4 space-y-4">
                  {!!activeInvoice.documents?.length && <div className="space-y-2 text-sm">
                    <p className="font-medium">Original documents</p>
                    {activeInvoice.documents.map((document) => <OriginalDocumentLink key={document.id} document={document} />)}
                  </div>}
                  {activeInvoice.stockCommitReference && (
                    <div className="rounded-md border px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Reference: </span>
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
                          <TableHead className="text-right">Total</TableHead>
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
                                <div className="font-medium">{item.productName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {item.batchNumber} · Exp {item.expiryMonth}/{item.expiryYear}
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
                        {activeInvoice.committedItems.length === 1 ? '' : 's'} posted to inventory.
                      </AlertDescription>
                    </Alert>
                  ) : null}
            </div>
          </details>}
        </aside>
      </div>
    </div>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
};

function OriginalDocumentLink({ document }: { document: OriginalDocument }) {
  return <a className="block break-words text-sm text-primary underline underline-offset-4"
    href={`/api/pharmacy/purchase-invoices/documents/${encodeURIComponent(document.id)}`} download={document.fileName}>
    Download original: {document.fileName} ({Math.max(1, Math.round(document.sizeBytes / 1024))} KB)
  </a>;
}

function ReportedAmountsEditor({ id, values, labels, disabled, onChange }: {
  id: string; values: Record<string, unknown> | null | undefined; labels: Record<string, string>;
  disabled: boolean; onChange: (key: string, value: string) => void;
}) {
  const fields = Object.entries(labels).filter(([key]) => values?.[key] !== undefined && values?.[key] !== null);
  if (!fields.length) return null;
  return <details className="rounded-md border p-3">
    <summary className="cursor-pointer text-sm font-medium">Amounts read from invoice</summary>
    <p className="my-3 text-xs text-muted-foreground">Check these amounts against the invoice and correct any reading errors. Printed amounts stay unchanged when quantities, rates or taxes change. Correct these fields only against the original invoice.</p>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {fields.map(([key, label]) => <Field key={key} id={`${id}-reported-${key}`} label={`Reported ${label}`}
        type="number" min="0" step="0.01" value={String(values?.[key] ?? '')} disabled={disabled}
        onChange={(event) => onChange(key, event.target.value)} />)}
    </div>
  </details>;
}

function Field({ id, label, className, ...props }: FieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
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
      <p className={`truncate text-sm ${strong ? 'font-semibold' : 'font-medium'}`}>
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
  const hasValue = value !== null && value !== undefined && value !== '';
  const display =
    currencyValue && hasValue ? currency.format(numeric(value as string | number)) : fieldValue(value);
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{display}</dd>
    </div>
  );
}
