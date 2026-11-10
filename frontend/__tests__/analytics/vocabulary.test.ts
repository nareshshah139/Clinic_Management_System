import fs from 'fs';
import path from 'path';
import { EVENTS, PAGE_ROUTES, SCREEN_VIEW } from '@/lib/analytics/vocabulary';

const APP_DIR = path.resolve(__dirname, '../../src/app');

function pageTemplates(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return pageTemplates(path.join(dir, entry.name), `${prefix}/${entry.name}`);
    return entry.name === 'page.tsx' ? [prefix === '' ? '/' : prefix] : [];
  });
}

describe('analytics vocabulary', () => {
  it('lists exactly the page.tsx routes under src/app', () => {
    expect([...PAGE_ROUTES].sort()).toEqual(pageTemplates(APP_DIR).sort());
  });

  it('keeps reserved names and identity properties out of the event catalog', () => {
    const propKeys = Object.values(EVENTS).flatMap((spec) => Object.keys(spec));
    const reserved = [SCREEN_VIEW, 'role', 'branch_id', '__path'];
    expect(Object.keys(EVENTS)).toContain('patient_registered');
    expect([...Object.keys(EVENTS), ...propKeys].filter((key) => reserved.includes(key))).toEqual([]);
  });
});
