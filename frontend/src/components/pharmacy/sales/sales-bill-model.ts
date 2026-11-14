import type { BillDiscount } from '@/lib/bill-pricing';
import { isIssuedBillNumber } from '@/lib/bill-number';

export const SALES_BILL_PATH = '/dashboard/pharmacy/sales/bill';

export const PREFILL_KEYS = ['patientId', 'prescriptionId', 'doctorId', 'visitId'] as const;
export type BillPrefill = Partial<Record<(typeof PREFILL_KEYS)[number], string>>;

export type BillSession =
  | { kind: 'new' }
  | { kind: 'draft'; id: string; version: number; number: string | null };
export type DraftSession = Extract<BillSession, { kind: 'draft' }>;

export type BillFields = {
  patientId: string;
  doctorId: string;
  prescriptionId: string;
  paymentMethod: string;
  billingName: string;
  billingPhone: string;
  billingAddress: string;
  billingCity: string;
  billingState: string;
  billingPincode: string;
  notes: string;
};

export type BillLineInput = {
  itemType: 'DRUG' | 'PACKAGE';
  drugId?: string;
  inventoryItemId?: string;
  packageId?: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number | null;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
};

type SavedInvoiceLine = Omit<BillLineInput, 'drugId' | 'inventoryItemId' | 'packageId' | 'taxPercent' | 'dosage' | 'frequency' | 'duration' | 'instructions'> & {
  id: string;
  drugId: string | null;
  inventoryItemId: string | null;
  packageId: string | null;
  taxPercent: number;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  name?: string | null;
  drug: { id: string; name: string; manufacturerName?: string | null; packSizeLabel?: string | null } | null;
  package: {
    id: string;
    name: string;
    packagePrice: number;
    originalPrice: number;
    discountPercent: number;
    category: string;
    subcategory?: string | null;
    description?: string | null;
    instructions?: string | null;
    items?: { id: string; drugId: string; quantity: number; sequence: number; drug: { id: string; name: string } }[];
  } | null;
};

export type SavedInvoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  mutationVersion: number;
  billDiscountKind?: BillDiscount['kind'] | null;
  billDiscountValue?: number;
  patientId: string | null;
  doctorId: string | null;
  prescriptionId: string | null;
  paymentMethod: string;
  billingName: string;
  billingPhone: string;
  billingAddress: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPincode: string | null;
  notes: string | null;
  patient: { id: string; name: string; phone?: string | null } | null;
  doctor: { id: string; firstName: string; lastName: string } | null;
  items: SavedInvoiceLine[];
};

export type SavedDraft = {
  session: DraftSession;
  fields: BillFields;
  billDiscount: BillDiscount | null;
  lines: SavedInvoiceLine[];
  patient: { id: string; name: string; phone?: string } | null;
  doctor: { id: string; firstName: string; lastName: string } | null;
};

export type BillNextStep = 'sale' | 'prescriptions';

export function billHref({ draft, bill, edit, next, prefill }: { draft?: string; bill?: string; edit?: 'discount'; next?: BillNextStep; prefill?: BillPrefill } = {}) {
  const params = new URLSearchParams();
  if (bill) {
    params.set('bill', bill);
    if (edit) params.set('edit', edit);
    if (next) params.set('next', next);
  } else if (draft) params.set('draft', draft);
  else for (const key of PREFILL_KEYS) if (prefill?.[key]) params.set(key, prefill[key]!);
  const query = params.toString();
  return query ? `${SALES_BILL_PATH}?${query}` : SALES_BILL_PATH;
}

export function prefillFrom(params: Pick<URLSearchParams, 'get'>): BillPrefill | undefined {
  const entries = PREFILL_KEYS.map((key) => [key, params.get(key) || undefined] as const).filter(([, value]) => value);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

const BILLING_SECTIONS = new Set(['billing', 'invoices', 'payments']);

/**
 * @cc [owner:nareshshah139,label:product] pharmacy-billing-moves-to-sales
 * The retired Pharmacy Billing address, with or without a section, MUST land on a new Sales bill
 * carrying the same patient, prescription, doctor and visit. Desk and Counter MUST stay put.
 */
export function pharmacyBillingRedirect(params: Pick<URLSearchParams, 'get'>): string | null {
  const section = params.get('section') || params.get('tab') || '';
  const prefill = prefillFrom(params);
  return BILLING_SECTIONS.has(section) || prefill ? billHref({ prefill }) : null;
}

export function billPayload(fields: BillFields, lines: BillLineInput[], billDiscount: BillDiscount | null = null) {
  return {
    ...fields,
    billDiscount: billDiscount?.value ? billDiscount : null,
    items: lines.map((line) => ({
      drugId: line.drugId,
      inventoryItemId: line.inventoryItemId,
      packageId: line.packageId,
      itemType: line.itemType,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxPercent: line.taxPercent,
      dosage: line.dosage,
      frequency: line.frequency,
      duration: line.duration,
      instructions: line.instructions,
    })),
  };
}

type DraftLine = BillLineInput & { name?: string | null; drug?: { name?: string }; package?: { name?: string } };

export function draftProblem(fields: BillFields, lines: DraftLine[], walkIn = false): string | null {
  if (walkIn && (!fields.billingName.trim() || !fields.billingPhone.trim())) return "Enter the customer's name and phone before saving the draft.";
  if (!walkIn && !fields.patientId) return 'Select a patient before saving the draft.';
  if (!lines.length) return 'Add at least one medicine before saving the draft.';
  const unmatched = lines.find((line) => line.itemType === 'DRUG' && (!line.drugId || line.drugId.startsWith('temp_')));
  if (unmatched) return `Choose a stocked product for ${unmatched.name || unmatched.drug?.name || 'the unmatched medicine'} or remove it before saving the draft.`;
  const noGst = lines.find((line) => line.taxPercent === null);
  if (noGst) return `Enter Tax % for ${noGst.name || noGst.drug?.name || noGst.package?.name || 'every item'} before saving the draft.`;
  return null;
}

export function draftFromInvoice(invoice: SavedInvoice): SavedDraft {
  const text = (value: string | null | undefined) => value ?? '';
  return {
    session: {
      kind: 'draft',
      id: invoice.id,
      version: invoice.mutationVersion,
      number: isIssuedBillNumber(invoice.invoiceNumber) ? invoice.invoiceNumber : null,
    },
    fields: {
      patientId: text(invoice.patientId),
      doctorId: text(invoice.doctorId),
      prescriptionId: text(invoice.prescriptionId),
      paymentMethod: invoice.paymentMethod,
      billingName: invoice.billingName,
      billingPhone: invoice.billingPhone,
      billingAddress: text(invoice.billingAddress),
      billingCity: text(invoice.billingCity),
      billingState: text(invoice.billingState),
      billingPincode: text(invoice.billingPincode),
      notes: text(invoice.notes),
    },
    billDiscount: invoice.billDiscountKind ? { kind: invoice.billDiscountKind, value: invoice.billDiscountValue ?? 0 } : null,
    lines: invoice.items,
    patient: invoice.patient ? { id: invoice.patient.id, name: invoice.patient.name, phone: invoice.patient.phone ?? undefined } : null,
    doctor: invoice.doctor,
  };
}

export type DraftRefusal = { status: 404 | 409; message: string };

export function draftRefusal(error: unknown, fallback: string): DraftRefusal | null {
  const status = (error as { status?: number })?.status;
  const message = (error as { body?: { message?: unknown } })?.body?.message;
  if (status === 404 && message === 'Invoice not found') return { status, message: 'This draft was discarded, so it can no longer be saved.' };
  if (status !== 409) return null;
  return { status, message: typeof message === 'string' ? message : fallback };
}

export const draftName = (session: DraftSession) => (session.number ? `Draft ${session.number}` : 'The draft');
