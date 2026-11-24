import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../src');
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
const PORTAL_CODE = [...files(path.join(SRC, 'app/p')), ...files(path.join(SRC, 'lib/portal')), ...files(path.join(SRC, 'components/portal'))];

describe('portal pages send nothing to analytics (PP-89)', () => {
  it('finds the portal sources', () => {
    expect(PORTAL_CODE.map((f) => path.relative(SRC, f))).toEqual(expect.arrayContaining(['app/p/page.tsx', 'app/p/records/page.tsx', 'app/p/t/page.tsx']));
  });

  it.each(PORTAL_CODE.map((f) => [path.relative(SRC, f), f]))('%s imports no analytics, tracking SDK or the staff layout', (_, file) => {
    const text = fs.readFileSync(file, 'utf8');
    expect(text).not.toMatch(/@\/lib\/analytics|@openpanel|posthog|gtag|dataLayer|dashboard-layout/);
  });

  it('the portal layout mounts no analytics either', () => {
    expect(fs.readFileSync(path.join(SRC, 'app/layout.tsx'), 'utf8')).not.toMatch(/analytics/i);
  });
});
