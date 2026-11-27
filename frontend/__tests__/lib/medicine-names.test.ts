import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { medicineNameProblems, printedInstructions, printedMedicineName, standardMedicineName, strengthMissing, titleCaseDisplay } from '@/lib/medicine-names';

const cases = JSON.parse(readFileSync(path.resolve(__dirname, '../../../shared-types/cases/medicine-names.json'), 'utf8'));

describe('standard medicine names (shared case table, frontend copy)', () => {
  it.each(cases.standard.map((c: any) => [c.name, c]))('builds %s', (_name, c: any) => {
    expect(standardMedicineName(c.fields)).toBe(c.name);
    expect(strengthMissing(c.fields)).toBe(c.strengthMissing);
  });
  it.each(cases.problems.map((c: any) => [JSON.stringify(c.fields), c]))('refuses %s', (_label, c: any) => {
    expect(medicineNameProblems(c.fields).map((p) => p.field)).toEqual(c.problems);
  });
  it.each(cases.print.map((c: any) => [c.recorded, c]))('prints %s', (_recorded, c: any) => {
    expect(printedMedicineName(c.recorded)).toBe(c.printed);
  });
  it.each(cases.display.map((c: any) => [String(c.text), c]))('shows %j in title case', (_text, c: any) => {
    expect(titleCaseDisplay(c.text)).toBe(c.display);
    expect(titleCaseDisplay(c.display)).toBe(c.display);
  });
  it.each(cases.instructions.map((c: any) => [String(c.text), c]))('prints the instructions %j', (_text, c: any) => {
    expect(printedInstructions(c.text)).toBe(c.display);
  });
});
