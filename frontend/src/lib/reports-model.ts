export type ReportTab = 'revenue' | 'patients' | 'doctors' | 'appointments' | 'inventory' | 'payments';

export type ReportExportType = 'REVENUE' | 'PATIENT' | 'DOCTOR' | 'APPOINTMENT' | 'INVENTORY' | 'PAYMENT';

export const REPORT_EXPORT_TYPE: Record<ReportTab, ReportExportType> = {
  revenue: 'REVENUE',
  patients: 'PATIENT',
  doctors: 'DOCTOR',
  appointments: 'APPOINTMENT',
  inventory: 'INVENTORY',
  payments: 'PAYMENT',
};

export interface AgeBracket {
  ageGroup: string;
  count: number;
}

function bracketAge(ageGroup: string): number | null {
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(ageGroup.trim());
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const open = /^(\d+)\s*\+$/.exec(ageGroup.trim());
  return open ? Number(open[1]) : null;
}

export function averageAgeFromBrackets(brackets: AgeBracket[] | undefined): number | null {
  let patients = 0;
  let ageSum = 0;
  for (const bracket of brackets ?? []) {
    const age = bracketAge(bracket.ageGroup);
    if (age === null || !(bracket.count > 0)) continue;
    patients += bracket.count;
    ageSum += age * bracket.count;
  }
  return patients ? Math.round(ageSum / patients) : null;
}
