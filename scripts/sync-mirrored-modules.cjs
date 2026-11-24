const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pairs = [
  ['frontend/src/lib/date-display.ts', 'backend/src/common/date-display.ts'],
  ['frontend/src/lib/pdf-file-name.ts', 'backend/src/common/pdf-file-name.ts'],
];

if (process.argv.includes('--check')) {
  const stale = pairs.filter(([source, target]) => {
    const copy = path.join(root, target);
    return !fs.existsSync(copy) || fs.readFileSync(copy, 'utf8') !== fs.readFileSync(path.join(root, source), 'utf8');
  });
  for (const [source, target] of stale) console.error(`${target} is out of sync with ${source}.`);
  if (stale.length) {
    console.error('Edit the frontend file, then run node scripts/sync-mirrored-modules.cjs.');
    process.exitCode = 1;
  }
} else {
  for (const [source, target] of pairs) fs.copyFileSync(path.join(root, source), path.join(root, target));
}
