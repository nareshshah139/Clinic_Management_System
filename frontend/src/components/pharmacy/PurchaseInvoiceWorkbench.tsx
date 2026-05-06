'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
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
  unresolvedOcrFlags?: number;
  reconciliationIssues?: string[];
  handwrittenNotes?: string | null;
  stockCommitReference?: string | null;
  items?: PurchaseInvoiceItem[];
  committedItems?: CommittedItem[];
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
  }>;

type OcrExtractionResponse = {
  draft?: ExtractedPurchaseDraft;
  masterMatches?: MasterMatchResponse;
  extraction?: {
    fileName?: string;
    pageCount?: number;
    includedPageCount?: number;
    flags?: string[];
    extractedAt?: string;
  };
};

type MasterDrug = {
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
  const flags = value
    .split(',')
    .map((flag) => flag.trim())
    .filter(Boolean);
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
    ['distributorDlNo', 'Distributor DL number'],
    ['invoiceNumber', 'Invoice number'],
    ['invoiceDate', 'Invoice date'],
    ['doctorNameOrRegNo', 'Doctor name or registration number'],
  ];

  for (const [key, label] of requiredHeader) {
    if (!header[key].trim()) errors.push(`${label} is required`);
  }

  const gstin = header.distributorGstin.trim().toUpperCase();
  if (gstin && !GSTIN_PATTERN.test(gstin)) {
    errors.push('Distributor GSTIN must be a valid 15-character GSTIN');
  }
  if (header.billType === 'CREDIT' && !header.dueDate.trim()) {
    errors.push('Due date is required for credit purchase bills');
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
      ['manufacturer', 'manufacturer'],
      ['packSize', 'pack size'],
      ['packUnitType', 'pack unit type'],
      ['hsnCode', 'HSN code'],
      ['batchNumber', 'batch number'],
    ];
    for (const [key, label] of requiredLine) {
      if (!line[key].trim()) errors.push(`${prefix}: ${label} is required`);
    }

    const purchased = numeric(line.quantityPurchased);
    const free = numeric(line.freeQuantity);
    if (!Number.isInteger(purchased) || !Number.isInteger(free)) {
      errors.push(`${prefix}: purchase and free quantities must be whole numbers`);
    }
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
      expiryYear < 2020
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
          ? money(numeric(line.ocrConfidence))
          : undefined,
        ocrFlags: splitFlags(line.ocrFlags),
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
    ocrFlags: Array.isArray(item.ocrFlags) ? item.ocrFlags.join(', ') : '',
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

export function PurchaseInvoiceWorkbench() {
  const [header, setHeader] = useState<HeaderForm>(() => defaultHeader());
  const [lines, setLines] = useState<LineForm[]>(() => [emptyLine(1)]);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrSummary, setOcrSummary] = useState<OcrExtractionResponse['extraction'] | null>(null);
  const [masterMatches, setMasterMatches] = useState<MasterMatch[]>([]);
  const [masterConfirming, setMasterConfirming] = useState<string | null>(null);
  const [masterRefreshing, setMasterRefreshing] = useState(false);
  const [masterStatuses, setMasterStatuses] = useState<Record<number, MasterStatus>>({});
  const [recent, setRecent] = useState<PurchaseInvoice[]>([]);
  const [activeInvoice, setActiveInvoice] = useState<PurchaseInvoice | null>(null);
  const [reviewDate, setReviewDate] = useState(todayInput());
  const [loadingList, setLoadingList] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => calculateTotals(header, lines), [header, lines]);
  const warnings = useMemo(() => draftWarnings(lines), [lines]);

  const loadRecent = useCallback(async () => {
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
        if (!current) return rows[0] ?? null;
        return rows.find((invoice) => invoice.id === current.id) ?? current;
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    setReviewDate(dateInputFromIso(activeInvoice?.goodsReceivedDate) || todayInput());
  }, [activeInvoice?.goodsReceivedDate, activeInvoice?.id]);

  const updateHeader = (key: keyof HeaderForm, value: string) => {
    setHeader((current) => {
      const next = { ...current, [key]: value };
      if (key === 'billType' && value === 'CASH') next.dueDate = '';
      return next;
    });
  };

  const updateLine = (localId: string, key: keyof LineForm, value: string) => {
    setLines((current) =>
      current.map((line) =>
        line.localId === localId ? { ...line, [key]: value } : line,
      ),
    );
  };

  const addLine = () => {
    setLines((current) => [...current, emptyLine(current.length + 1)]);
  };

  const removeLine = (localId: string) => {
    setLines((current) => {
      if (current.length <= 1) return current;
      return current
        .filter((line) => line.localId !== localId)
        .map((line, index) => ({ ...line, serialNumber: String(index + 1) }));
    });
  };

  const resetDraft = () => {
    setHeader(defaultHeader());
    setLines([emptyLine(1)]);
    setOcrFile(null);
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
      source: 'OCR',
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
  ) => {
    const line = lines[match.lineIndex];
    if (!line) {
      setError('The purchase line was removed. Refresh drug master suggestions.');
      return;
    }

    const confirmed = window.confirm(
      action === 'MATCH_EXISTING'
        ? `Confirm this DB master match for ${line.productName || 'this OCR line'}?`
        : `Create a new drug master record for ${line.productName || 'this OCR line'} from the reviewed OCR values?`,
    );
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
      setError(getErrorMessage(err));
    } finally {
      setMasterConfirming(null);
    }
  };

  const extractFromInvoiceFile = async () => {
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
      const response = await fetch(
        '/api/pharmacy/purchase-invoices/ocr/extract',
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
    }
  };

  const saveDraft = async () => {
    setNotice(null);
    setError(null);
    const errors = validateDraft(header, lines);
    setValidationErrors(errors);
    if (errors.length > 0) return;

    setSaving(true);
    try {
      const created =
        await apiClient.createPharmacyPurchaseInvoiceDraft<PurchaseInvoice>(
          buildDraftPayload(header, lines),
        );
      setActiveInvoice(created);
      setNotice(`Purchase invoice ${created.invoiceNumber} saved as ${statusLabel(created.status)}.`);
      await loadRecent();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const reviewInvoice = async () => {
    if (!activeInvoice) return;
    setNotice(null);
    setError(null);
    setReviewing(true);
    try {
      const reviewed =
        await apiClient.reviewPharmacyPurchaseInvoice<PurchaseInvoice>(
          activeInvoice.id,
          {
            goodsReceivedDate: reviewDate,
            handwrittenNotes: activeInvoice.handwrittenNotes || undefined,
          },
        );
      setActiveInvoice(reviewed);
      setNotice(`Purchase invoice ${reviewed.invoiceNumber} marked reviewed.`);
      await loadRecent();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setReviewing(false);
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
      setActiveInvoice(committed);
      setNotice(
        `Stock committed for ${committed.invoiceNumber}${committed.stockCommitReference ? ` (${committed.stockCommitReference})` : ''}.`,
      );
      await loadRecent();
      window.dispatchEvent(new CustomEvent('pharmacy-dashboard-refresh'));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCommitting(false);
    }
  };

  const activeIssues = activeInvoice?.reconciliationIssues || [];
  const activeOcrFlags = activeInvoice?.unresolvedOcrFlags || 0;
  const canReview =
    !!activeInvoice &&
    activeInvoice.status === 'DRAFT' &&
    activeIssues.length === 0 &&
    activeOcrFlags === 0 &&
    !!reviewDate;
  const canCommit = activeInvoice?.status === 'REVIEWED';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Purchase Invoice Intake</h3>
          <p className="text-sm text-muted-foreground">
            Capture distributor bills, review reconciled drafts, and commit stock explicitly.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetDraft} disabled={saving}>
            Clear
          </Button>
          <Button onClick={saveDraft} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Draft
          </Button>
        </div>
      </div>

      {notice && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Request Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px] gap-5">
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSearch className="h-5 w-5" />
                Invoice OCR
              </CardTitle>
              <CardDescription>
                Upload distributor invoice PDFs or images first, then review and save the extracted draft.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3">
                <div>
                  <Label htmlFor="purchase-invoice-upload">
                    Upload invoice PDF or image
                  </Label>
                  <Input
                    id="purchase-invoice-upload"
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(event) =>
                      setOcrFile(event.target.files?.[0] || null)
                    }
                    disabled={extracting}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Accepts scanned PDFs, photos, JPG, PNG, or WebP. Extraction only prefills this form; stock is not changed.
                  </p>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    onClick={extractFromInvoiceFile}
                    disabled={extracting || !ocrFile}
                    className="w-full md:w-auto"
                  >
                    {extracting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {extracting ? 'Reading Invoice' : 'Extract Draft'}
                  </Button>
                </div>
              </div>

              {ocrSummary && (
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
            </CardContent>
          </Card>

          {masterMatches.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileSearch className="h-5 w-5" />
                      Drug Master Matching
                    </CardTitle>
                    <CardDescription>
                      Confirm the DB record for each OCR line before updating the drug master.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={refreshMasterMatches}
                    disabled={masterRefreshing || masterConfirming !== null}
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
                {masterMatches.map((match) => {
                  const line = lines[match.lineIndex];
                  const best = match.candidates[0];
                  const status = masterStatuses[match.lineIndex];
                  const confirmMatchKey = `${match.lineIndex}:MATCH_EXISTING`;
                  const createKey = `${match.lineIndex}:CREATE_NEW`;
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
                          {best ? (
                            <>
                              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                                <Detail label="Product" value={best.drug.name} />
                                <Detail label="Manufacturer" value={best.drug.manufacturerName} />
                                <Detail label="Pack" value={best.drug.packSizeLabel} />
                                <Detail label="MRP" value={best.drug.price} currencyValue />
                                <Detail label="Composition" value={best.drug.composition1} />
                                <Detail label="Strength" value={best.drug.strength} />
                              </dl>
                              {best.reasons?.length ? (
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
                              Create a new master only after reviewing the OCR values.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col gap-2 md:flex-row md:justify-end">
                        {best && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              confirmMasterLine(match, 'MATCH_EXISTING', best)
                            }
                            disabled={masterConfirming !== null}
                          >
                            {masterConfirming === confirmMatchKey && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            Confirm Match
                          </Button>
                        )}
                        <Button
                          type="button"
                          onClick={() => confirmMasterLine(match, 'CREATE_NEW')}
                          disabled={masterConfirming !== null}
                        >
                          {masterConfirming === createKey && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          )}
                          Create New Master
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                <Field
                  id="distributor-dl"
                  label="DL No."
                  value={header.distributorDlNo}
                  onChange={(event) => updateHeader('distributorDlNo', event.target.value)}
                  placeholder="Drug license number"
                />
                <Field
                  id="food-license"
                  label="Food License"
                  value={header.distributorFoodLicense}
                  onChange={(event) =>
                    updateHeader('distributorFoodLicense', event.target.value)
                  }
                  placeholder="Optional"
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
                <Field
                  id="doctor-reg"
                  label="Doctor / Reg. No."
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
            </CardContent>
          </Card>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Line Items</h4>
              <Button variant="outline" onClick={addLine}>
                <Plus className="h-4 w-4 mr-2" />
                Add Line
              </Button>
            </div>

            {lines.map((line, index) => {
              const amounts = calculateLine(line);
              return (
                <Card key={line.localId}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Line {index + 1}</CardTitle>
                        <CardDescription>
                          {line.productName.trim() || 'Purchase product'}
                        </CardDescription>
                      </div>
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
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                        label="Manufacturer"
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
                        label="Unit"
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
                        onChange={(event) =>
                          updateLine(line.localId, 'ocrConfidence', event.target.value)
                        }
                        placeholder="Manual entry"
                      />
                      <div className="md:col-span-2">
                        <Label htmlFor={`${line.localId}-ocr-flags`}>OCR Flags</Label>
                        <Input
                          id={`${line.localId}-ocr-flags`}
                          value={line.ocrFlags}
                          onChange={(event) =>
                            updateLine(line.localId, 'ocrFlags', event.target.value)
                          }
                          placeholder="comma-separated flags"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice Totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          {(validationErrors.length > 0 || warnings.length > 0) && (
            <div className="space-y-3">
              {validationErrors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Fix Required</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4 space-y-1">
                      {validationErrors.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
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
        </div>

        <aside className="space-y-5 min-w-0">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Recent Purchase Drafts</CardTitle>
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
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No purchase invoices found</p>
                ) : (
                  recent.map((invoice) => (
                    <button
                      type="button"
                      key={invoice.id}
                      onClick={() => setActiveInvoice(invoice)}
                      className={`w-full rounded-md border p-3 text-left transition-colors ${
                        activeInvoice?.id === invoice.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-5 w-5" />
                Review & Stock Commit
              </CardTitle>
              <CardDescription>Selected purchase invoice</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!activeInvoice ? (
                <p className="text-sm text-muted-foreground">Select or save a purchase invoice</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{activeInvoice.invoiceNumber}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {activeInvoice.distributorName}
                        </p>
                      </div>
                      <Badge variant={statusVariant(activeInvoice.status)}>
                        {statusLabel(activeInvoice.status)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <SummaryValue
                        label="Invoice Date"
                        value={formatDate(activeInvoice.invoiceDate)}
                      />
                      <SummaryValue
                        label="Net Payable"
                        value={currency.format(activeInvoice.netPayable || 0)}
                      />
                    </div>
                  </div>

                  {activeIssues.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Reconciliation Issues</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc pl-4 space-y-1">
                          {activeIssues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {activeOcrFlags > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>OCR Review Required</AlertTitle>
                      <AlertDescription>
                        {activeOcrFlags} unresolved OCR flag{activeOcrFlags === 1 ? '' : 's'}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div>
                    <Label htmlFor="review-goods-date">Goods Received Date</Label>
                    <Input
                      id="review-goods-date"
                      type="date"
                      value={reviewDate}
                      onChange={(event) => setReviewDate(event.target.value)}
                      disabled={activeInvoice.status === 'STOCK_COMMITTED'}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      onClick={reviewInvoice}
                      disabled={!canReview || reviewing || committing}
                      variant="outline"
                    >
                      {reviewing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      Mark Reviewed
                    </Button>
                    <Button
                      onClick={commitStock}
                      disabled={!canCommit || committing || reviewing}
                    >
                      {committing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <PackagePlus className="h-4 w-4 mr-2" />
                      )}
                      Commit Stock
                    </Button>
                  </div>

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
                </>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
};

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
