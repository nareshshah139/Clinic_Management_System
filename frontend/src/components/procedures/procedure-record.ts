import type { VisitSummary } from '@/lib/types';

interface MachineSpec {
  name: string;
  parameters: readonly string[];
  passes: number;
  legacyParameterNames?: Readonly<Record<string, string>>;
}

export const MACHINES = {
  'endymed-pro-max': {
    name: 'Endymed Pro Max',
    parameters: ['Intensity', 'RF', 'Depth', 'Area Treated', 'Mode'],
    passes: 8,
  },
  'fotona-starwalker': {
    name: 'Fotona Starwalker',
    parameters: ['Area', 'Spot Size', 'Energy', 'Fluence', 'Frequency', 'Wavelength', 'PTP Mode'],
    passes: 8,
    legacyParameterNames: { Fluency: 'Fluence' },
  },
  'soprano-platinum-lhr': {
    name: 'Soprano Platinum LHR',
    parameters: ['Area', 'Fluence', 'Spot Size'],
    passes: 8,
  },
  hydrafacial: {
    name: 'Hydrafacial',
    parameters: ['Actives Used', 'Area'],
    passes: 1,
  },
} as const satisfies Record<string, MachineSpec>;

export type MachineId = keyof typeof MACHINES;

export const machineSpec = (id: MachineId): MachineSpec => MACHINES[id];

export const isMachineId = (value: unknown): value is MachineId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(MACHINES, value);

export const SKIN_TYPES = {
  fitzpatrick: ['I', 'II', 'III', 'IV', 'V', 'VI'],
  robert: ['Type 1', 'Type 2', 'Type 3', 'Type 4'],
  scar: ['Atrophic', 'Hypertrophic', 'Keloid', 'Rolling', 'Boxcar', 'Ice Pick'],
  herpes: ['Active', 'Inactive', 'History', 'None'],
} as const;

export const BODY_PARTS = [
  'Face', 'Forehead', 'Cheeks', 'Nose', 'Chin', 'Neck', 'Chest', 'Back',
  'Arms', 'Legs', 'Hands', 'Feet', 'Abdomen', 'Shoulders', 'Other',
] as const;

export type PassValues = Record<number, string>;
export type MachineParameters = Record<string, PassValues>;

export interface SkinTypes {
  fitzpatrick: string;
  robert: string;
  scar: string;
  herpes: string;
}

export interface PatientRef {
  id: string;
  name: string;
}

export interface SavedVisitRef {
  id: string;
  version?: number;
  createdAt: string;
  otherProcedures: unknown[];
}

export interface ProcedureRecord {
  visit: SavedVisitRef | null;
  patient: PatientRef | null;
  doctorId: string;
  therapistId: string;
  machine: MachineId | '';
  sessionNo: number;
  bodyParts: string[];
  indications: string;
  skinTypes: SkinTypes;
  shotCounts: { begin: number; end: number };
  parameters: MachineParameters;
  notes: string;
}

export const emptyProcedure = (doctorId = ''): ProcedureRecord => ({
  visit: null,
  patient: null,
  doctorId,
  therapistId: '',
  machine: '',
  sessionNo: 1,
  bodyParts: [],
  indications: '',
  skinTypes: { fitzpatrick: '', robert: '', scar: '', herpes: '' },
  shotCounts: { begin: 0, end: 0 },
  parameters: {},
  notes: '',
});

export const totalShots = ({ begin, end }: ProcedureRecord['shotCounts']): number | null =>
  end >= begin ? end - begin : null;

export const filledParameters = (parameters: MachineParameters): Array<[string, Array<[number, string]>]> =>
  Object.entries(parameters)
    .map(([name, passes]): [string, Array<[number, string]>] => [
      name,
      Object.entries(passes)
        .map(([pass, value]): [number, string] => [Number(pass), value.trim()])
        .filter(([, value]) => value !== '')
        .sort(([a], [b]) => a - b),
    ])
    .filter(([, passes]) => passes.length > 0);

const keepMachineParameters = (machine: MachineId | '', parameters: MachineParameters): MachineParameters => {
  const allowed = machine ? new Set(machineSpec(machine).parameters) : null;
  const kept: MachineParameters = {};
  for (const [name, passes] of filledParameters(parameters)) {
    if (allowed && !allowed.has(name)) continue;
    kept[name] = Object.fromEntries(passes);
  }
  return kept;
};

export type VisitRequest =
  | { kind: 'create'; body: Record<string, unknown> }
  | { kind: 'update'; visitId: string; body: Record<string, unknown> };

/**
 * The procedure is stored as the visit's first dermatology procedure, with notes on the
 * visit plan so the visit timeline shows them. `parseVisitProcedure` reads this shape back.
 */
export function toVisitRequest(record: ProcedureRecord): VisitRequest {
  const machine = record.machine;
  const treatmentPlan = {
    dermatology: {
      procedures: [{
        type: machine ? machineSpec(machine).name : undefined,
        machine,
        therapistId: record.therapistId || undefined,
        sessionNo: record.sessionNo,
        bodyPart: record.bodyParts,
        indications: record.indications,
        skinTypes: record.skinTypes,
        shotCounts: record.shotCounts,
        parameters: keepMachineParameters(machine, record.parameters),
      }, ...(record.visit?.otherProcedures ?? [])],
    },
    notes: record.notes,
  };
  if (record.visit) {
    return { kind: 'update', visitId: record.visit.id, body: { version: record.visit.version, treatmentPlan } };
  }
  return {
    kind: 'create',
    body: { patientId: record.patient?.id, doctorId: record.doctorId, complaints: [], treatmentPlan },
  };
}

export interface StoredProcedure {
  record: ProcedureRecord & { visit: SavedVisitRef };
  label: string;
  doctorName: string;
  /** False for procedures typed into the visit form; saving here would overwrite that visit's own shape. */
  editable: boolean;
}

const asObject = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value === 'string') {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');
const count = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number.parseInt(text(value), 10);
  return Number.isFinite(n) ? n : fallback;
};

const parseParameters = (machine: MachineId | '', value: unknown): MachineParameters => {
  const renames = machine ? machineSpec(machine).legacyParameterNames ?? {} : {};
  const parameters: MachineParameters = {};
  for (const [rawName, rawPasses] of Object.entries(asObject(value) ?? {})) {
    const name = renames[rawName] ?? rawName;
    for (const [pass, raw] of Object.entries(asObject(rawPasses) ?? {})) {
      const v = text(raw);
      const passNo = Number(pass);
      if (!v || !Number.isInteger(passNo)) continue;
      parameters[name] = { ...parameters[name], [passNo]: v };
    }
  }
  return parameters;
};

const machineFromLabel = (label: string): MachineId | '' => {
  const lower = label.toLowerCase();
  const match = (Object.keys(MACHINES) as MachineId[]).find((id) => lower.includes(id.split('-')[0]));
  return match ?? '';
};

type VisitWithRelations = VisitSummary & {
  patient?: { id?: string; name?: string } | null;
  doctor?: { firstName?: string; lastName?: string } | null;
};

export function parseVisitProcedure(visit: VisitWithRelations): StoredProcedure | null {
  const plan = asObject(visit.plan);
  const stored = asObject(plan?.dermatology)?.procedures;
  const procedures: unknown[] = Array.isArray(stored) ? stored : [];
  const entry = asObject(procedures[0]);
  if (!entry) return null;

  const editable = isMachineId(entry.machine);
  const label = text(entry.type);
  const machine = editable ? (entry.machine as MachineId) : machineFromLabel(label);
  const skin = asObject(entry.skinTypes) ?? {};
  const shots = asObject(entry.shotCounts) ?? {};
  const parameters = editable
    ? parseParameters(machine, entry.parameters)
    : parseParameters('', {
        Fluence: { 1: entry.fluence },
        'Spot Size': { 1: entry.spotSize },
        Passes: { 1: entry.passes },
      });

  const doctorName = [visit.doctor?.firstName, visit.doctor?.lastName].filter(Boolean).join(' ');

  return {
    editable,
    label: (machine && editable ? machineSpec(machine).name : label) || 'Procedure',
    doctorName: doctorName ? `Dr. ${doctorName}` : '',
    record: {
      visit: { id: visit.id, version: visit.version, createdAt: visit.createdAt, otherProcedures: procedures.slice(1) },
      patient: { id: visit.patientId, name: visit.patient?.name || 'Unknown patient' },
      doctorId: visit.doctorId,
      therapistId: text(entry.therapistId),
      machine,
      sessionNo: count(entry.sessionNo, 1),
      bodyParts: Array.isArray(entry.bodyPart) ? entry.bodyPart.filter((p): p is string => typeof p === 'string') : [],
      indications: text(entry.indications),
      skinTypes: {
        fitzpatrick: text(skin.fitzpatrick),
        robert: text(skin.robert),
        scar: text(skin.scar),
        herpes: text(skin.herpes),
      },
      shotCounts: { begin: count(shots.begin, 0), end: count(shots.end, 0) },
      parameters,
      notes: text(plan?.notes),
    },
  };
}

export const repeatAsNewSession = ({ record }: StoredProcedure): ProcedureRecord => ({
  ...record,
  visit: null,
  sessionNo: record.sessionNo + 1,
  shotCounts: { begin: 0, end: 0 },
  parameters: keepMachineParameters(record.machine, record.parameters),
  notes: '',
});
