import {
  queueDurationDays,
  queueFrequencyPerDay,
  queueInstructionSchedules,
} from './pharmacy-prescription-queue-query';

export type BillingQuantityReview =
  | 'pack_item'
  | 'schedule_conflict'
  | 'schedule_unknown'
  | 'pack_size_unknown';

export type BillingQuantity = {
  quantity: number;
  unit: string | null;
  review: { reason: BillingQuantityReview; message: string } | null;
};

export type BillingInventory = {
  unit: string;
  packSize: number | null;
  packUnit: string | null;
};

export type BillingPrescriptionItem = {
  genericName?: string | null;
  dosageUnit?: string | null;
  frequency?: string | null;
  duration?: string | number | null;
  durationUnit?: string | null;
  instructions?: string | null;
  quantity?: string | number | null;
  prescribedQuantity?: string | number | null;
  totalQuantity?: string | number | null;
  qty?: string | number | null;
};

export type PrescribedSchedule = { doses: number | null; conflict: boolean };

const MEASURED_SELLING_UNITS = new Set(['BOTTLES', 'TUBES']);
const PACK_SELLING_UNITS = new Set(['STRIPS', 'BOXES', 'PACKS']);
const MEASURED_PACK_UNITS = new Set([
  'ml', 'l', 'ltr', 'litre', 'g', 'gm', 'gms', 'gram', 'grams', 'kg',
]);
const MEASURED_DOSAGE_UNITS = new Set([
  'ml', 'g', 'gm', 'drop', 'drops', 'application', 'applications',
  'pump', 'pumps', 'spray', 'sprays', 'ftu',
]);
const MEASURED_NAME_WORDS = new Set([
  'serum', 'lotion', 'cream', 'gel', 'shampoo', 'ointment', 'solution',
  'spray', 'foam', 'wash', 'syrup', 'suspension', 'drops', 'oil', 'soap',
  'sunscreen', 'conditioner', 'liniment', 'powder',
]);
const UNIT_SINGULAR: Record<string, string> = {
  PIECES: 'piece', BOXES: 'box', BOTTLES: 'bottle', STRIPS: 'strip', TUBES: 'tube',
  VIALS: 'vial', AMPOULES: 'ampoule', SYRINGES: 'syringe', PACKS: 'pack', KITS: 'kit',
};

const compiledSchedules = queueInstructionSchedules.map(({ pattern, perDay }) => ({
  regex: new RegExp(pattern),
  perDay,
}));

export const normalizeToken = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const positiveNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const explicitQuantity = (item: BillingPrescriptionItem) =>
  positiveNumber(item.quantity ?? item.prescribedQuantity ?? item.totalQuantity ?? item.qty);

const sameRate = (a: number | null, b: number | null) =>
  a !== null && b !== null && Math.abs(a - b) < 1e-9;

export function prescribedSchedule(item: BillingPrescriptionItem): PrescribedSchedule {
  const explicit = explicitQuantity(item);
  if (explicit !== null) return { doses: explicit, conflict: false };

  const structured = queueFrequencyPerDay[normalizeToken(item.frequency || '')] ?? null;
  const instructions = normalizeToken(item.instructions || '');
  const fromInstructions =
    compiledSchedules.find(({ regex }) => regex.test(instructions))?.perDay ?? null;
  const perDay = fromInstructions ?? structured;
  const conflict = fromInstructions !== null && !sameRate(fromInstructions, structured);

  const duration = positiveNumber(item.duration);
  const multiplier = queueDurationDays[normalizeToken(item.durationUnit || '') || 'days'] ?? null;
  if (perDay === null || duration === null || multiplier === null) {
    return { doses: null, conflict };
  }
  return { doses: Math.ceil(Number((perDay * duration * multiplier).toFixed(9))), conflict };
}

function isMeasured(
  item: BillingPrescriptionItem,
  inventory: BillingInventory | null,
  drugName: string,
): boolean {
  const nameWords = [drugName, item.genericName || ''].flatMap((name) =>
    normalizeToken(name).split('_'),
  );
  return (
    (inventory !== null && MEASURED_SELLING_UNITS.has(inventory.unit)) ||
    MEASURED_PACK_UNITS.has(normalizeToken(inventory?.packUnit || '')) ||
    MEASURED_DOSAGE_UNITS.has(normalizeToken(item.dosageUnit || '')) ||
    nameWords.some((word) => MEASURED_NAME_WORDS.has(word))
  );
}

const unitSingular = (unit: string | null) => (unit && UNIT_SINGULAR[unit]) || 'pack';
const unitPlural = (unit: string | null) => (unit ? unit.toLowerCase() : 'packs');

export function billingQuantity(
  item: BillingPrescriptionItem,
  inventory: BillingInventory | null,
  drugName: string,
): BillingQuantity {
  const unit = inventory?.unit ?? null;
  const explicit = explicitQuantity(item);
  if (explicit !== null) return { quantity: explicit, unit, review: null };

  if (isMeasured(item, inventory, drugName)) {
    return {
      quantity: 1,
      unit,
      review: {
        reason: 'pack_item',
        message: `Sold per ${unitSingular(unit)}. Filled 1; confirm how many the course needs.`,
      },
    };
  }

  const schedule = prescribedSchedule(item);
  if (schedule.doses === null) {
    return {
      quantity: 1,
      unit,
      review: {
        reason: 'schedule_unknown',
        message: 'No frequency or duration to count from. Confirm the quantity.',
      },
    };
  }

  let quantity = schedule.doses;
  if (inventory && PACK_SELLING_UNITS.has(inventory.unit)) {
    if (inventory.packSize && inventory.packSize > 0) {
      quantity = Math.ceil(schedule.doses / inventory.packSize);
    } else {
      return {
        quantity: 1,
        unit,
        review: {
          reason: 'pack_size_unknown',
          message: `Pack size missing for this product. Confirm how many ${unitPlural(unit)} to bill.`,
        },
      };
    }
  }

  return {
    quantity,
    unit,
    review: schedule.conflict
      ? {
          reason: 'schedule_conflict',
          message: `Instructions "${item.instructions}" disagree with frequency ${item.frequency || 'not set'}. Quantity follows the instructions; confirm.`,
        }
      : null,
  };
}
