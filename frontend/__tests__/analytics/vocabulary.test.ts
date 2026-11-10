import fs from 'fs';
import path from 'path';
import { EVENTS, ROUTES, SCREEN_VIEW } from '@/lib/analytics/vocabulary';

const APP_DIR = path.resolve(__dirname, '../../src/app');

function pageTemplates(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return pageTemplates(path.join(dir, entry.name), `${prefix}/${entry.name}`);
    return entry.name === 'page.tsx' ? [prefix === '' ? '/' : prefix] : [];
  });
}

describe('analytics vocabulary', () => {
  it('lists exactly the page.tsx routes under src/app', () => {
    expect([...ROUTES].sort()).toEqual(pageTemplates(APP_DIR).sort());
  });

  it('keeps reserved names and identity properties out of the event catalog', () => {
    const names = Object.keys(EVENTS);
    const propKeys = Object.values(EVENTS).flatMap((spec) => Object.keys(spec));
    expect(names).toEqual([
      'patient_registered',
      'appointment_booked',
      'visit_completed',
      'prescription_created',
      'invoice_created',
    ]);
    expect(names).not.toContain(SCREEN_VIEW);
    expect(propKeys).toEqual(['source', 'source', 'follow_up_set', 'mode']);
  });
});
