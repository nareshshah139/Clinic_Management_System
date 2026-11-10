import fs from 'fs';
import path from 'path';

const PACKAGE_JSON = path.resolve(__dirname, '../../package.json');

describe('analytics dependency', () => {
  it('pins @openpanel/sdk to an exact version', () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.dependencies['@openpanel/sdk']).toBe('1.3.4');
  });
});

const SRC_DIR = path.resolve(__dirname, '../../src');
const ANALYTICS_DIR = path.join(SRC_DIR, 'lib/analytics');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const appFiles = sourceFiles(SRC_DIR).filter((file) => !file.startsWith(ANALYTICS_DIR + path.sep));

describe('analytics import boundary', () => {
  it('has application files to check', () => {
    expect(appFiles).toContain(path.join(SRC_DIR, 'components/layout/dashboard-layout.tsx'));
  });

  it('keeps the SDK inside src/lib/analytics', () => {
    const offenders = appFiles.filter((file) => /['"]@openpanel\//.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('exposes analytics to the app only through the barrel', () => {
    const offenders = appFiles.filter((file) => /['"]@\/lib\/analytics\//.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
