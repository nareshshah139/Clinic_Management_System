import fs from 'fs';
import path from 'path';

const PACKAGE_JSON = path.resolve(__dirname, '../../package.json');

describe('analytics dependency', () => {
  it('pins @openpanel/sdk to an exact version', () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.dependencies['@openpanel/sdk']).toBe('1.3.4');
  });
});
