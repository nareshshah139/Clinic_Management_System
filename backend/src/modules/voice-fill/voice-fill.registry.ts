import { UserRole } from '@prisma/client';
import { InventoryItemType, UnitType } from '../inventory/dto/inventory.dto';
import { MEDICINE_FORM_KEYS } from '../inventory/medicine-names';

export type VoiceFillFormId = 'patient-intake' | 'visit-consultation' | 'inventory-item' | 'voice-command';
export type VoiceFillRow = Record<string, string | number>;
export type VoiceFillValue = string | number | boolean | string[] | VoiceFillRow[];
export type VoiceFillFields = Record<string, VoiceFillValue>;

interface FieldBase {
  label: string;
  hint?: string;
}

type TextSpec = { type: 'text'; normalize?: 'phone' | 'digits'; pattern?: RegExp; maxLength?: number };
type NumberSpec = { type: 'number'; min?: number; max?: number; integer?: boolean };
type EnumSpec = { type: 'enum'; values: readonly string[] };

export type VoiceFillScalarSpec = FieldBase &
  (
    | TextSpec
    | { type: 'longText'; maxLength?: number }
    | NumberSpec
    | EnumSpec
    | { type: 'boolean' }
    | { type: 'date' }
    | { type: 'list'; values?: readonly string[]; maxItems?: number }
  );

// Row cells are limited to specs whose values are strings or numbers, so a row can never hold a list or another row.
export type VoiceFillRowFieldSpec = FieldBase & (TextSpec | NumberSpec | EnumSpec) & { required?: boolean };

export type VoiceFillRowsSpec = FieldBase & { type: 'rows'; maxItems: number; fields: Record<string, VoiceFillRowFieldSpec> };

export type VoiceFillFieldSpec = VoiceFillScalarSpec | VoiceFillRowsSpec;

export interface VoiceFillForm {
  purpose: string;
  roles: readonly UserRole[];
  fields: Record<string, VoiceFillFieldSpec>;
}

const text = (label: string, rest: { hint?: string; normalize?: 'phone' | 'digits'; pattern?: RegExp; maxLength?: number } = {}): VoiceFillRowFieldSpec =>
  ({ type: 'text', label, ...rest });
const longText = (label: string, hint?: string): VoiceFillFieldSpec => ({ type: 'longText', label, hint });
const num = (label: string, min?: number, max?: number, rest: { integer?: boolean; hint?: string } = {}): VoiceFillRowFieldSpec =>
  ({ type: 'number', label, min, max, ...rest });
const int = (label: string, min?: number, max?: number): VoiceFillRowFieldSpec => num(label, min, max, { integer: true });
const oneOf = (label: string, values: readonly string[]): VoiceFillRowFieldSpec => ({ type: 'enum', label, values });
const flag = (label: string): VoiceFillFieldSpec => ({ type: 'boolean', label });
const day = (label: string, hint: string): VoiceFillFieldSpec => ({ type: 'date', label, hint });

export const VOICE_FILL_FORMS: Record<VoiceFillFormId, VoiceFillForm> = {
  'patient-intake': {
    purpose: 'Registering a patient at a clinic reception desk.',
    roles: [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTION],
    fields: {
      firstName: text('First name'),
      lastName: text('Last name'),
      age: int('Age in years', 0, 150),
      gender: oneOf('Gender', ['MALE', 'FEMALE', 'OTHER']),
      phone: text('Phone number', { normalize: 'phone', pattern: /^\+?[1-9]\d{6,14}$/ }),
      email: text('Email address', { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
      address: text('Address'),
      emergencyContact: text('Emergency contact', { hint: 'name and/or phone of the emergency contact' }),
      abhaId: text('ABHA ID', { normalize: 'digits', pattern: /^\d{14}$/ }),
      consultationType: oneOf('Consultation type', ['ONLINE', 'OFFLINE']),
      referralSource: oneOf('Referral source', ['INSTAGRAM', 'TWITTER', 'GOOGLE', 'DOCTOR', 'FRIENDS_FAMILY', 'OTHER']),
      patientType: oneOf('Patient type', ['WALKIN', 'NON_WALKIN']),
    },
  },
  'visit-consultation': {
    purpose: "A doctor's dictation during a dermatology and general clinic consultation.",
    roles: [UserRole.OWNER, UserRole.ADMIN, UserRole.DOCTOR],
    fields: {
      heightCm: num('Height in cm', 30, 250),
      weightKg: num('Weight in kg', 1, 400),
      bpSystolic: int('Systolic blood pressure', 50, 260),
      bpDiastolic: int('Diastolic blood pressure', 30, 160),
      pulse: int('Pulse rate per minute', 20, 250),
      temperatureF: num('Temperature in Fahrenheit', 90, 110, { hint: 'convert Celsius to Fahrenheit' }),
      respiratoryRate: int('Respiratory rate per minute', 4, 60),
      painScore: int('Pain score', 0, 10),
      chiefComplaints: longText('Chief complaints'),
      skinConcerns: { type: 'list', label: 'Skin concerns', values: ['Acne', 'Pigmentation', 'Aging', 'Dryness', 'Sensitivity', 'Redness', 'Scarring'] },
      diagnosis: text('Diagnosis'),
      pastHistory: longText('Past history'),
      medicationHistory: longText('Medication history'),
      menstrualHistory: longText('Menstrual history'),
      familyHistoryDiabetes: flag('Family history of diabetes'),
      familyHistoryHypertension: flag('Family history of hypertension'),
      familyHistoryThyroid: flag('Family history of thyroid disease'),
      familyHistoryOthers: text('Other family history'),
      examination: longText('Examination', 'examination findings'),
      fitzpatrickSkinType: oneOf('Fitzpatrick skin type', ['I', 'II', 'III', 'IV', 'V', 'VI']),
      acneSeverity: oneOf('Acne severity', ['mild', 'moderate', 'severe']),
      itchScore: int('Itch score', 0, 10),
      procedures: longText('Procedures', 'procedures done today'),
      procedurePlanned: text('Procedure planned'),
      investigations: { type: 'list', label: 'Investigations', hint: 'lab tests ordered, one per item' },
      followUpInstructions: text('Follow-up instructions', { hint: 'e.g. Review in 4 weeks' }),
      prescriptionItems: {
        type: 'rows',
        label: 'Prescription items',
        maxItems: 10,
        fields: {
          drugName: { ...text('Medicine name', { hint: 'medicine name as spoken, brand or generic, without dose' }), required: true },
          dosage: num('Dose amount', 0, 10000),
          dosageUnit: oneOf('Dose unit', ['MG', 'ML', 'MCG', 'IU', 'TABLET', 'CAPSULE', 'DROP', 'SPRAY', 'PATCH', 'INJECTION']),
          frequency: oneOf('Frequency', ['ONCE_DAILY', 'TWICE_DAILY', 'THREE_TIMES_DAILY', 'FOUR_TIMES_DAILY', 'EVERY_4_HOURS',
            'EVERY_6_HOURS', 'EVERY_8_HOURS', 'EVERY_12_HOURS', 'AS_NEEDED', 'WEEKLY', 'MONTHLY']),
          dosePattern: text('Dose pattern', { pattern: /^\d+(\.\d+)?-\d+(\.\d+)?-\d+(\.\d+)?$/, hint: 'morning-afternoon-night, e.g. 1-0-1' }),
          duration: int('Duration', 1, 365),
          durationUnit: oneOf('Duration unit', ['DAYS', 'WEEKS', 'MONTHS']),
          timing: text('Timing', { hint: 'prefer one of AM, PM, After Breakfast, After Lunch, After Dinner, Before Meals, With Food, Empty Stomach, HS (bedtime); otherwise a few words' }),
          route: text('Route', { hint: 'e.g. oral, topical' }),
          applicationSite: text('Application site', { hint: 'topicals only, e.g. face' }),
          instructions: text('Instructions'),
        },
      },
    },
  },
  'inventory-item': {
    purpose: 'Adding an item to a clinic pharmacy and supplies inventory.',
    roles: [UserRole.OWNER, UserRole.ADMIN, UserRole.DOCTOR, UserRole.PHARMACIST, UserRole.RECEPTION],
    fields: {
      type: oneOf('Item type', Object.values(InventoryItemType)),
      name: text('Name', { hint: 'brand name only; no form, strength or pack size' }),
      form: oneOf('Medicine form', MEDICINE_FORM_KEYS),
      strength: text('Strength', { maxLength: 60, hint: 'e.g. 150 mg; units mg, mcg, g, IU, %' }),
      genericName: text('Generic name'),
      description: longText('Description'),
      category: text('Category'),
      subCategory: text('Sub-category'),
      manufacturer: text('Manufacturer'),
      supplier: text('Supplier'),
      costPrice: num('Cost price', 0),
      sellingPrice: num('Selling price', 0),
      mrp: num('MRP', 0),
      unit: oneOf('Unit', Object.values(UnitType)),
      packSize: int('Pack size', 1),
      packUnit: text('Pack unit', { hint: 'e.g. tablets, ml' }),
      batchNumber: text('Batch number'),
      expiryDate: { type: 'date', label: 'Expiry date', hint: 'month-only expiry means the last day of that month' },
      hsnCode: text('HSN code'),
      gstRate: num('GST rate percent', 0, 100),
      storageLocation: text('Storage location'),
      storageConditions: text('Storage conditions'),
      requiresPrescription: flag('Requires prescription'),
      reorderLevel: int('Reorder level', 0),
      minStockLevel: int('Minimum stock level', 0),
      defaultFrequency: text('Default frequency', { hint: 'e.g. 1-0-1' }),
      defaultDuration: int('Default duration', 1),
      defaultDurationUnit: oneOf('Default duration unit', ['DAYS', 'WEEKS', 'MONTHS', 'YEARS']),
      defaultInstructions: longText('Default instructions'),
    },
  },
  'voice-command': {
    purpose: 'A clinic staff member speaking a command to the clinic app.',
    roles: [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTION],
    fields: {
      action: {
        ...oneOf('Action', ['schedule_appointment', 'reschedule_appointment', 'cancel_appointment', 'check_in', 'open_patient',
          'start_visit', 'unknown']),
        hint: 'book or schedule means schedule_appointment; move or shift means reschedule_appointment; open, show or pull up a chart means open_patient; start or begin a consultation means start_visit; unknown for anything else',
      },
      patientName: text('Patient name', { hint: 'as spoken, without Mr, Mrs or Smt' }),
      patientPhone: text('Patient phone', { normalize: 'phone', pattern: /^\+?\d{4,15}$/ }),
      doctorName: text('Doctor name', { hint: 'without Dr or Doctor' }),
      date: day('Date', 'the day to book, or the new day for a reschedule. Resolve today, tomorrow (kal), day after tomorrow (parso) and weekdays against today; a bare weekday or next <weekday> means the first such day after today'),
      time: text('Time', { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, hint: '24-hour HH:MM. Clinic hours are daytime, so 10 means 10:00 and 4 or 4 pm means 16:00' }),
      partOfDay: { ...oneOf('Part of day', ['morning', 'afternoon', 'evening']), hint: 'only when no exact time was said' },
      visitType: { ...oneOf('Visit type', ['OPD', 'TELEMED', 'PROCEDURE']), hint: 'laser, peel or any procedure means PROCEDURE; video or online means TELEMED' },
      fromDate: day('Existing appointment date', 'the day of an existing appointment being rescheduled, cancelled or checked in, if said'),
      notes: text('Notes', { hint: 'a reason or note the speaker asked to record' }),
    },
  },
};

export function findVoiceFillForm(id: string): VoiceFillForm | undefined {
  return Object.hasOwn(VOICE_FILL_FORMS, id) ? VOICE_FILL_FORMS[id as VoiceFillFormId] : undefined;
}

export const VOICE_FILL_ROUTE_ROLES: UserRole[] = [
  ...new Set(Object.values(VOICE_FILL_FORMS).flatMap((form) => form.roles)),
];
