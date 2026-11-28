import { encounterTime } from '@/lib/patient-history';

export type LastVisit = {
  date: number;
  chiefComplaints: string;
  diagnosis: string;
  pastHistory: string;
  medicationHistory: string;
  menstrualHistory: string;
  familyHistory: { dm: boolean; htn: boolean; thyroid: boolean; others: string };
  medicines: unknown[];
};

const parsed = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
};
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const joined = (rows: unknown, key: string) => {
  const list = parsed(rows);
  return Array.isArray(list) ? list.map((row) => text(row?.[key])).filter(Boolean).join(', ') : '';
};
const records = (value: unknown) => {
  const list = parsed(value);
  return Array.isArray(list) ? list.filter((row) => row && typeof row === 'object') : [];
};
const medicinesOf = (visit: Record<string, any>) => {
  const issued = records(visit.prescriptionItems);
  if (issued.length) return issued;
  const plan = (parsed(visit.plan) ?? {}) as Record<string, any>;
  return records(plan.dermatology?.medicationPlan ?? plan.medicationPlan);
};

function describeVisit(visit: Record<string, any>): LastVisit {
  const history = (parsed(visit.history) ?? {}) as Record<string, any>;
  const family = history.familyHistory ?? {};
  return {
    date: encounterTime(visit),
    chiefComplaints: joined(visit.complaints, 'complaint'),
    diagnosis: joined(visit.diagnosis, 'diagnosis'),
    pastHistory: text(history.pastHistory),
    medicationHistory: text(history.medicationHistory),
    menstrualHistory: text(history.menstrualHistory),
    familyHistory: { dm: family.dm === true, htn: family.htn === true, thyroid: family.thyroid === true, others: text(family.others) },
    medicines: medicinesOf(visit),
  };
}

const hasContent = (visit: LastVisit) =>
  Boolean(
    visit.chiefComplaints || visit.diagnosis || visit.pastHistory || visit.medicationHistory || visit.menstrualHistory ||
      visit.familyHistory.dm || visit.familyHistory.htn || visit.familyHistory.thyroid || visit.familyHistory.others ||
      visit.medicines.length,
  );

export function findLastVisit(visits: Array<Record<string, any>>, currentVisitId?: string | null): LastVisit | null {
  const newestFirst = [...visits].sort((a, b) => encounterTime(b) - encounterTime(a));
  for (const visit of newestFirst) {
    if (!visit?.id || visit.id === currentVisitId) continue;
    const described = describeVisit(visit);
    if (hasContent(described)) return described;
  }
  return null;
}
