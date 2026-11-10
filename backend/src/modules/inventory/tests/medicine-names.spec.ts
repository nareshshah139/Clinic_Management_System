import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { medicineNameProblems, printedMedicineName, standardMedicineName, strengthMissing } from '../medicine-names';
import { parseRecordedName } from '../medicine-name-parser';

const repo = path.resolve(__dirname, '../../../../..');
const cases = JSON.parse(readFileSync(path.join(repo, 'shared-types/cases/medicine-names.json'), 'utf8'));

describe('standard medicine names (shared case table)', () => {
  it.each(cases.standard.map((c: any) => [c.name, c]))('builds %s', (_name, c: any) => {
    expect(standardMedicineName(c.fields)).toBe(c.name);
    expect(strengthMissing(c.fields)).toBe(c.strengthMissing);
  });
  it.each(cases.problems.map((c: any) => [JSON.stringify(c.fields), c]))('refuses %s', (_label, c: any) => {
    expect(medicineNameProblems(c.fields).map((p) => p.field)).toEqual(c.problems);
  });
  it.each(cases.print.map((c: any) => [c.recorded, c]))('prints %s', (_recorded, c: any) => {
    expect(printedMedicineName(c.recorded)).toBe(c.printed);
    expect(printedMedicineName(c.printed)).toBe(c.printed);
  });
  it.each(cases.parse.map((c: any) => [c.recorded, c]))('reads the recorded name %s', (_recorded, c: any) => {
    const parsed = parseRecordedName(c.recorded, c.hints);
    if (c.unparsed) {
      expect(parsed).toMatchObject({ ok: false, reason: c.unparsed });
      return;
    }
    expect(parsed).toEqual({ ok: true, ...c.fields, standardName: c.name, strengthMissing: Boolean(c.strengthMissing) });
  });
  it('keeps the frontend copy identical to this module', () => {
    const backend = readFileSync(path.join(repo, 'backend/src/modules/inventory/medicine-names.ts'), 'utf8');
    const frontend = readFileSync(path.join(repo, 'frontend/src/lib/medicine-names.ts'), 'utf8');
    expect(frontend).toBe(backend);
  });
});
