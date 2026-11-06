export const queueFrequencyPerDay: Record<string, number> = {
  once_daily: 1,
  od: 1,
  daily: 1,
  twice_daily: 2,
  bid: 2,
  bd: 2,
  three_times_daily: 3,
  tid: 3,
  tds: 3,
  four_times_daily: 4,
  qid: 4,
  qds: 4,
  every_12_hours: 2,
  every_8_hours: 3,
  every_6_hours: 4,
  every_4_hours: 6,
  weekly: 1 / 7,
  monthly: 1 / 30,
};

export const queueDurationDays: Record<string, number> = {
  day: 1,
  days: 1,
  week: 7,
  weeks: 7,
  month: 30,
  months: 30,
  year: 365,
  years: 365,
};

const weekdays = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';

export const queueInstructionSchedules: Array<{ pattern: string; perDay: number }> = [
  { pattern: '(^|_)(twice_(a|per|every)_week|twice_weekly|(two|2)_times_(a|per)_week)(_|$)', perDay: 2 / 7 },
  { pattern: '(^|_)(thrice_(a|per|every)_week|thrice_weekly|(three|3)_times_(a|per)_week)(_|$)', perDay: 3 / 7 },
  { pattern: '(^|_)(alternate_days?|alternative_days?|every_other_day|every_alternate_day|every_second_day)(_|$)', perDay: 1 / 2 },
  { pattern: '(^|_)(once_(a|per|every)_month|monthly|every_month)(_|$)', perDay: 1 / 30 },
  { pattern: `(^|_)(once_(a|per|every)_week|weekly|every_week|every_(${weekdays}))(_|$)`, perDay: 1 / 7 },
];

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

export type LineNeed = { amount: number; unit: 'doses' | 'selling_units' };

export const measuredSellingUnits = ['BOTTLES', 'TUBES'];
export const packSellingUnits = ['STRIPS', 'BOXES', 'PACKS'];
export const measuredPackUnits = ['ml', 'l', 'ltr', 'litre', 'g', 'gm', 'gms', 'gram', 'grams', 'kg'];
export const measuredDosageUnits = [
  'ml', 'g', 'gm', 'drop', 'drops', 'application', 'applications',
  'pump', 'pumps', 'spray', 'sprays', 'ftu',
];
export const measuredNameWords = [
  'serum', 'lotion', 'cream', 'gel', 'shampoo', 'ointment', 'solution',
  'spray', 'foam', 'wash', 'syrup', 'suspension', 'drops', 'oil', 'soap',
  'sunscreen', 'conditioner', 'liniment', 'powder',
];
export const quantityDecimals = 6;

const MEASURED_SELLING_UNITS = new Set(measuredSellingUnits);
const PACK_SELLING_UNITS = new Set(packSellingUnits);
const MEASURED_PACK_UNITS = new Set(measuredPackUnits);
const MEASURED_DOSAGE_UNITS = new Set(measuredDosageUnits);
const MEASURED_NAME_WORDS = new Set(measuredNameWords);
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

export const snapQuantity = (value: number): number =>
  Number(value.toFixed(quantityDecimals));

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

function lineIsMeasured(item: BillingPrescriptionItem, drugName: string): boolean {
  const nameWords = [drugName, item.genericName || ''].flatMap((name) =>
    normalizeToken(name).split('_'),
  );
  return (
    MEASURED_DOSAGE_UNITS.has(normalizeToken(item.dosageUnit || '')) ||
    nameWords.some((word) => MEASURED_NAME_WORDS.has(word))
  );
}

const inventoryIsMeasured = (inventory: BillingInventory | null) =>
  inventory !== null &&
  (MEASURED_SELLING_UNITS.has(inventory.unit) ||
    MEASURED_PACK_UNITS.has(normalizeToken(inventory.packUnit || '')));

const isMeasured = (
  item: BillingPrescriptionItem,
  inventory: BillingInventory | null,
  drugName: string,
) => inventoryIsMeasured(inventory) || lineIsMeasured(item, drugName);

/**
 * @cc [owner:nareshshah139,label:product] prescription-line-need
 * A line's need MUST be its explicit quantity in selling units, else its dose count, else
 * 1 selling unit for a measured line. Lines with none of these MUST have an unknown need.
 * The need MUST NOT depend on which inventory item fills it.
 */
export function prescribedNeed(item: BillingPrescriptionItem, drugName: string): LineNeed | null {
  const explicit = explicitQuantity(item);
  if (explicit !== null) return { amount: explicit, unit: 'selling_units' };
  const { doses } = prescribedSchedule(item);
  if (doses !== null) return { amount: doses, unit: 'doses' };
  return lineIsMeasured(item, drugName) ? { amount: 1, unit: 'selling_units' } : null;
}

/**
 * @cc [owner:nareshshah139,label:product] selling-unit-need-value
 * One selling unit of an inventory item MUST cover this much of a line's need: 1 for a need in
 * selling units; the whole dose count for a measured item or a pack with no pack size; the pack
 * size for strips, boxes and packs; else 1 dose. Billing ceil(need / value) units MUST cover the need.
 */
export function sellingUnitValue(
  need: LineNeed,
  item: BillingPrescriptionItem,
  inventory: BillingInventory | null,
  drugName: string,
): number {
  if (need.unit === 'selling_units') return 1;
  if (isMeasured(item, inventory, drugName)) return need.amount;
  if (inventory && PACK_SELLING_UNITS.has(inventory.unit)) {
    return inventory.packSize && inventory.packSize > 0 ? inventory.packSize : need.amount;
  }
  return 1;
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

  const need = prescribedNeed(item, drugName);
  if (need === null) {
    return {
      quantity: 1,
      unit,
      review: {
        reason: 'schedule_unknown',
        message: 'No frequency or duration to count from. Confirm the quantity.',
      },
    };
  }

  if (inventory && PACK_SELLING_UNITS.has(inventory.unit) && !(inventory.packSize && inventory.packSize > 0)) {
    return {
      quantity: 1,
      unit,
      review: {
        reason: 'pack_size_unknown',
        message: `Pack size missing for this product. Confirm how many ${unitPlural(unit)} to bill.`,
      },
    };
  }

  return {
    quantity: Math.ceil(need.amount / sellingUnitValue(need, item, inventory, drugName)),
    unit,
    review: prescribedSchedule(item).conflict
      ? {
          reason: 'schedule_conflict',
          message: `Instructions "${item.instructions}" disagree with frequency ${item.frequency || 'not set'}. Quantity follows the instructions; confirm.`,
        }
      : null,
  };
}
