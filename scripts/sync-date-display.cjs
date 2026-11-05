const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'frontend/src/lib/date-display.ts');
const target = path.join(root, 'backend/src/common/date-display.ts');

function sync() {
  const expected = fs.readFileSync(source, 'utf8');
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== expected) {
      console.error('Date formatter is out of sync. Run node scripts/sync-date-display.cjs.');
      process.exitCode = 1;
    }
  } else {
    fs.writeFileSync(target, expected);
  }
}
sync();
