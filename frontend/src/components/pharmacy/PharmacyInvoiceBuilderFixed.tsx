'use client';

import { displayClinicDate } from '@/lib/date-display';
import { isIssuedBillNumber } from '@/lib/bill-number';
import { Spinner } from '@/components/ui/spinner';
import { useState, useEffect, useRef, useCallback } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TabsFontSizeControls,
} from '@/components/ui/tabs';
import {
  Search,
  Plus,
  Trash2,
  Save,
  Calculator,
  User,
  CreditCard,
  Pill,
  Package as PackageIcon,
  FileText,
  Printer,
  Check,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { PrescriptionInventoryLink } from './PrescriptionInventoryLink';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { billLineName, prescribedNameShown } from '@/lib/bill-line-name';
import { getGlobalPrintStyleTag } from '@/lib/printStyles';
import { BillPricingError, priceBill, type BillDiscount } from '@/lib/bill-pricing';
import { BillDiscountInput } from './sales/BillDiscountInput';
import {
  billPayload,
  draftName,
  draftProblem,
  draftRefusal,
  type BillFields,
  type BillPrefill,
  type BillSession,
  type DraftRefusal,
  type DraftSession,
  type SavedDraft,
} from './sales/sales-bill-model';

interface Drug {
  id: string;
  name: string;
  price: number;
  sellingPrice?: number | null;
  mrp?: number | null;
  gstRate?: number | null;
  manufacturerName: string;
  packSizeLabel: string;
  composition1?: string;
  composition2?: string;
  category?: string;
  dosageForm?: string;
  strength?: string;
  totalStock?: number;
  stockName?: string | null;
  requiresPrescription?: boolean | null;
}

interface PharmacyPackage {
  id: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  originalPrice: number;
  packagePrice: number;
  discountPercent: number;
  duration?: string;
  instructions?: string;
  indications?: string;
  contraindications?: string;
  items: {
    id: string;
    drugId: string;
    quantity: number;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
    sequence: number;
    drug: Drug;
  }[];
}

interface Patient {
  id: string;
  name: string;
  phone?: string;
}

interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
  department?: string;
}

interface InvoiceItem {
  inventoryItemId?: string;
  prescriptionLineIndex?: number;
  prescriptionVersion?: string;
  id: string;
  drugId?: string;
  packageId?: string;
  itemType: 'DRUG' | 'PACKAGE';
  drug?: Drug;
  package?: PharmacyPackage;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number | null;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  name?: string;
  prescribedDrugName?: string;
  stockStatus?: 'UNMATCHED' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK' | 'CHECK_FAILED';
  availableStock?: number;
  substituted?: boolean;
  quantityReview?: string;
  quantityConfirmed?: boolean;
}

type CheckoutAttempt = {
  requestKey: string;
  payload: ReturnType<typeof billPayload> & { draftId?: string; draftVersion?: number };
  previewItems: InvoiceItem[];
  confirmed: boolean;
  context?: string;
};

const BLANK_BILL = JSON.stringify([undefined, undefined, undefined, undefined]);

const checkoutStorageKey = 'pharmacy-checkout-attempt-v1';

const PAYMENT_METHODS = [
  ['CASH', 'Cash'],
  ['UPI', 'UPI'],
  ['CARD', 'Card'],
  ['NETBANKING', 'Net banking'],
] as const;

type PrescriptionStockItem = {
  prescriptionVersion?: string;
  inventoryItemId?: string;
  stockName?: string;
  prescribedQuantity?: number | null;
  billingQuantity?: {
    quantity: number;
    unit: string | null;
    review: { reason: string; message: string } | null;
  };
  drugName: string;
  matchedDrug: Pick<Drug, 'id' | 'name'> | null;
  stockStatus: 'UNMATCHED' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';
  totalNonExpiredStock: number;
};

type PharmacyInvoicePrintPreview = {
  invoice: any;
  items: InvoiceItem[];
  billingFallback: {
    billingName: string;
    billingPhone: string;
    billingAddress?: string;
    notes?: string;
  };
};

type PharmacyInvoiceCopyType = 'ORIGINAL' | 'DUPLICATE';

const getDrugGstRate = (drug?: Partial<Drug> | null): number | null => {
  const rate = drug?.gstRate;
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 100
    ? rate : null;
};

const calculateItemTotal = (item: InvoiceItem) => {
  const subtotal = item.quantity * item.unitPrice;
  item.discountAmount = (subtotal * item.discountPercent) / 100;
  const discountedAmount = subtotal - item.discountAmount;
  // Unresolved GST is displayed as pending and cannot be submitted.
  item.taxAmount = (discountedAmount * (item.taxPercent ?? 0)) / 100;
  item.totalAmount = discountedAmount + item.taxAmount;
};

const EMPTY_FIELDS: BillFields = {
  patientId: '',
  doctorId: '',
  prescriptionId: '',
  paymentMethod: 'CASH',
  billingName: '',
  billingPhone: '',
  billingAddress: '',
  billingCity: '',
  billingState: '',
  billingPincode: '',
  notes: '',
};

function savedLines(draft: SavedDraft): InvoiceItem[] {
  return draft.lines.map((line) => {
    const item: InvoiceItem = {
      id: `saved_${line.id}`,
      itemType: line.itemType,
      drugId: line.drugId ?? undefined,
      name: line.name ?? undefined,
      inventoryItemId: line.inventoryItemId ?? undefined,
      packageId: line.packageId ?? undefined,
      drug: line.drug ? { ...line.drug, price: line.unitPrice, manufacturerName: line.drug.manufacturerName ?? '', packSizeLabel: line.drug.packSizeLabel ?? '' } : undefined,
      package: line.package ? ({ ...line.package, subcategory: line.package.subcategory ?? undefined, description: line.package.description ?? undefined, instructions: line.package.instructions ?? undefined, items: line.package.items ?? [] } as unknown as PharmacyPackage) : undefined,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxPercent: line.taxPercent,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
      dosage: line.dosage ?? undefined,
      frequency: line.frequency ?? undefined,
      duration: line.duration ?? undefined,
      instructions: line.instructions ?? undefined,
      quantityConfirmed: true,
    };
    calculateItemTotal(item);
    return item;
  });
}

const doctorName = (doctor: Pick<Doctor, 'firstName' | 'lastName'>) => `Dr. ${doctor.firstName} ${doctor.lastName}`.trim();

export function PharmacyInvoiceBuilderFixed({
  prefill: suppliedPrefill,
  draft,
  onDraftSaved,
  onDiscarded,
  onReloadDraft,
  onDone,
  onFinished,
}: {
  prefill?: BillPrefill;
  draft?: SavedDraft;
  onDraftSaved?: (session: DraftSession) => void;
  onDiscarded?: (session: DraftSession) => void;
  onReloadDraft?: () => void;
  onDone?: () => void;
  onFinished: (bill: { id: string; fromPrescription: boolean }) => void;
}) {
  const incomingPrefillKey = JSON.stringify([
    suppliedPrefill?.patientId,
    suppliedPrefill?.prescriptionId,
    suppliedPrefill?.doctorId,
    suppliedPrefill?.visitId,
  ]);
  const [clearedPrefillKey, setClearedPrefillKey] = useState<string | null>(null);
  const prefill =
    clearedPrefillKey === incomingPrefillKey ? undefined : suppliedPrefill;
  const billingContextVersion = useRef(0);
  useEffect(() => {
    if (clearedPrefillKey !== null && clearedPrefillKey !== incomingPrefillKey)
      setClearedPrefillKey(null);
  }, [incomingPrefillKey, clearedPrefillKey]);

  const { toast } = useToast();
  const [checkoutAttempt, setCheckoutAttempt] = useState<CheckoutAttempt | null>(null);
  const checkoutAttemptRef = useRef<CheckoutAttempt | null>(null);
  const checkoutInFlight = useRef(false);
  /**
   * @cc [owner:nareshshah139,label:product] finished-checkout-stays-with-its-bill
   * A pending checkout MUST be offered for reconciliation on any bill. A confirmed checkout MUST only be
   * shown again when the same bill is reopened, never on a blank new sale, another prescription or another draft.
   */
  const billContext = useRef(draft ? `draft:${draft.session.id}` : incomingPrefillKey).current;
  useEffect(() => {
    const saved = sessionStorage.getItem(checkoutStorageKey);
    if (saved) {
      try {
        const attempt = JSON.parse(saved) as CheckoutAttempt;
        const finishedElsewhere = attempt.confirmed && (attempt.context !== billContext || billContext === BLANK_BILL);
        if (finishedElsewhere) sessionStorage.removeItem(checkoutStorageKey);
        else if (attempt.requestKey && attempt.payload?.items && attempt.previewItems) {
          checkoutAttemptRef.current = attempt;
          setCheckoutAttempt(attempt);
        }
      } catch {
        toast({ title: 'Checkout recovery failed', description: 'Stored checkout could not be read. Check the invoice list before creating another sale.', variant: 'destructive' });
      }
    }
  }, [toast, billContext]);
  const [session, setSession] = useState<BillSession>(draft?.session ?? { kind: 'new' });
  const [billDiscount, setBillDiscount] = useState<BillDiscount | null>(draft?.billDiscount ?? null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(() =>
    draft ? JSON.stringify(billPayload(draft.fields, savedLines(draft), draft.billDiscount)) : null,
  );
  const [savingDraft, setSavingDraft] = useState(false);
  const [refusal, setRefusal] = useState<DraftRefusal | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const refusalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!refusal) return;
    refusalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    refusalRef.current?.focus({ preventScroll: true });
  }, [refusal]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const patientsAllRef = useRef<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [packages, setPackages] = useState<PharmacyPackage[]>([]);
  const [searchResults, setSearchResults] = useState<Drug[]>([]);
  const [resultsQuery, setResultsQuery] = useState('');
  const [focusQuantityFor, setFocusQuantityFor] = useState<string | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>(() => (draft ? savedLines(draft) : []));
  const [prescriptionData, setPrescriptionData] = useState<any>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(draft?.patient ?? null);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(draft?.doctor ?? null);
  const [patientSearchQuery, setPatientSearchQuery] = useState(() =>
    draft?.patient ? `${draft.patient.name}${draft.patient.phone ? ` (${draft.patient.phone})` : ''}` : '',
  );
  const [drugSearchQuery, setDrugSearchQuery] = useState('');
  const drugQueryRef = useRef('');
  drugQueryRef.current = drugSearchQuery;
  const [showPatientSearchResults, setShowPatientSearchResults] =
    useState(false);
  const [showDrugSearchResults, setShowDrugSearchResults] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'drugs' | 'packages'>('drugs');
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [walkIn, setWalkIn] = useState(() => Boolean(draft && !draft.fields.patientId));
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [directionsOpen, setDirectionsOpen] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [loadingPrescription, setLoadingPrescription] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [substitutingItemId, setSubstitutingItemId] = useState<string | null>(null);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printPreviewData, setPrintPreviewData] =
    useState<PharmacyInvoicePrintPreview | null>(null);
  const [printPreviewCopyType, setPrintPreviewCopyType] =
    useState<PharmacyInvoiceCopyType>('ORIGINAL');
  const [printPreviewZoom, setPrintPreviewZoom] = useState(0.9);
  const [savingInvoiceFromPreview, setSavingInvoiceFromPreview] =
    useState(false);

  // Refs for click-outside handling
  const patientSearchRef = useRef<HTMLDivElement>(null);
  const drugSearchRef = useRef<HTMLDivElement>(null);
  const invoiceItemsRef = useRef<InvoiceItem[]>(items);

  const [invoiceData, setInvoiceData] = useState<BillFields>(() => draft?.fields ?? {
    ...EMPTY_FIELDS,
    patientId: prefill?.patientId || '',
    doctorId: prefill?.doctorId || '',
    prescriptionId: prefill?.prescriptionId || '',
  });

  const searchInputRef = useRef<HTMLInputElement>(null);

  const firstPositiveNumber = (...values: unknown[]) => {
    for (const value of values) {
      const numericValue =
        typeof value === 'number' ? value : Number(value ?? NaN);
      if (Number.isFinite(numericValue) && numericValue > 0) {
        return numericValue;
      }
    }
    return 0;
  };

  const getDrugUnitPrice = (drug?: Partial<Drug> | null) =>
    firstPositiveNumber(drug?.price, drug?.sellingPrice, drug?.mrp);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (prefill?.prescriptionId) {
      setInvoiceData((prev) => ({
        ...prev,
        prescriptionId: prefill.prescriptionId as string,
      }));
    }
  }, [prefill?.prescriptionId]);

  const fetchedPrefillPatientsRef = useRef<Set<string>>(new Set());
  const lastPrefilledPrescriptionIdRef = useRef<string | null>(null);
  const lastPrefilledVisitIdRef = useRef<string | null>(null);
  const prescriptionRequestRef = useRef(0);
  const removedPrescriptionIdsRef = useRef(new Set<string>());
  useEffect(() => () => {
    ++billingContextVersion.current;
    ++prescriptionRequestRef.current;
    lastPrefilledPrescriptionIdRef.current = null;
    lastPrefilledVisitIdRef.current = null;
  }, []);

  const ensurePatientSelected = useCallback(
    async (
      patientId?: string,
      fallback?: { name?: string; phone?: string }
    ) => {
      const contextVersion = billingContextVersion.current;
      if (!patientId) {
        if (fallback?.name || fallback?.phone) {
          setInvoiceData((prev) => ({
            ...prev,
            billingName: fallback.name || prev.billingName,
            billingPhone: fallback.phone || prev.billingPhone,
          }));
        }
        return;
      }

      const existingPatient = patients.find((p) => p.id === patientId);
      if (existingPatient) {
        setSelectedPatient(existingPatient);
        setPatientSearchQuery(
          `${existingPatient.name}${existingPatient.phone ? ` (${existingPatient.phone})` : ''}`
        );
        setInvoiceData((prev) => ({
          ...prev,
          patientId: existingPatient.id,
          billingName: existingPatient.name,
          billingPhone: existingPatient.phone || '',
        }));
        return;
      }

      if (fetchedPrefillPatientsRef.current.has(patientId)) {
        return;
      }

      fetchedPrefillPatientsRef.current.add(patientId);
      try {
        const patient = (await apiClient.getPatient(patientId)) as Patient;
        if (contextVersion !== billingContextVersion.current) return;
        if (!patient) {
          throw new Error('Patient not found');
        }
        setPatients((prev) =>
          prev.some((p) => p.id === patient.id) ? prev : [...prev, patient]
        );
        setSelectedPatient(patient);
        setPatientSearchQuery(
          `${patient.name}${patient.phone ? ` (${patient.phone})` : ''}`
        );
        setInvoiceData((prev) => ({
          ...prev,
          patientId: patient.id,
          billingName: patient.name || fallback?.name || '',
          billingPhone: patient.phone || fallback?.phone || '',
        }));
      } catch (error) {
        if (contextVersion !== billingContextVersion.current) return;
        fetchedPrefillPatientsRef.current.delete(patientId);
        console.error('Failed to fetch prefill patient', error);
        toast({
          variant: 'destructive',
          title: 'Unable to prefill patient',
          description:
            'We could not load the patient linked to this prescription. Select a patient to continue.',
        });
        if (fallback?.name || fallback?.phone) {
          setInvoiceData((prev) => ({
            ...prev,
            billingName: fallback.name || prev.billingName,
            billingPhone: fallback.phone || prev.billingPhone,
          }));
        }
      }
    },
    [patients, toast]
  );

  /**
   * @cc [owner:nareshshah139,label:product] prescription-bill-complete-load
   * Every prescribed line MUST load with its quantity, including unmatched and unavailable
   * medicines. Only the stock check's matched product ID may establish an automatic link;
   * failed lookups MUST retain flagged lines and expose a retryable error, never omit them.
   */
  /**
   * @cc [owner:nareshshah139,label:product] prescription-bill-source-line-state
   * Draft edits and removals MUST follow an unchanged prescription source snapshot and duplicate
   * occurrence across reloads and reorder. A changed source line MUST start a fresh draft line.
   */
  /**
   * @cc [owner:nareshshah139,label:product] prescription-stock-revision-match
   * Automatic product links MUST use stock from the loaded prescription revision and source order.
   * Missing or mismatched revision, count or source names MUST reject stock before automatic product
   * lookup, retain prescribed lines, and expose a retryable error.
   */
  const loadPrescriptionData = useCallback(
    async (prescriptionId: string) => {
      const request = ++prescriptionRequestRef.current;
      setLoadingPrescription(true);
      setPrefillError(null);
      try {
        type MinimalPrescription = {
          id?: string;
          items?: any[] | string;
        } & Record<string, unknown>;
        const prescription =
          await apiClient.getPrescription<MinimalPrescription>(prescriptionId);
        if (request !== prescriptionRequestRef.current) return;

        const previousPrefilledMap = new Map<string, InvoiceItem>(
          invoiceItemsRef.current
            .filter((item) => item.id.startsWith('prescription_'))
            .map((item) => [item.id, item])
        );

        const patientFromPrescription = (prescription as any)?.patient || (prescription as any)?.visit?.patient;
        const patientIdFromPrescription =
          (prescription as any)?.patientId || patientFromPrescription?.id;
        await ensurePatientSelected(patientIdFromPrescription, {
          name: patientFromPrescription?.name,
          phone: patientFromPrescription?.phone,
        });
        if (request !== prescriptionRequestRef.current) return;
        setPrescriptionData(prescription);

        // Extract and set doctor information from prescription
        const doctorFromPrescription =
          (prescription as any)?.visit?.doctor || (prescription as any)?.doctor;
        const doctorIdFromPrescription =
          (prescription as any)?.doctorId || doctorFromPrescription?.id;
        if (doctorIdFromPrescription) {
          setInvoiceData((prev) => ({
            ...prev,
            doctorId: doctorIdFromPrescription,
          }));
          // Try to find and set the selected doctor
          if (doctorFromPrescription) setSelectedDoctor(doctorFromPrescription);
        }

        const rawItems = (prescription as any)?.items;
        const prescriptionItemsRaw = Array.isArray(rawItems)
          ? rawItems
          : JSON.parse((rawItems as string | undefined) || '[]');

        if (
          !Array.isArray(prescriptionItemsRaw) ||
          prescriptionItemsRaw.length === 0
        ) {
          throw new Error('Prescription has no medications to load.');
        }

        let stockItems: PrescriptionStockItem[] = [];
        let lookupFailed = false;
        try {
          const stock = await apiClient.get<{ items: PrescriptionStockItem[] }>(
            `/pharmacy/prescription-queue/${prescriptionId}/stock-check`
          );
          const sourceVersion = prescription.updatedAt;
          if (
            typeof sourceVersion !== 'string' || !sourceVersion ||
            !Array.isArray(stock.items) || stock.items.length !== prescriptionItemsRaw.length ||
            stock.items.some((line, index) =>
              line.prescriptionVersion !== sourceVersion ||
              line.drugName !== (prescriptionItemsRaw[index].drugName || prescriptionItemsRaw[index].brandName || prescriptionItemsRaw[index].genericName || 'Unknown drug'),
            )
          ) {
            throw new Error('Prescription changed during inventory lookup. Retry loading the prescription.');
          }
          stockItems = stock.items;
        } catch (error) {
          console.error('Prescription inventory check failed:', getErrorMessage(error));
          lookupFailed = true;
        }

        const occurrences = new Map<string, number>();
        const sourceLineIds = prescriptionItemsRaw.map((item: Record<string, unknown>) => {
          const snapshot = JSON.stringify(Object.keys(item).sort().map(key => [key, item[key]]));
          const occurrence = occurrences.get(snapshot) || 0;
          occurrences.set(snapshot, occurrence + 1);
          return `prescription_${prescriptionId}_${encodeURIComponent(snapshot)}_${occurrence}`;
        });
        const invoiceItems: InvoiceItem[] = await Promise.all(
          prescriptionItemsRaw.map(async (item: any, index: number) => {
            const stock = stockItems[index];
            let drug: Drug | undefined;
            let stockStatus: InvoiceItem['stockStatus'] = stock?.stockStatus || 'CHECK_FAILED';
            try {
              if (stock?.matchedDrug) {
                drug = await apiClient.get<Drug>(`/drugs/${encodeURIComponent(stock.matchedDrug.id)}`);
                if (!drug || drug.id !== stock.matchedDrug.id) throw new Error('Matched inventory product details are unavailable');
              }
            } catch (error) {
              console.error('Prescription product lookup failed:', getErrorMessage(error));
              stockStatus = 'CHECK_FAILED';
              lookupFailed = true;
            }

              const invoiceItemId = sourceLineIds[index];
              const existingItem = previousPrefilledMap.get(invoiceItemId);
              // Preserve pharmacist changes when retrying a failed inventory read.
              const substituted = existingItem?.substituted === true;
              const reviewedDrug = substituted ? existingItem.drug : drug;
              const sameProduct = Boolean(existingItem?.drugId && existingItem.drugId === reviewedDrug?.id);
              const filledQuantity = firstPositiveNumber(item.quantity, item.prescribedQuantity, item.totalQuantity, item.qty, stock?.billingQuantity?.quantity) || 1;
              const keepQuantity = Boolean(existingItem && (existingItem.quantityConfirmed || substituted || !stock));

              const invoiceItem: InvoiceItem = {
                id: invoiceItemId,
                drugId: reviewedDrug?.id,
                name: substituted ? existingItem?.name : stock?.stockName || reviewedDrug?.stockName || undefined,
                prescriptionLineIndex: index,
                prescriptionVersion: stock?.prescriptionVersion,
                inventoryItemId: substituted ? existingItem?.inventoryItemId : stock?.inventoryItemId,
                itemType: 'DRUG',
                drug: reviewedDrug || {
                    id: `temp_${prescriptionId}_${index}`,
                    name: item.drugName || item.brandName || item.genericName || 'Unknown Drug',
                    price: existingItem?.drug?.price ?? 0,
                    manufacturerName:
                      existingItem?.drug?.manufacturerName ?? '',
                    packSizeLabel: existingItem?.drug?.packSizeLabel ?? '',
                  },
                quantity: keepQuantity ? existingItem!.quantity : filledQuantity,
                quantityReview: keepQuantity ? existingItem!.quantityReview : stock?.billingQuantity?.review?.message,
                quantityConfirmed: existingItem?.quantityConfirmed,
                unitPrice: sameProduct ? existingItem!.unitPrice : getDrugUnitPrice(reviewedDrug),
                discountPercent: existingItem?.discountPercent ?? 0,
                taxPercent: sameProduct ? existingItem!.taxPercent : getDrugGstRate(reviewedDrug),
                discountAmount: existingItem?.discountAmount ?? 0,
                taxAmount: existingItem?.taxAmount ?? 0,
                totalAmount: existingItem?.totalAmount ?? 0,
                dosage: item.dosage
                  ? `${item.dosage} ${item.dosageUnit || ''}`.trim()
                  : existingItem?.dosage,
                frequency: item.frequency || existingItem?.frequency,
                duration: item.duration
                  ? `${item.duration} ${item.durationUnit || ''}`.trim()
                  : existingItem?.duration,
                instructions: item.instructions || existingItem?.instructions,
                prescribedDrugName: item.drugName || item.brandName || 'Unknown Drug',
                stockStatus: substituted ? existingItem?.stockStatus : stockStatus,
                availableStock: substituted ? existingItem?.availableStock : stock?.totalNonExpiredStock,
                substituted,
              };

              calculateItemTotal(invoiceItem);
              return invoiceItem;
          })
        );

        if (request !== prescriptionRequestRef.current) return;
        if (lookupFailed) setPrefillError('Prescription loaded, but some inventory details could not be checked. Retry loading or select a replacement for the flagged items.');

        setItems((prevItems) => {
          const filtered = prevItems.filter(
            (item) => !item.id.startsWith('prescription_')
          );
          const merged = [...invoiceItems.filter(item => !removedPrescriptionIdsRef.current.has(item.id)), ...filtered];
          invoiceItemsRef.current = merged;
          return merged;
        });
      } catch (error) {
        if (request !== prescriptionRequestRef.current) return;
        console.error('Failed to load prescription:', getErrorMessage(error));
        const message = `Could not load prescription: ${getErrorMessage(error)}. Retry loading to continue.`;
        setPrefillError(message);
        toast({
          variant: 'destructive',
          title: 'Prescription load failed',
          description: message,
        });
      } finally {
        if (request === prescriptionRequestRef.current) setLoadingPrescription(false);
      }
    },
    [ensurePatientSelected, toast]
  );

  // Ensure patient is selected when patients array is loaded
  useEffect(() => {
    const prefillPatientId = prefill?.patientId;
    if (
      prefillPatientId &&
      patients.length > 0 &&
      selectedPatient?.id !== prefillPatientId
    ) {
      void ensurePatientSelected(prefillPatientId);
    }
  }, [prefill?.patientId, patients, selectedPatient, ensurePatientSelected]);

  // Handle visitId prefill: fetch visit to set patient/doctor; if visit has prescription, load items
  useEffect(() => {
    const run = async () => {
      const contextVersion = billingContextVersion.current;
      const visitId = prefill?.visitId;
      // A selected prescription is authoritative; do not concurrently load the visit's prescription.
      if (!visitId || prefill?.prescriptionId || lastPrefilledVisitIdRef.current === visitId) return;
      lastPrefilledVisitIdRef.current = visitId;
      setLoadingPrescription(true);
      try {
        const visit: any = await apiClient.get(`/visits/${visitId}`);
        if (contextVersion !== billingContextVersion.current) return;
        const patient = visit?.patient;
        if (patient?.id) {
          await ensurePatientSelected(patient.id, {
            name: patient.name,
            phone: patient.phone,
          });
        }
        if (contextVersion !== billingContextVersion.current) return;
        const doc = visit?.doctor;
        if (doc?.id) {
          setSelectedDoctor(
            (prev) =>
              prev || {
                id: doc.id,
                firstName: doc.firstName,
                lastName: doc.lastName,
                department: doc.department,
              }
          );
          setInvoiceData((prev) => ({ ...prev, doctorId: doc.id }));
        }
        const prescId = visit?.prescription?.id;
        if (prescId) {
          lastPrefilledPrescriptionIdRef.current = prescId;
          await loadPrescriptionData(prescId);
          if (contextVersion !== billingContextVersion.current) return;
          setInvoiceData((prev) => ({ ...prev, prescriptionId: prescId }));
        }
      } catch (e) {
        if (contextVersion !== billingContextVersion.current) return;
        console.error('Failed to prefill from visitId', e);
        setPrefillError(`Could not load visit: ${getErrorMessage(e)}. Reopen billing to retry.`);
      } finally {
        if (contextVersion === billingContextVersion.current) setLoadingPrescription(false);
      }
    };
    void run();
  }, [prefill?.visitId, prefill?.prescriptionId, ensurePatientSelected, loadPrescriptionData]);

  useEffect(() => {
    const prefillPrescriptionId = prefill?.prescriptionId;
    if (!prefillPrescriptionId) {
      return;
    }
    if (lastPrefilledPrescriptionIdRef.current === prefillPrescriptionId) {
      return;
    }
    lastPrefilledPrescriptionIdRef.current = prefillPrescriptionId;
    void loadPrescriptionData(prefillPrescriptionId);
  }, [prefill?.prescriptionId, loadPrescriptionData]);

  // Ensure doctor is selected when doctors array is loaded or prefill changes
  useEffect(() => {
    const prefillDoctorId = prefill?.doctorId;
    if (!prefillDoctorId || doctors.length === 0) return;
    if (selectedDoctor && selectedDoctor.id === prefillDoctorId) return;
    const match = doctors.find((d) => d.id === prefillDoctorId);
    if (match) {
      setSelectedDoctor(match);
      setInvoiceData((prev) => ({ ...prev, doctorId: match.id }));
    }
  }, [prefill?.doctorId, doctors, selectedDoctor]);

  useEffect(() => {
    invoiceItemsRef.current = items;
  }, [items]);

  const draftPrescriptionId = draft?.fields.prescriptionId;
  useEffect(() => {
    if (!draftPrescriptionId) return;
    const contextVersion = billingContextVersion.current;
    apiClient.getPrescription(draftPrescriptionId).then(
      (prescription) => {
        if (contextVersion === billingContextVersion.current) setPrescriptionData(prescription);
      },
      (error) => {
        if (contextVersion !== billingContextVersion.current) return;
        setPrefillError(`Could not load the linked prescription: ${getErrorMessage(error)}. Reload the draft to retry.`);
      },
    );
  }, [draftPrescriptionId]);

  // Debounced server-side patient autocomplete
  useEffect(() => {
    const q = patientSearchQuery.trim();
    const handler = setTimeout(async () => {
      try {
        if (q.length < 2) {
          setPatients(patientsAllRef.current);
          return;
        }
        const res = await apiClient.getPatients({ limit: 20, search: q });
        const data = (res as any)?.data || (res as any)?.patients || [];
        if (Array.isArray(data)) {
          setPatients(data);
        }
      } catch (_e) {
        // ignore errors to avoid noisy UX
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [patientSearchQuery]);

  const loadInitialData = async () => {
    const contextVersion = billingContextVersion.current;
    try {
      const [patientsRes, doctorsRes, drugsRes, packagesRes] =
        await Promise.all([
          apiClient.getPatients({ limit: 100 }),
          apiClient.getUsers({ role: 'DOCTOR', limit: 50 }),
          apiClient.get('/drugs', { limit: 100, isActive: true }),
          apiClient.get('/pharmacy/packages', { limit: 100, isActive: true }),
        ]);

      const patientsData =
        (patientsRes as any)?.data || (patientsRes as any)?.patients || [];
      const doctorsData = (doctorsRes as any)?.users || [];
      const drugsData = Array.isArray((drugsRes as any)?.data)
        ? (drugsRes as any).data
        : [];
      const packagesData = Array.isArray((packagesRes as any)?.packages)
        ? (packagesRes as any).packages
        : Array.isArray((packagesRes as any)?.data)
          ? (packagesRes as any).data
          : [];

      setPatients(patientsData);
      patientsAllRef.current = patientsData;
      setDoctors(doctorsData);
      setDrugs(drugsData);
      setPackages(packagesData);

      if (contextVersion !== billingContextVersion.current) return;

      // Set prefilled patient
      if (prefill?.patientId) {
        const patient = patientsData.find(
          (p: Patient) => p.id === prefill.patientId
        );
        if (patient) {
          setSelectedPatient(patient);
          setPatientSearchQuery(
            `${patient.name}${patient.phone ? ` (${patient.phone})` : ''}`
          );
          setInvoiceData((prev) => ({
            ...prev,
            patientId: patient.id,
            billingName: patient.name,
            billingPhone: patient.phone || '',
          }));
          console.log('🎯 Pre-selected patient:', patient.name);
        }
      }

      // Set prefilled doctor
      if (prefill?.doctorId) {
        const doctor = doctorsData.find(
          (d: Doctor) => d.id === prefill.doctorId
        );
        if (doctor) {
          setSelectedDoctor(doctor);
          setInvoiceData((prev) => ({
            ...prev,
            doctorId: doctor.id,
          }));
          console.log(
            '🎯 Pre-selected doctor:',
            `${doctor.firstName} ${doctor.lastName}`
          );
        }
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const loadPatients = async () => {
    try {
      const response = await apiClient.get('/patients', { limit: 100 });
      if (response && Array.isArray((response as any).data)) {
        setPatients((response as any).data);
        patientsAllRef.current = (response as any).data;
      } else {
        console.warn('Invalid patients response format:', response);
        setPatients([]);
        patientsAllRef.current = [];
      }
    } catch (error) {
      console.error('Error loading patients:', error);
      setPatients([]);
      patientsAllRef.current = [];
    }
  };

  const loadDoctors = async () => {
    try {
      const response = await apiClient.get('/users', {
        role: 'DOCTOR',
        limit: 100,
      });
      if (response && Array.isArray((response as any).users)) {
        setDoctors((response as any).users);
      } else {
        console.warn('Invalid doctors response format:', response);
        setDoctors([]);
      }
    } catch (error) {
      console.error('Error loading doctors:', error);
      setDoctors([]);
    }
  };

  const loadPackages = async () => {
    try {
      const response = await apiClient.get('/pharmacy/packages', {
        category: 'Dermatology',
        limit: 50,
      });
      if (response && Array.isArray((response as any).packages)) {
        setPackages((response as any).packages);
      } else {
        console.warn('Invalid packages response format:', response);
        setPackages([]);
      }
    } catch (error) {
      console.error('Error loading packages:', error);
      setPackages([]);
    }
  };

  const searchDrugs = async (query: string): Promise<Drug[]> => {
    if (!query.trim()) {
      setSearchResults([]);
      setResultsQuery('');
      setShowDrugSearchResults(false);
      return [];
    }

    try {
      const response = await apiClient.get<Drug[]>('/drugs/autocomplete', { q: query, limit: 20 });
      if (Array.isArray(response)) {
        if (query.trim() !== drugQueryRef.current.trim()) return response;
        setSearchResults(response);
        setResultsQuery(query.trim());
        setShowDrugSearchResults(true);
        return response;
      }
      console.warn('Invalid drugs response format:', response);
    } catch (error) {
      console.error('Error searching drugs:', error);
    }
    setSearchResults([]);
    setResultsQuery('');
    setShowDrugSearchResults(false);
    return [];
  };

  useEffect(() => {
    if (!focusQuantityFor) return;
    const input = document.getElementById(`quantity-${focusQuantityFor}`) as HTMLInputElement | null;
    if (!input) return;
    input.focus();
    input.select();
    setFocusQuantityFor(null);
  }, [focusQuantityFor, items]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (selectedTab === 'drugs') {
        searchDrugs(drugSearchQuery);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [drugSearchQuery, selectedTab]);

  // Click-outside and keyboard handler for search dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Close patient search dropdown if clicked outside
      if (
        patientSearchRef.current &&
        !patientSearchRef.current.contains(target)
      ) {
        setShowPatientSearchResults(false);
      }

      // Close drug search dropdown if clicked outside
      if (drugSearchRef.current && !drugSearchRef.current.contains(target)) {
        if (selectedTab === 'drugs') {
          setShowDrugSearchResults(false);
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Close dropdowns on Escape key
      if (event.key === 'Escape') {
        setShowPatientSearchResults(false);
        setShowDrugSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedTab]);

  const generateItemId = () =>
    `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Highlight matching text in search results
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim() || !text) return text;

    const regex = new RegExp(
      `(${query
        .split(/\s+/)
        .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|')})`,
      'gi'
    );

    const parts = text.split(regex);
    return parts.map((part, index) =>
      regex.test(part) ? (
        <span key={index} className="bg-yellow-200 font-semibold">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  // Get relevance badge for search results
  const getRelevanceBadge = (drug: any, query: string, index: number) => {
    if (index === 0)
      return (
        <Badge
          variant="default"
          className="text-xs ml-2 whitespace-nowrap bg-green-100 text-green-800"
        >
          Best match · Enter
        </Badge>
      );
    if (index < 3)
      return (
        <Badge
          variant="secondary"
          className="text-xs ml-2 whitespace-nowrap bg-blue-100 text-blue-800"
        >
          High match
        </Badge>
      );
    return null;
  };

  /**
   * @cc [owner:nareshshah139,label:product] prescription-explicit-substitution
   * A pharmacist-selected replacement MUST retain the original prescribed name, quantity,
   * and instructions while replacing the billed product identity, price, GST and stock warning.
   */
  const addDrugToInvoice = (drug: Drug) => {
    if (substitutingItemId) {
      setItems(current => current.map(item => {
        if (item.id !== substitutingItemId) return item;
        const replacement: InvoiceItem = {
          ...item, drugId: drug.id, drug, name: drug.stockName || undefined, unitPrice: getDrugUnitPrice(drug),
          taxPercent: getDrugGstRate(drug), availableStock: drug.totalStock,
          inventoryItemId: undefined,
          substituted: true,
          stockStatus: drug.totalStock === undefined ? undefined : drug.totalStock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
        };
        calculateItemTotal(replacement);
        return replacement;
      }));
      setSubstitutingItemId(null);
      setDrugSearchQuery('');
      setShowDrugSearchResults(false);
      return;
    }
    const existingItemIndex = items.findIndex(
      (item) => item.itemType === 'DRUG' && item.drugId === drug.id
    );

    if (existingItemIndex !== -1) {
      // Increase quantity if already exists
      const updatedItems = [...items];
      updatedItems[existingItemIndex].quantity += 1;
      calculateItemTotal(updatedItems[existingItemIndex]);
      setItems(updatedItems);
      setFocusQuantityFor(updatedItems[existingItemIndex].id);
    } else {
      // Add new item
      const newItem: InvoiceItem = {
        id: generateItemId(),
        drugId: drug.id,
        name: drug.stockName || undefined,
        itemType: 'DRUG',
        drug,
        quantity: 1,
        unitPrice: getDrugUnitPrice(drug),
        discountPercent: 0,
        taxPercent: getDrugGstRate(drug),
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
      };

      calculateItemTotal(newItem);
      setItems([...items, newItem]);
      setFocusQuantityFor(newItem.id);
    }

    setDrugSearchQuery('');
    setShowDrugSearchResults(false);
  };

  const addTopMatch = async () => {
    const query = drugSearchQuery.trim();
    if (!query) return;
    const matches = resultsQuery === query ? searchResults : await searchDrugs(query);
    if (matches[0]) addDrugToInvoice(matches[0]);
  };

  const addPackageToInvoice = (pkg: PharmacyPackage) => {
    const existingItemIndex = items.findIndex(
      (item) => item.itemType === 'PACKAGE' && item.packageId === pkg.id
    );

    if (existingItemIndex !== -1) {
      // Increase quantity if already exists
      const updatedItems = [...items];
      updatedItems[existingItemIndex].quantity += 1;
      calculateItemTotal(updatedItems[existingItemIndex]);
      setItems(updatedItems);
    } else {
      // Add new item
      const newItem: InvoiceItem = {
        id: generateItemId(),
        packageId: pkg.id,
        itemType: 'PACKAGE',
        package: pkg,
        quantity: 1,
        unitPrice: pkg.packagePrice,
        discountPercent: 0,
        taxPercent: 18, // Default GST
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        instructions: pkg.instructions,
      };

      calculateItemTotal(newItem);
      setItems([...items, newItem]);
    }
  };

  const updateItemQuantity = (
    itemId: string,
    quantity: number,
    itemType: 'DRUG' | 'PACKAGE'
  ) => {
    const updatedItems = items.map((item) => {
      if (item.id === itemId) {
        const updatedItem = { ...item, quantity: Math.max(1, quantity), quantityReview: undefined, quantityConfirmed: true };
        calculateItemTotal(updatedItem);
        return updatedItem;
      }
      return item;
    });
    setItems(updatedItems);
  };

  const clearQuantityReview = (itemId: string) => {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, quantityReview: undefined, quantityConfirmed: true } : item)),
    );
  };

  const updateItemUnitPrice = (itemId: string, unitPrice: number) => {
    const updatedItems = items.map((item) => {
      if (item.id === itemId) {
        const updatedItem = {
          ...item,
          unitPrice: Math.max(0, unitPrice),
        };
        calculateItemTotal(updatedItem);
        return updatedItem;
      }
      return item;
    });
    setItems(updatedItems);
  };

  const updateItemDiscount = (itemId: string, discountPercent: number) => {
    const updatedItems = items.map((item) => {
      if (item.id === itemId) {
        const updatedItem = {
          ...item,
          discountPercent: Math.max(0, Math.min(100, discountPercent)),
        };
        calculateItemTotal(updatedItem);
        return updatedItem;
      }
      return item;
    });
    setItems(updatedItems);
  };

  const updateItemTax = (itemId: string, taxPercent: number | null) => {
    const updatedItems = items.map((item) => {
      if (item.id === itemId) {
        const updatedItem = {
          ...item,
          taxPercent: taxPercent !== null && Number.isFinite(taxPercent)
            ? Math.max(0, Math.min(100, taxPercent)) : null,
        };
        calculateItemTotal(updatedItem);
        return updatedItem;
      }
      return item;
    });
    setItems(updatedItems);
  };

  const updateItemPrescriptionField = (
    itemId: string,
    field: 'dosage' | 'frequency' | 'duration' | 'instructions',
    value: string
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
    );
  };

  /**
   * @cc [owner:nareshshah139,label:product] prescription-draft-removal
   * Removing a prescribed medicine MUST remove only that draft bill line and MUST NOT
   * alter the doctor's prescription. Unmatched and unavailable lines are removable too.
   */
  const removeItem = (itemId: string) => {
    if (itemId.startsWith('prescription_')) removedPrescriptionIdsRef.current.add(itemId);
    setItems(items.filter((item) => item.id !== itemId));
    if (substitutingItemId === itemId) setSubstitutingItemId(null);
  };

  const calculateInvoiceTotals = () => {
    const lines = items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      taxPercent: item.taxPercent ?? 0,
    }));
    let discountProblem: string | null = null;
    let price;
    try {
      price = priceBill(lines, billDiscount);
    } catch (error) {
      if (!(error instanceof BillPricingError)) throw error;
      discountProblem = error.message;
      price = priceBill(lines, null);
    }
    return {
      subtotal: price.subtotal,
      lineDiscount: price.lineDiscount,
      billDiscountAmount: price.billDiscount,
      totalDiscount: price.discount,
      totalTax: price.tax,
      grandTotal: price.total,
      discountProblem,
    };
  };

  const walkInPrescriptionProblem = (item: InvoiceItem) =>
    walkIn && !invoiceData.patientId && item.itemType === 'DRUG' && item.drug?.requiresPrescription
      ? `${billLineName(item)} needs a prescription. Choose the patient instead of Walk-in customer.`
      : null;

  const getValidInvoiceItems = () => {
    if (loadingPrescription || (invoiceData.prescriptionId && !prescriptionData)) {
      toast({ title: 'Prescription not ready', description: 'Wait for the prescription to load, or retry the failed load before billing.', variant: 'destructive' });
      return null;
    }
    if (
      (!invoiceData.patientId && !walkIn) ||
      items.length === 0 ||
      !invoiceData.billingName.trim() ||
      !invoiceData.billingPhone.trim()
    ) {
      toast({
        title: 'Validation Error',
        description: !invoiceData.patientId && !walkIn
          ? 'Choose a patient, or Walk-in customer'
          : items.length === 0
            ? 'At least one item is required'
            : !invoiceData.billingName.trim()
              ? walkIn ? "Enter the customer's name" : 'Billing name is required'
              : walkIn ? "Enter the customer's phone" : 'Billing phone is required',
        variant: 'destructive',
      });
      return null;
    }

    const prescriptionProblem = items.map(walkInPrescriptionProblem).find(Boolean);
    if (prescriptionProblem) {
      toast({ title: 'Choose the patient', description: prescriptionProblem, variant: 'destructive' });
      return null;
    }

    if (discountProblem) {
      toast({ title: 'Check the bill discount', description: discountProblem, variant: 'destructive' });
      return null;
    }

    if (items.some(item => item.itemType === 'DRUG' && (!item.drugId || item.drugId.startsWith('temp_')))) {
      toast({ title: 'Medicine needs review', description: 'Select a replacement or remove each unmatched medicine before confirming the invoice.', variant: 'destructive' });
      return null;
    }

    if (items.some(item => item.taxPercent === null)) {
      toast({
        title: 'GST rate needs review',
        description: 'Enter Tax % for every item before previewing or confirming the invoice.',
        variant: 'destructive',
      });
      return null;
    }

    // Filter out items with temporary drugIds (not found in DB)
    const validItems = items.filter((item) => {
      if (item.itemType === 'PACKAGE') return !!item.packageId;
      const hasValidDrugId = item.drugId && !item.drugId.startsWith('temp_');
      return hasValidDrugId;
    });

    if (validItems.length === 0) {
      toast({
        title: 'Validation Error',
        description:
          'No valid items to invoice. Please ensure all drugs exist in the database.',
        variant: 'destructive',
      });
      return null;
    }

    if (validItems.length < items.length) {
      const skippedCount = items.length - validItems.length;
      toast({
        title: 'Warning',
        description: `${skippedCount} item(s) skipped because the drug was not found in the database. Please add missing drugs first.`,
        variant: 'destructive',
      });
      return null;
    }

    return validItems;
  };

  /**
   * @cc [owner:nareshshah139,label:product] checkout-stable-attempt
   * Checkout MUST persist its exact payload and request key before sending the atomic command.
   * An uncertain response or reload MUST retain that attempt for reconciliation before a new sale.
   */
  const createAndConfirmInvoice = async (
    validItems: InvoiceItem[],
    copyType: PharmacyInvoiceCopyType = printPreviewCopyType,
    recovery?: CheckoutAttempt,
  ) => {
    if (checkoutInFlight.current) return;
    checkoutInFlight.current = true;
    let attempt: CheckoutAttempt | null = null;
    try {
      setLoading(true);

      const invoicePayload = {
        ...billPayload(invoiceData, validItems, billDiscount),
        ...(session.kind === 'draft' ? { draftId: session.id, draftVersion: session.version } : {}),
      };

      const previous = checkoutAttemptRef.current;
      if (!recovery && previous && !previous.confirmed && JSON.stringify(previous.payload) !== JSON.stringify(invoicePayload)) {
        throw new Error('Resolve the pending checkout before changing its details or starting another sale. Use Retry pending checkout.');
      }
      attempt = recovery || (previous && JSON.stringify(previous.payload) === JSON.stringify(invoicePayload) ? previous : {
        requestKey: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''),
        payload: invoicePayload,
        previewItems: validItems,
        confirmed: false,
        context: billContext,
      });
      sessionStorage.setItem(checkoutStorageKey, JSON.stringify(attempt));
      checkoutAttemptRef.current = attempt;
      setCheckoutAttempt(attempt);
      const createdInvoice: any = await apiClient.post('/pharmacy/invoices/checkout', {
        ...attempt.payload, requestKey: attempt.requestKey,
      });
      if (!createdInvoice?.id || !['CONFIRMED', 'DISPENSED', 'COMPLETED'].includes(createdInvoice.status)) {
        throw new Error('Checkout response was incomplete. Retry the pending checkout to confirm its result.');
      }
      attempt = { ...attempt, confirmed: true };
      sessionStorage.setItem(checkoutStorageKey, JSON.stringify(attempt));
      checkoutAttemptRef.current = attempt;
      setCheckoutAttempt(attempt);

      // Fetch saved invoice to ensure printed data matches backend totals
      let printableInvoice: any = createdInvoice;
      try {
        if (createdInvoice?.id) {
          printableInvoice = await apiClient.getPharmacyInvoicePrintData(
            createdInvoice.id,
            { format: 'A5', copyType }
          );
        }
      } catch (e) {
        try {
          if (createdInvoice?.id) {
            printableInvoice = await apiClient.getPharmacyInvoiceById(
              createdInvoice.id
            );
          }
        } catch {
          // Fallback to created response if fetch fails
        }
      }

      toast({
        title: 'Bill confirmed',
        description: `Bill ${printableInvoice?.invoice?.invoiceNumber || printableInvoice?.invoiceNumber || ''} is paid.`,
      });

      // Notify dashboard to refresh stats
      if (typeof window !== 'undefined') {
        const ev = new CustomEvent('pharmacy-dashboard-refresh');
        window.dispatchEvent(ev);
        const ev2 = new CustomEvent('pharmacy-invoices-refresh');
        window.dispatchEvent(ev2);
      }

      return { id: createdInvoice.id as string, printable: printableInvoice };
    } catch (error: any) {
      const draftRefused = attempt?.payload.draftId ? draftRefusal(error, 'This draft can no longer be finished.') : null;
      if (attempt && !attempt.confirmed && ([400, 404].includes(error?.status) || draftRefused)) {
        sessionStorage.removeItem(checkoutStorageKey);
        checkoutAttemptRef.current = null;
        setCheckoutAttempt(null);
      }
      if (draftRefused) {
        setRefusal(draftRefused);
        setPrintPreviewOpen(false);
        return null;
      }
      const message = getErrorMessage(error);
      const status = error?.status;
      const body = error?.body;
      const meta: Record<string, unknown> = {};
      if (typeof status === 'number') meta.status = status;
      if (typeof body === 'string' && body.length > 0) meta.body = body;
      if (body && typeof body === 'object' && Object.keys(body).length > 0)
        meta.body = body;
      if (Object.keys(meta).length > 0) {
        console.error('❌ Error creating invoice:', message, meta);
      } else {
        console.error('❌ Error creating invoice:', message);
      }
      toast({
        title: 'Bill not confirmed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      checkoutInFlight.current = false;
      setLoading(false);
    }
    return null;
  };

  /**
   * @cc [owner:nareshshah139,label:product] draft-save-reopen
   * Save draft MUST store the patient, doctor, prescription link, payment method, billing details,
   * notes and every line without moving stock. A save MUST name the version it was edited from;
   * a refusal MUST be shown with a way to reload, never retried over the other change.
   */
  const saveDraft = async () => {
    const problem = draftProblem(invoiceData, items, walkIn) ?? discountProblem;
    if (problem) {
      toast({ title: 'Draft not saved', description: problem, variant: 'destructive' });
      return;
    }
    const payload = billPayload(invoiceData, items, billDiscount);
    setSavingDraft(true);
    try {
      const saved = session.kind === 'draft'
        ? await apiClient.updatePharmacyInvoice(session.id, { ...payload, expectedVersion: session.version })
        : await apiClient.post('/pharmacy/invoices', payload);
      const { id, mutationVersion, invoiceNumber } = saved as { id: string; mutationVersion: number; invoiceNumber: string };
      const next: DraftSession = { kind: 'draft', id, version: mutationVersion, number: isIssuedBillNumber(invoiceNumber) ? invoiceNumber : null };
      setSession(next);
      setSavedSnapshot(JSON.stringify(payload));
      onDraftSaved?.(next);
      toast({ title: 'Draft saved', description: `${invoiceData.billingName || 'This bill'} is in Sales as a draft. Open it from the Draft row to finish it.` });
    } catch (error) {
      const refused = draftRefusal(error, 'This draft can no longer be saved.');
      if (refused) setRefusal(refused);
      else toast({ title: 'Draft not saved', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setSavingDraft(false);
    }
  };

  const discardDraft = async () => {
    if (session.kind !== 'draft') return;
    setDiscarding(true);
    try {
      await apiClient.delete(`/pharmacy/invoices/${encodeURIComponent(session.id)}?version=${session.version}`);
      setDiscardOpen(false);
      toast({ title: 'Draft discarded', description: `${draftName(session)} for ${invoiceData.billingName || 'this patient'} was removed. No stock moved.` });
      onDiscarded?.(session);
    } catch (error) {
      setDiscardOpen(false);
      const refused = draftRefusal(error, 'This draft can no longer be discarded.');
      if (refused) setRefusal(refused);
      else toast({ title: 'Draft not discarded', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setDiscarding(false);
    }
  };

  const buildDraftPreviewInvoice = () => ({
    id: undefined,
    invoiceNumber: 'DRAFT',
    status: 'DRAFT',
    paymentStatus: 'PENDING',
    invoiceDate: new Date().toISOString(),
    subtotal,
    discountAmount: totalDiscount,
    lineDiscountAmount: lineDiscount,
    billDiscountKind: billDiscount?.kind ?? null,
    billDiscountValue: billDiscount?.value ?? 0,
    billDiscountAmount,
    taxAmount: totalTax,
    totalAmount: grandTotal,
    billingName: invoiceData.billingName,
    billingPhone: invoiceData.billingPhone,
    billingAddress: invoiceData.billingAddress,
    notes: invoiceData.notes,
  });

  const handleOpenPrintPreview = () => {
    const validItems = getValidInvoiceItems();
    if (!validItems) return;

    setPrintPreviewCopyType('ORIGINAL');
    setPrintPreviewZoom(0.9);
    setPrintPreviewData({
      invoice: buildDraftPreviewInvoice(),
      items: validItems,
      billingFallback: {
        billingName: invoiceData.billingName,
        billingPhone: invoiceData.billingPhone,
        billingAddress: invoiceData.billingAddress,
        notes: invoiceData.notes,
      },
    });
    setPrintPreviewOpen(true);
  };

  const finishCheckout = async (validItems: InvoiceItem[], copyType: PharmacyInvoiceCopyType, recovery?: CheckoutAttempt) => {
    setSavingInvoiceFromPreview(true);
    try {
      const finished = await createAndConfirmInvoice(validItems, copyType, recovery);
      if (!finished) return;
      if (!recovery) {
        try {
          await printHtmlInHiddenFrame(renderPrintHtml(finished.printable, validItems, {
            copyType,
            billingFallback: {
              billingName: invoiceData.billingName,
              billingPhone: invoiceData.billingPhone,
              billingAddress: invoiceData.billingAddress,
              notes: invoiceData.notes,
            },
          }));
        } catch (error) {
          console.error('Invoice print failed', error);
          toast({ title: 'Print failed', description: 'The bill is saved. Print it again from the bill.', variant: 'destructive' });
        }
      }
      setPrintPreviewOpen(false);
      onFinished({ id: finished.id, fromPrescription: Boolean(invoiceData.prescriptionId) });
    } finally {
      setSavingInvoiceFromPreview(false);
    }
  };

  const confirmAndPrint = (copyType: PharmacyInvoiceCopyType = 'ORIGINAL') => {
    const validItems = getValidInvoiceItems();
    if (validItems) void finishCheckout(validItems, copyType);
  };

  const getInvoiceCoreFromPrintData = (invoice: any) =>
    Array.isArray(invoice?.lines) ? invoice.invoice : invoice;

  const hasSavedInvoiceIdentity = (invoice: any) => {
    const invoiceCore = getInvoiceCoreFromPrintData(invoice);
    const invoiceNumber = String(invoiceCore?.invoiceNumber || '').trim();
    return Boolean(
      invoiceCore?.id &&
        invoiceNumber &&
        invoiceNumber.toUpperCase() !== 'DRAFT'
    );
  };

  const renderPrintHtml = (
    invoice: any,
    itemsData: InvoiceItem[],
    options?: {
      includePrintButton?: boolean;
      copyType?: 'ORIGINAL' | 'DUPLICATE';
      billingFallback?: PharmacyInvoicePrintPreview['billingFallback'];
    }
  ) => {
    const includePrintButton = options?.includePrintButton ?? false;
    const escapeHtml = (value: unknown) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const formatMoney = (value: unknown) =>
      Number(value || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    const isStandardPrintData = Array.isArray(invoice?.lines);
    const invoiceCore = getInvoiceCoreFromPrintData(invoice);
    const branch = isStandardPrintData ? invoice.branch : undefined;
    const patient = isStandardPrintData ? invoice.patient : undefined;
    const copyType = options?.copyType || invoice?.copyType || 'ORIGINAL';
    const fallback = options?.billingFallback;
    const dateStr = invoiceCore?.invoiceDate ? displayClinicDate(invoiceCore.invoiceDate) : displayClinicDate(invoiceCore?.createdAt);

    const itemsRows = isStandardPrintData
      ? invoice.lines
          .map((line: any) => {
            const batches = Array.isArray(line.batchAllocations)
              ? line.batchAllocations
                  .map((batch: any) => batch.batchNumber)
                  .filter(Boolean)
                  .join(', ')
              : '';
            return `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;">
            ${escapeHtml(line.name)}
            ${line.hsnCode ? `<div class="muted">HSN: ${escapeHtml(line.hsnCode)}</div>` : ''}
            ${batches ? `<div class="muted">Batch: ${escapeHtml(batches)}</div>` : ''}
          </td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center;">${line.quantity}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${formatMoney(line.unitPrice)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${formatMoney(line.discountPercent)}%</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${formatMoney(line.taxPercent)}%</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${formatMoney(line.totalAmount)}</td>
        </tr>
      `;
          })
          .join('')
      : itemsData
          .map((item) => {
            const itemName = billLineName(item);

            return `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;">
            ${escapeHtml(itemName)}
          </td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center;">${item.quantity}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${formatMoney(item.unitPrice)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${formatMoney(item.discountPercent || 0)}%</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${formatMoney(item.taxPercent || 0)}%</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${formatMoney(item.totalAmount)}</td>
        </tr>
      `;
          })
          .join('');

    const totals = {
      subtotal: invoiceCore?.subtotal || 0,
      lineDiscount: invoiceCore?.lineDiscountAmount ?? (invoiceCore?.discountAmount || 0) - (invoiceCore?.billDiscountAmount || 0),
      billDiscount: invoiceCore?.billDiscountAmount || 0,
      totalTax: invoiceCore?.taxAmount || 0,
      grandTotal: invoiceCore?.totalAmount || 0,
    };
    const billDiscountLabel =
      invoiceCore?.billDiscountKind === 'PERCENT' ? `Bill discount (${Number(invoiceCore.billDiscountValue)}%)` : 'Bill discount';
    const invoiceNumberText = hasSavedInvoiceIdentity(invoice) ? invoiceCore?.invoiceNumber : '';
    const gstRows =
      isStandardPrintData && Array.isArray(invoice.gstSummary)
        ? invoice.gstSummary
            .map(
              (slab: any) => `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${formatMoney(slab.taxPercent)}%</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${formatMoney(slab.taxableAmount)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${formatMoney(slab.cgst)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${formatMoney(slab.sgst)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${formatMoney(slab.igst)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${formatMoney(slab.totalTax)}</td>
        </tr>
      `
            )
            .join('')
        : '';

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Invoice ${escapeHtml(invoiceCore?.invoiceNumber || '')}</title>
          ${getGlobalPrintStyleTag()}
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }
            @media print {
              body { margin: 12mm; }
              .no-print { display: none; }
            }
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
              background: white;
            }
            h1 { 
              margin-bottom: 8px;
              color: #1a1a1a;
            }
            .invoice-header {
              border-bottom: 2px solid #333;
              padding-bottom: 12px;
              margin-bottom: 20px;
            }
            .muted { 
              color: #666;
              font-size: 14px;
            }
            .billing-section {
              margin: 20px 0;
              padding: 15px;
              background: #f9f9f9;
              border-radius: 4px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-top: 20px;
            }
            th { 
              background: #f5f5f5;
              font-weight: bold;
              padding: 10px 6px !important;
            }
            th, td {
              border: 1px solid #ddd;
            }
            .totals-section {
              margin-top: 20px;
              text-align: right;
              padding: 15px;
              background: #f9f9f9;
              border-radius: 4px;
            }
            .totals-section div {
              margin: 8px 0;
            }
            .grand-total {
              font-size: 20px;
              font-weight: bold;
              color: #1a1a1a;
              border-top: 2px solid #333;
              padding-top: 12px;
              margin-top: 12px;
            }
            .print-button {
              margin: 20px 0;
              padding: 12px 24px;
              background: #2563eb;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 16px;
            }
            .print-button:hover {
              background: #1d4ed8;
            }
          </style>
        </head>
        <body style="--print-header-height: 28mm;">
          <div class="print-fixed-header">
            <div class="invoice-header">
              <h1>Pharmacy Invoice</h1>
              <div class="muted">
                ${branch?.name ? `<strong>${escapeHtml(branch.name)}</strong><br/>` : ''}
                ${branch?.address ? `${escapeHtml(branch.address)}<br/>` : ''}
                ${branch?.phone ? `Phone: ${escapeHtml(branch.phone)}<br/>` : ''}
                ${branch?.gstNumber ? `GSTIN: ${escapeHtml(branch.gstNumber)}<br/>` : ''}
                ${branch?.drugLicenseNumber ? `DL No: ${escapeHtml(branch.drugLicenseNumber)}<br/>` : ''}
                ${invoiceNumberText ? `<strong>Invoice #:</strong> ${escapeHtml(invoiceNumberText)}<br/>` : ''}
                <strong>Copy:</strong> ${escapeHtml(copyType)}<br/>
                <strong>Date:</strong> ${escapeHtml(dateStr)}
                ${invoiceCore?.revisedAt ? `<br/><strong>Revised ${escapeHtml(displayClinicDate(invoiceCore.revisedAt))}</strong>` : ''}
              </div>
            </div>
          </div>
          <div class="print-content">
          
          <div class="billing-section">
            <strong>Bill To:</strong><br />
            <div style="margin-top: 8px;">
              ${escapeHtml(patient?.name || invoiceCore?.billingName || fallback?.billingName || invoiceData.billingName)}<br/>
              ${escapeHtml(patient?.phone || invoiceCore?.billingPhone || fallback?.billingPhone || invoiceData.billingPhone)}${patient?.address || invoiceCore?.billingAddress || fallback?.billingAddress || invoiceData.billingAddress ? '<br/>' + escapeHtml(patient?.address || invoiceCore?.billingAddress || fallback?.billingAddress || invoiceData.billingAddress) : ''}
            </div>
          </div>

          ${
            includePrintButton
              ? '<button class="print-button no-print" onclick="window.print()">Print Invoice</button>'
              : ''
          }

          <table>
            <thead>
              <tr>
                <th style="text-align:left;">Item</th>
                <th style="width: 80px;">Qty</th>
                <th style="text-align:right;width: 100px;">Unit Price</th>
                <th style="text-align:right;width: 80px;">Disc%</th>
                <th style="text-align:right;width: 80px;">Tax%</th>
                <th style="text-align:right;width: 120px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="totals-section">
            <div><strong>Subtotal:</strong> ₹${formatMoney(totals.subtotal)}</div>
            <div><strong>Item discount:</strong> -₹${formatMoney(totals.lineDiscount)}</div>
            ${totals.billDiscount > 0 ? `<div><strong>${escapeHtml(billDiscountLabel)}:</strong> -₹${formatMoney(totals.billDiscount)}</div>` : ''}
            <div><strong>Tax:</strong> ₹${formatMoney(totals.totalTax)}</div>
            <div class="grand-total"><strong>Grand Total:</strong> ₹${formatMoney(totals.grandTotal)}</div>
            ${invoiceCore?.amountInWords ? `<div class="muted">${escapeHtml(invoiceCore.amountInWords)}</div>` : ''}
          </div>

          ${
            gstRows
              ? `
          <table>
            <thead>
              <tr>
                <th style="text-align:right;">GST%</th>
                <th style="text-align:right;">Taxable</th>
                <th style="text-align:right;">CGST</th>
                <th style="text-align:right;">SGST</th>
                <th style="text-align:right;">IGST</th>
                <th style="text-align:right;">Total Tax</th>
              </tr>
            </thead>
            <tbody>${gstRows}</tbody>
          </table>
          `
              : ''
          }

          ${
            invoiceCore?.notes || fallback?.notes || invoiceData.notes
              ? `
            <div style="margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px;">
              <strong>Notes:</strong><br/>
              ${escapeHtml(invoiceCore?.notes || fallback?.notes || invoiceData.notes)}
            </div>
          `
              : ''
          }
          </div>
        </body>
      </html>
    `;
  };

  const printPreviewHtml = printPreviewData
    ? renderPrintHtml(printPreviewData.invoice, printPreviewData.items, {
        includePrintButton: false,
        copyType: printPreviewCopyType,
        billingFallback: printPreviewData.billingFallback,
      })
    : '';

  const printHtmlInHiddenFrame = async (html: string) => {
    if (!html.trim()) {
      throw new Error('No invoice preview is ready yet.');
    }

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.left = '-10000px';
    frame.style.top = '0';
    frame.style.width = '210mm';
    frame.style.height = '297mm';
    frame.style.border = '0';
    frame.style.opacity = '0';
    frame.style.pointerEvents = 'none';

    document.body.appendChild(frame);

    try {
      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        throw new Error('Print frame is unavailable.');
      }

      const ready = new Promise<void>((resolve) => {
        let resolved = false;
        const done = () => {
          if (resolved) return;
          resolved = true;
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        };
        frame.onload = done;
        window.setTimeout(done, 300);
      });

      frameDocument.open();
      frameDocument.write(html);
      frameDocument.close();
      await ready;

      const frameWindow = frame.contentWindow;
      if (!frameWindow) {
        throw new Error('Print frame window is unavailable.');
      }

      frameWindow.focus();
      frameWindow.print();
    } finally {
      window.setTimeout(() => frame.remove(), 1000);
    }
  };

  const { subtotal, lineDiscount, billDiscountAmount, totalDiscount, totalTax, grandTotal, discountProblem } =
    calculateInvoiceTotals();
  const draftChanged = savedSnapshot !== JSON.stringify(billPayload(invoiceData, items, billDiscount));
  const leaveFinishedBill = () => {
    sessionStorage.removeItem(checkoutStorageKey);
    checkoutAttemptRef.current = null;
    setCheckoutAttempt(null);
    onDone?.();
  };
  const hasUnresolvedGst = items.some(item => item.taxPercent === null);
  const fromPrescription = Boolean(invoiceData.prescriptionId || prefill?.visitId);
  const showDoctor = fromPrescription || Boolean(invoiceData.doctorId) || doctorOpen;
  const showPackages = fromPrescription || packagesOpen || items.some((item) => item.itemType === 'PACKAGE');
  const showBillDiscount = discountOpen || Boolean(billDiscount);
  const showDirections = (item: InvoiceItem) =>
    isPrescriptionItem(item.id) || directionsOpen.has(item.id) || Boolean(item.dosage || item.frequency || item.duration || item.instructions);
  const previewLineCount = Array.isArray(printPreviewData?.invoice?.lines)
    ? printPreviewData?.invoice.lines.length
    : printPreviewData?.items.length || 0;
  const previewTotal = Number(getInvoiceCoreFromPrintData(printPreviewData?.invoice)?.totalAmount || 0);
  const previewTotalLabel = previewTotal.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const prescriptionItems = items.filter(item => item.id.startsWith('prescription_'));
  const isPrescriptionItem = (itemId: string) => itemId.startsWith('prescription_');

  const chooseWalkIn = (next: boolean) => {
    setWalkIn(next);
    setSelectedPatient(null);
    setPatientSearchQuery('');
    setShowPatientSearchResults(false);
    setInvoiceData((prev) => ({ ...prev, patientId: '', billingName: '', billingPhone: '', billingAddress: '', billingCity: '', billingState: '', billingPincode: '' }));
  };

  /**
   * @cc [owner:nareshshah139,label:product] fresh-invoice-context
   * Starting a new invoice MUST clear patient, doctor, prescription, billing, print and item state.
   * The previous parent prefill, URL parameters and late loads MUST NOT restore the previous bill.
   */
  const startNewInvoice = () => {
    ++billingContextVersion.current;
    ++prescriptionRequestRef.current;
    setClearedPrefillKey(incomingPrefillKey);
    sessionStorage.removeItem(checkoutStorageKey);
    checkoutAttemptRef.current = null;
    setCheckoutAttempt(null);
    setSession({ kind: 'new' });
    setSavedSnapshot(null);
    setRefusal(null);
    setInvoiceData(EMPTY_FIELDS);
    invoiceItemsRef.current = [];
    setItems([]);
    setPrescriptionData(null);
    setSelectedPatient(null);
    setSelectedDoctor(null);
    setPatientSearchQuery('');
    setDrugSearchQuery('');
    setSearchResults([]);
    setShowPatientSearchResults(false);
    setShowDrugSearchResults(false);
    setSelectedTab('drugs');
    setDoctorOpen(false);
    setWalkIn(false);
    setPackagesOpen(false);
    setDiscountOpen(false);
    setDirectionsOpen(new Set());
    setSubstitutingItemId(null);
    setLoadingPrescription(false);
    setPrefillError(null);
    setPrintPreviewOpen(false);
    setPrintPreviewData(null);
    setPrintPreviewCopyType('ORIGINAL');
    setPrintPreviewZoom(0.9);
    fetchedPrefillPatientsRef.current.clear();
    lastPrefilledPrescriptionIdRef.current = null;
    lastPrefilledVisitIdRef.current = null;
    removedPrescriptionIdsRef.current.clear();
    const url = new URL(window.location.href);
    for (const key of ['patientId', 'doctorId', 'prescriptionId', 'visitId', 'draft'])
      url.searchParams.delete(key);
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
  };

  const renderPrescriptionHeader = () => {
    if (!prescriptionData) return null;

    return (
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-blue-800">Linked Prescription</h3>
        </div>
        <div className="text-sm text-blue-700">
          {prescriptionItems.filter(item => !item.drugId).map(item => <div key={item.id} className="mt-2">
            {item.prescribedDrugName}: link inventory before billing. <PrescriptionInventoryLink prescriptionId={prescriptionData.id} lineIndex={item.prescriptionLineIndex!} prescriptionVersion={item.prescriptionVersion} name={item.prescribedDrugName || ''} onLinked={() => loadPrescriptionData(prescriptionData.id)} />
          </div>)}
          <p className="mt-2 text-xs text-blue-600">
            Edits here do not change the doctor&apos;s prescription.
          </p>
        </div>
      </div>
    );
  };

  return (
    <>
    <Card>
      {refusal && (
        <div ref={refusalRef} tabIndex={-1} role="alert" className="m-4 flex scroll-mt-4 flex-wrap items-center gap-3 rounded-md border border-destructive-border bg-destructive-soft p-3 text-sm text-destructive-text outline-none">
          <p className="min-w-0 flex-1">{refusal.message} Your changes on this screen were not saved.</p>
          {onReloadDraft && <Button variant="outline" onClick={onReloadDraft}>Reload draft</Button>}
        </div>
      )}
      {checkoutAttempt && (
        <div role="status" className="m-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
          <p>{checkoutAttempt.confirmed ? 'This bill is confirmed and paid.' : `A checkout for ${checkoutAttempt.payload.billingName} needs confirmation. Retry it before starting another sale.`}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="outline" disabled={loading} onClick={() => void finishCheckout(checkoutAttempt.previewItems, 'ORIGINAL', checkoutAttempt)}>
              {checkoutAttempt.confirmed ? 'Open the bill' : 'Retry pending checkout'}
            </Button>
            {checkoutAttempt.confirmed && <Button variant="ghost" disabled={loading} onClick={startNewInvoice}>New sale</Button>}
            {checkoutAttempt.confirmed && onDone && <Button variant="ghost" disabled={loading} onClick={leaveFinishedBill}>Back to Sales</Button>}
          </div>
        </div>
      )}
      {loadingPrescription && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2">
            <Spinner className="  h-4 w-4  " />
            <span className="text-yellow-800">
              Loading prescription data...
            </span>
          </div>
        </div>
      )}

      {renderPrescriptionHeader()}

      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Pill className="h-5 w-5" />
          {session.kind === 'draft' ? (
            <>
              <Badge variant="warning">Draft</Badge>
              {session.number && <span>{session.number} not final</span>}
            </>
          ) : (
            'New bill'
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {prefillError && (
            <div className="lg:col-span-3">
              <div role="alert" className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900">
                {prefillError}
                {invoiceData.prescriptionId && (
                  <Button className="ml-3" variant="outline" size="sm" disabled={loadingPrescription}
                    onClick={() => { void loadPrescriptionData(invoiceData.prescriptionId); }}>
                    Retry loading prescription
                  </Button>
                )}
              </div>
            </div>
          )}
          {/* Left Column - Invoice Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Patient & Doctor Selection */}
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {walkIn ? 'Walk-in customer' : 'Patient'}
                </CardTitle>
                {!fromPrescription && (
                  <Button type="button" variant="outline" size="sm" aria-pressed={walkIn} onClick={() => chooseWalkIn(!walkIn)}>
                    {walkIn ? 'Choose a patient' : 'Walk-in customer'}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {walkIn ? (
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="billingName">Customer name *</Label>
                        <Input id="billingName" value={invoiceData.billingName} autoFocus
                          onChange={(e) => setInvoiceData((prev) => ({ ...prev, billingName: e.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="billingPhone">Phone *</Label>
                        <Input id="billingPhone" type="tel" inputMode="tel" value={invoiceData.billingPhone}
                          onChange={(e) => setInvoiceData((prev) => ({ ...prev, billingPhone: e.target.value }))} />
                      </div>
                    </div>
                  ) : (
                  <div>
                    <Label htmlFor="patient">Patient *</Label>
                    <div className="relative" ref={patientSearchRef}>
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="patient"
                        placeholder="Name or phone"
                        className="pl-8"
                        value={patientSearchQuery}
                        onChange={(e) => {
                          setPatientSearchQuery(e.target.value);
                          setShowPatientSearchResults(true);
                        }}
                        onClick={() => setShowPatientSearchResults(true)}
                        onFocus={() => setShowPatientSearchResults(true)}
                      />
                      {showPatientSearchResults && (
                        <div className="absolute z-20 mt-1 w-full bg-white border rounded-md max-h-64 overflow-auto shadow-sm transition-all duration-200 ease-in-out animate-in fade-in-0 slide-in-from-top-1">
                          {patients
                            .filter((p) => {
                              const q = patientSearchQuery.trim().toLowerCase();
                              if (!q) return true;
                              return (
                                p.name.toLowerCase().includes(q) ||
                                (p.phone || '').includes(q)
                              );
                            })
                            .slice(0, 20)
                            .map((p) => (
                              <div
                                key={p.id}
                                className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                                onMouseDown={() => {
                                  setSelectedPatient(p);
                                  setInvoiceData((prev) => ({
                                    ...prev,
                                    patientId: p.id,
                                    billingName: p.name,
                                    billingPhone: p.phone || '',
                                  }));
                                  setPatientSearchQuery(
                                    `${p.name}${p.phone ? ` (${p.phone})` : ''}`
                                  );
                                  setShowPatientSearchResults(false);
                                }}
                              >
                                <div className="font-medium">{p.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {p.phone || ''}
                                </div>
                              </div>
                            ))}
                          {patients.length === 0 && (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              No patients found
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  )}
                  {showDoctor ? (
                  <div>
                    <Label htmlFor="doctor">Doctor</Label>
                    <Select
                      value={invoiceData.doctorId}
                      onValueChange={(value: string) =>
                        setInvoiceData((prev) => ({ ...prev, doctorId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select doctor" />
                      </SelectTrigger>
                      <SelectContent>
                        {doctors.map((doctor) => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            Dr. {doctor.firstName} {doctor.lastName}
                            {doctor.department && ` (${doctor.department})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  ) : (
                    <div className="flex items-end">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDoctorOpen(true)}>
                        <Plus className="h-4 w-4" /> Doctor
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Add Items */}
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>Add medicine</CardTitle>
                {!showPackages && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setPackagesOpen(true); setSelectedTab('packages'); }}>
                    <PackageIcon className="h-4 w-4" /> Treatment packages
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <Tabs
                  value={selectedTab}
                  onValueChange={(value: 'drugs' | 'packages') =>
                    setSelectedTab(value)
                  }
                >
                  {showPackages && (
                  <>
                  <div className="flex justify-end mb-2">
                    <TabsFontSizeControls />
                  </div>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger
                      value="drugs"
                      className="flex items-center gap-2"
                    >
                      <Pill className="h-4 w-4" />
                      Medicines
                    </TabsTrigger>
                    <TabsTrigger
                      value="packages"
                      className="flex items-center gap-2"
                    >
                      <PackageIcon className="h-4 w-4" />
                      Treatment Packages
                    </TabsTrigger>
                  </TabsList>
                  </>
                  )}

                  <TabsContent value="drugs" className="space-y-4">
                    <div ref={drugSearchRef} className="space-y-2">
                      {substitutingItemId && (
                        <div role="status" className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                          <span>Choose a replacement for {billLineName(items.find(item => item.id === substitutingItemId) ?? {})}. The prescribed quantity will be kept.</span>
                          <Button variant="ghost" size="sm" onClick={() => setSubstitutingItemId(null)}>Cancel substitution</Button>
                        </div>
                      )}
                      <Label htmlFor="drugSearch">Medicine</Label>
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="drugSearch"
                          ref={searchInputRef}
                          placeholder="Medicine name"
                          value={drugSearchQuery}
                          onChange={(e) => setDrugSearchQuery(e.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            void addTopMatch();
                          }}
                          className="pl-8"
                        />
                      </div>

                      {showDrugSearchResults && searchResults.length > 0 && (
                        <div className="border rounded-md max-h-60 overflow-y-auto transition-all duration-200 ease-in-out animate-in fade-in-0 slide-in-from-top-1">
                          {searchResults.map((drug, index) => (
                            <div
                              key={drug.id}
                              role="button"
                              tabIndex={0}
                              className={`p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 ${
                                index === 0
                                  ? 'bg-green-50 border-l-4 border-l-green-500'
                                  : index < 3
                                    ? 'bg-blue-50 border-l-4 border-l-blue-500'
                                    : ''
                              }`}
                              onClick={() => addDrugToInvoice(drug)}
                              onKeyDown={(event) => {
                                if (
                                  event.key === 'Enter' ||
                                  event.key === ' '
                                ) {
                                  event.preventDefault();
                                  addDrugToInvoice(drug);
                                }
                              }}
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-y-1">
                                    <h4 className="font-medium">
                                      {highlightMatch(
                                        drug.stockName || drug.name,
                                        drugSearchQuery
                                      )}
                                    </h4>
                                    {getRelevanceBadge(
                                      drug,
                                      drugSearchQuery,
                                      index
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-600">
                                    {highlightMatch(
                                      drug.manufacturerName || '',
                                      drugSearchQuery
                                    )}{' '}
                                    • {drug.packSizeLabel}
                                  </p>
                                  {drug.composition1 && (
                                    <p className="text-xs text-gray-500">
                                      {highlightMatch(
                                        drug.composition1,
                                        drugSearchQuery
                                      )}
                                    </p>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-start justify-between gap-3 text-right sm:justify-end">
                                  <div>
                                    <div className="font-semibold">
                                      ₹{getDrugUnitPrice(drug).toFixed(2)}
                                    </div>
                                    {drug.category && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        {highlightMatch(
                                          drug.category,
                                          drugSearchQuery
                                        )}
                                      </Badge>
                                    )}
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      addDrugToInvoice(drug);
                                    }}
                                  >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Add
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {showDrugSearchResults &&
                        drugSearchQuery.trim() &&
                        searchResults.length === 0 && (
                          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                            No matching medicine.
                          </div>
                        )}
                      </div>
                  </TabsContent>

                  <TabsContent value="packages" className="space-y-4">
                    <div className="space-y-3">
                      {packages.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <PackageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No packages available</p>
                        </div>
                      ) : (
                        packages.map((pkg) => (
                          <div
                            key={pkg.id}
                            className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                            onClick={() => addPackageToInvoice(pkg)}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <h4 className="font-medium">{pkg.name}</h4>
                                <p className="text-sm text-gray-600">
                                  {pkg.description}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {pkg.subcategory}
                                  </Badge>
                                  <span className="text-xs text-gray-500">
                                    {pkg.items.length} items
                                  </span>
                                  {pkg.duration && (
                                    <span className="text-xs text-gray-500">
                                      • {pkg.duration}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-gray-500 line-through">
                                  ₹{pkg.originalPrice.toFixed(2)}
                                </div>
                                <div className="font-semibold">
                                  ₹{pkg.packagePrice.toFixed(2)}
                                </div>
                                <Badge
                                  variant="destructive"
                                  className="text-xs"
                                >
                                  {pkg.discountPercent.toFixed(0)}% OFF
                                </Badge>
                              </div>
                            </div>

                            {pkg.indications && (
                              <p className="text-xs text-gray-500 mt-2">
                                <strong>For:</strong> {pkg.indications}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Invoice Items */}
            {items.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>On this bill</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {items.map((item) => (
                      <Card key={item.id} data-invoice-item={item.id} className="p-4">
                        <div className="mb-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              {isPrescriptionItem(item.id) && (
                                <span
                                  className="text-blue-600 text-lg"
                                  title="From Prescription"
                                >
                                  📋
                                </span>
                              )}
                              {item.itemType === 'DRUG' ? (
                                <Pill className="h-4 w-4 text-blue-500" />
                              ) : (
                                <PackageIcon className="h-4 w-4 text-green-500" />
                              )}
                              <h4 className="font-medium">{billLineName(item)}</h4>
                              {item.stockStatus === 'CHECK_FAILED' ? (
                                <Badge variant="destructive">Inventory check failed</Badge>
                              ) : item.itemType === 'DRUG' && !item.drugId ? (
                                <Badge variant="destructive">No match</Badge>
                              ) : item.stockStatus === 'OUT_OF_STOCK' ? (
                                <Badge variant="destructive">Out of stock</Badge>
                              ) : item.availableStock !== undefined && item.quantity > item.availableStock ? (
                                <Badge variant="destructive">Insufficient stock: {item.availableStock} available</Badge>
                              ) : item.stockStatus === 'LOW_STOCK' ? (
                                <Badge variant="outline">Low stock: {item.availableStock} available</Badge>
                              ) : null}
                              <Badge
                                variant={
                                  item.itemType === 'DRUG'
                                    ? 'outline'
                                    : 'default'
                                }
                              >
                                {item.itemType === 'DRUG' ? 'Medicine' : 'Package'}
                              </Badge>
                              {isPrescriptionItem(item.id) && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                                >
                                  Prescription
                                </Badge>
                              )}
                            </div>
                            {item.itemType === 'DRUG' && item.drug && (
                              <p className="text-sm text-gray-600">
                                {item.drug.manufacturerName} •{' '}
                                {item.drug.packSizeLabel}
                              </p>
                            )}
                            {item.quantityReview && (
                              <div
                                role="status"
                                className="mt-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"
                              >
                                <span className="flex-1">{item.quantityReview}</span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-6 border-amber-300 px-2 text-xs"
                                  onClick={() => clearQuantityReview(item.id)}
                                >
                                  Confirm
                                </Button>
                              </div>
                            )}
                            {walkInPrescriptionProblem(item) && (
                              <p role="alert" className="mt-2 text-sm text-destructive-text">{walkInPrescriptionProblem(item)}</p>
                            )}
                            {prescribedNameShown(item) && (
                              <p className="text-sm text-blue-700">Prescribed: {prescribedNameShown(item)}</p>
                            )}
                            {item.itemType === 'PACKAGE' && item.package && (
                              <p className="text-sm text-gray-600">
                                {item.package.description} •{' '}
                                {item.package.items.length} items
                              </p>
                            )}

                            {/* Prescription-specific information */}
                            {isPrescriptionItem(item.id) && (
                              <div className="mt-2 p-2 bg-blue-50 rounded-md text-xs text-blue-700">
                                {item.dosage && (
                                  <div>
                                    <strong>Dosage:</strong> {item.dosage}
                                  </div>
                                )}
                                {item.frequency && (
                                  <div>
                                    <strong>Frequency:</strong> {item.frequency}
                                  </div>
                                )}
                                {item.duration && (
                                  <div>
                                    <strong>Duration:</strong> {item.duration}
                                  </div>
                                )}
                                {item.instructions && (
                                  <div>
                                    <strong>Instructions:</strong>{' '}
                                    {item.instructions}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-wrap justify-end gap-1 self-end sm:self-auto">
                            {item.itemType === 'DRUG' && (
                              <Button variant="outline" size="sm" aria-label={`Substitute ${billLineName(item)}`}
                                onClick={() => {
                                  setSubstitutingItemId(item.id);
                                  setSelectedTab('drugs');
                                  setDrugSearchQuery('');
                                  requestAnimationFrame(() => {
                                    searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    searchInputRef.current?.focus({ preventScroll: true });
                                  });
                                }}>
                                Substitute
                              </Button>
                            )}
                            {item.itemType === 'DRUG' && !showDirections(item) && (
                              <Button variant="ghost" size="sm" onClick={() => setDirectionsOpen((open) => new Set(open).add(item.id))}>
                                Directions
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Remove ${billLineName(item)}`}
                              onClick={() => removeItem(item.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          <div>
                            <Label htmlFor={`quantity-${item.id}`} className="text-xs">Quantity</Label>
                            <Input
                              id={`quantity-${item.id}`}
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItemQuantity(
                                  item.id,
                                  parseInt(e.target.value) || 1,
                                  item.itemType
                                )
                              }
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Unit Price</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) =>
                                updateItemUnitPrice(
                                  item.id,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Discount %</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={item.discountPercent}
                              onChange={(e) =>
                                updateItemDiscount(
                                  item.id,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`gst-${item.id}`} className="text-xs">Tax %</Label>
                            <Input
                              id={`gst-${item.id}`}
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={item.taxPercent ?? ''}
                              placeholder="Enter GST"
                              aria-invalid={item.taxPercent === null}
                              aria-describedby={item.taxPercent === null ? `gst-review-${item.id}` : undefined}
                              onChange={(e) =>
                                updateItemTax(
                                  item.id,
                                  e.target.value === '' ? null : Number(e.target.value)
                                )
                              }
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Total</Label>
                            <Input
                              value={item.taxPercent === null ? 'GST pending' : `₹${item.totalAmount.toFixed(2)}`}
                              readOnly
                              className="h-8 bg-gray-50 font-medium"
                            />
                          </div>
                        </div>

                        {item.taxPercent === null && (
                          <p id={`gst-review-${item.id}`} className="mt-2 text-sm text-destructive">
                            GST rate needs review. Enter Tax % before previewing or confirming this invoice.
                          </p>
                        )}

                        {item.itemType === 'PACKAGE' && item.package && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-md">
                            <h5 className="text-sm font-medium mb-2">
                              Package Contents:
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                              {item.package.items
                                .sort((a, b) => a.sequence - b.sequence)
                                .map((packageItem) => (
                                  <div
                                    key={packageItem.id}
                                    className="flex justify-between"
                                  >
                                    <span>{packageItem.drug.name}</span>
                                    <span>×{packageItem.quantity}</span>
                                  </div>
                                ))}
                            </div>
                            {item.package.instructions && (
                              <p className="text-xs text-gray-600 mt-2">
                                <strong>Instructions:</strong>{' '}
                                {item.package.instructions}
                              </p>
                            )}
                          </div>
                        )}

                        {item.itemType === 'DRUG' && showDirections(item) && (
                          <div className="mt-3 rounded-md border bg-slate-50 p-3">
                            <div className="mb-2 flex items-center gap-2">
                              <FileText className="h-4 w-4 text-slate-600" />
                              <h5 className="text-sm font-medium">
                                Prescription directions
                              </h5>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                              <div>
                                <Label className="text-xs">Dosage</Label>
                                <Input
                                  value={item.dosage || ''}
                                  onChange={(event) =>
                                    updateItemPrescriptionField(
                                      item.id,
                                      'dosage',
                                      event.target.value
                                    )
                                  }
                                  className="h-8"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Frequency</Label>
                                <Input
                                  value={item.frequency || ''}
                                  onChange={(event) =>
                                    updateItemPrescriptionField(
                                      item.id,
                                      'frequency',
                                      event.target.value
                                    )
                                  }
                                  className="h-8"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Duration</Label>
                                <Input
                                  value={item.duration || ''}
                                  onChange={(event) =>
                                    updateItemPrescriptionField(
                                      item.id,
                                      'duration',
                                      event.target.value
                                    )
                                  }
                                  className="h-8"
                                />
                              </div>
                            </div>
                            <div className="mt-3">
                              <Label className="text-xs">Instructions</Label>
                              <Textarea
                                value={item.instructions || ''}
                                onChange={(event) =>
                                  updateItemPrescriptionField(
                                    item.id,
                                    'instructions',
                                    event.target.value
                                  )
                                }
                                className="min-h-16"
                              />
                            </div>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Summary & Billing */}
          <div className="space-y-6">
            {/* Billing Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Billing details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!walkIn && (
                <>
                <div>
                  <Label htmlFor="billingName">Billing Name *</Label>
                  <Input
                    id="billingName"
                    value={invoiceData.billingName}
                    onChange={(e) =>
                      setInvoiceData((prev) => ({
                        ...prev,
                        billingName: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="billingPhone">Phone *</Label>
                  <Input
                    id="billingPhone"
                    value={invoiceData.billingPhone}
                    onChange={(e) =>
                      setInvoiceData((prev) => ({
                        ...prev,
                        billingPhone: e.target.value,
                      }))
                    }
                  />
                </div>
                </>
                )}
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={invoiceData.notes}
                    onChange={(e) =>
                      setInvoiceData((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Bill summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Bill summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                  </div>
                  {lineDiscount > 0 && (
                    <div className="flex justify-between text-success-text">
                      <span>Item discounts:</span>
                      <span>-₹{lineDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  {showBillDiscount ? (
                    <BillDiscountInput value={billDiscount} onChange={setBillDiscount} problem={discountProblem} disabled={loading} />
                  ) : (
                    <Button type="button" variant="ghost" size="sm" className="-ml-3" aria-expanded={false} onClick={() => setDiscountOpen(true)}>
                      <Plus className="h-4 w-4" /> Bill discount
                    </Button>
                  )}
                  {billDiscountAmount > 0 && (
                    <div className="flex justify-between text-success-text">
                      <span>Bill discount{billDiscount?.kind === 'PERCENT' ? ` (${billDiscount.value}%)` : ''}:</span>
                      <span>-₹{billDiscountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span>{hasUnresolvedGst ? 'GST pending' : `₹${totalTax.toFixed(2)}`}</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total:</span>
                      <span>{hasUnresolvedGst ? 'GST pending' : `₹${grandTotal.toFixed(2)}`}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <div role="group" aria-labelledby="paymentMethodLabel" className="space-y-1.5">
                <p id="paymentMethodLabel" className="text-sm font-medium">Payment method</p>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      variant="outline"
                      className={invoiceData.paymentMethod === value ? 'border-primary bg-primary/10 font-semibold ring-2 ring-primary' : undefined}
                      aria-pressed={invoiceData.paymentMethod === value}
                      disabled={loading}
                      onClick={() => setInvoiceData((prev) => ({ ...prev, paymentMethod: value }))}
                    >
                      {invoiceData.paymentMethod === value && <Check aria-hidden="true" className="mr-1.5 h-4 w-4" />}
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <Button
                onClick={() => confirmAndPrint()}
                disabled={loading || savingInvoiceFromPreview || (!invoiceData.patientId && !walkIn) || items.length === 0}
                className="w-full"
                size="lg"
              >
                {loading || savingInvoiceFromPreview ? <Spinner className="mr-2 h-4 w-4" /> : <Printer className="mr-2 h-4 w-4" />}
                {loading || savingInvoiceFromPreview ? 'Confirming…' : 'Confirm and print'}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={handleOpenPrintPreview}
                  disabled={loading || (!invoiceData.patientId && !walkIn) || items.length === 0}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Preview
                </Button>
                {!checkoutAttempt && (
                  <Button
                    variant="outline"
                    onClick={() => void saveDraft()}
                    disabled={savingDraft || loading || discarding}
                  >
                    {savingDraft ? <Spinner className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                    {savingDraft ? 'Saving draft…' : 'Save draft'}
                  </Button>
                )}
              </div>
              {!checkoutAttempt && (
                <>
                  <p role="status" className="text-center text-xs text-muted-foreground">
                    {session.kind === 'new'
                      ? 'No stock or payment change.'
                      : draftChanged
                        ? 'Unsaved changes'
                        : 'All changes saved to the draft'}
                  </p>
                  {session.kind === 'draft' && (
                    <Button
                      variant="ghost"
                      className="w-full text-destructive-text hover:text-destructive-text"
                      onClick={() => setDiscardOpen(true)}
                      disabled={savingDraft || loading || discarding}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Discard draft
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <Dialog open={discardOpen} onOpenChange={(open: boolean) => !discarding && setDiscardOpen(open)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Discard this draft?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {session.kind === 'draft' ? draftName(session) : 'This draft'} for {invoiceData.billingName || 'this patient'} will be removed from Sales.
          Nothing was sold, so stock and payments are unchanged. This cannot be undone.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setDiscardOpen(false)} disabled={discarding}>Keep draft</Button>
          <Button variant="destructive" onClick={() => void discardDraft()} disabled={discarding}>
            {discarding ? 'Discarding…' : 'Discard draft'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={printPreviewOpen} onOpenChange={setPrintPreviewOpen}>
      <DialogContent className="max-w-[100vw] sm:max-w-[100vw] md:max-w-[100vw] lg:max-w-[100vw] 2xl:max-w-[100vw] w-[100vw] h-[100dvh] max-h-none p-0 overflow-hidden rounded-none border-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Bill preview</DialogTitle>
        </DialogHeader>
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-slate-100 md:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white/95 px-4 py-3 pr-12 text-sm backdrop-blur">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">Bill preview</div>
                <div className="truncate text-xs text-slate-600">{printPreviewData?.billingFallback.billingName}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{previewLineCount} items</Badge>
                <Badge variant="secondary">₹{previewTotalLabel}</Badge>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-6">
              <div
                className="mx-auto origin-top transition-transform"
                style={{
                  width: '840px',
                  transform: `scale(${printPreviewZoom})`,
                  transformOrigin: 'top center',
                }}
              >
                <iframe
                  title="Bill print preview"
                  srcDoc={printPreviewHtml}
                  className="h-[1120px] w-full rounded-md border bg-white shadow-sm"
                />
              </div>
            </div>
          </div>

          <aside className="shrink-0 space-y-4 overflow-auto border-t bg-white p-4 md:h-full md:w-80 md:border-l md:border-t-0">
            <Button
              type="button"
              className="w-full"
              size="lg"
              onClick={() => confirmAndPrint(printPreviewCopyType)}
              disabled={!printPreviewData || loading || savingInvoiceFromPreview}
            >
              {savingInvoiceFromPreview || loading ? <Spinner className="mr-2 h-4 w-4" /> : <Printer className="mr-2 h-4 w-4" />}
              {savingInvoiceFromPreview || loading ? 'Confirming…' : 'Confirm and print'}
            </Button>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
              <div className="space-y-2">
                <Label className="text-xs">Copy</Label>
                <Select
                  value={printPreviewCopyType}
                  onValueChange={(value: 'ORIGINAL' | 'DUPLICATE') => setPrintPreviewCopyType(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ORIGINAL">Original</SelectItem>
                    <SelectItem value="DUPLICATE">Duplicate</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Zoom</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" aria-label="Zoom out"
                    onClick={() => setPrintPreviewZoom((value) => Math.max(0.55, value - 0.1))}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 rounded-md border px-2 py-1.5 text-center text-sm">
                    {Math.round(printPreviewZoom * 100)}%
                  </div>
                  <Button type="button" variant="outline" size="sm" aria-label="Zoom in"
                    onClick={() => setPrintPreviewZoom((value) => Math.min(1.25, value + 0.1))}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={() => setPrintPreviewOpen(false)}>
              Back to the bill
            </Button>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
