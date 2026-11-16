export interface MedicineNameFields { brandName?: string | null; dosageForm?: string | null; strength?: string | null; combinationProduct?: boolean; dispenseLoose?: boolean; itemCode?: string | null; }
export function medicineNameParts(name?: string | null, fields?: MedicineNameFields): { brandName: string; dosageForm: string; strength: string; combinationProduct: boolean; dispenseLoose: boolean; itemCode: string };
export function formatMedicineName(name?: string | null, fields?: MedicineNameFields): string;
export function medicineNameIssues(fields: MedicineNameFields): string[];
export function normalizeMedicineForm(value?: string | null): string;
