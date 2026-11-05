const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function loadTs(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', compiled)(module.exports, module, (name) => {
    if (name === '@/lib/date-display') return loadTs('frontend/src/lib/date-display.ts');
    throw new Error(`Unexpected dependency ${name}`);
  });
  return module.exports;
}

if (!process.env.DATE_DISPLAY_TEST_CHILD) {
  for (const timezone of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    const result = spawnSync(process.execPath, [__filename], {
      env: { ...process.env, TZ: timezone, DATE_DISPLAY_TEST_CHILD: '1' }, stdio: 'inherit',
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
} else {
  for (const file of ['frontend/src/lib/date-display.ts', 'backend/src/common/date-display.ts']) {
    const d = loadTs(file);
    assert.equal(d.displayCalendarDate('2026-11-05'), '05 Nov 2026');
    assert.equal(d.displayCalendarDate('2026-11'), 'Nov 2026');
    assert.equal(d.displayCalendarDate('2024-02-29'), '29 Feb 2024');
    assert.equal(d.displayCalendarDate('2026-11-05T09:00:00Z'), '—');
    assert.equal(d.displayUtcDate('2026-11'), 'Nov 2026');
    assert.equal(d.displayUtcDate('2026-11-30T23:59:59.999Z'), '30 Nov 2026');
    assert.equal(d.displayUtcDate(new Date('2026-11-30T23:59:59.999Z')), '30 Nov 2026');
    assert.equal(d.displayUtcDate('2026-11-01T01:00:00+05:30'), '31 Oct 2026');
    assert.equal(d.displayClinicDate('2026-11-30T23:59:59.999Z'), '01 Dec 2026');
    assert.equal(d.displayClinicDateTime('2026-11-05T09:00:00Z'), '05 Nov 2026, 02:30 pm');
    assert.equal(d.displayClinicDateTime('2026-11-05T14:30:00+05:30'), '05 Nov 2026, 02:30 pm');
    assert.equal(d.displayClinicDateTime('2026-11-05T01:00:00-08:00'), '05 Nov 2026, 02:30 pm');
    assert.equal(d.displayClinicTime('2026-11-04T18:30:00Z'), '12:00 am');
    assert.equal(d.displayClinicTime('2026-11-05T06:30:00Z'), '12:00 pm');
    assert.equal(d.displayMailDateTime('Thu, 5 Nov 2026 14:30:00 +0530 (IST)'), '05 Nov 2026, 02:30 pm');
    assert.equal(d.displayMailDateTime('5 Nov 2026 09:00 GMT'), '05 Nov 2026, 02:30 pm');
    assert.equal(d.displayMailDateTime('31 Feb 2026 09:00 +0000'), '—');
    assert.equal(d.displayMailDateTime('5 Nov 2026 09:00'), '—');
    assert.equal(d.displayMailDateTime(null, ''), '');
    assert.equal(d.displayLocalDate(new Date(2026, 10, 5)), '05 Nov 2026');
    assert.equal(d.displayLocalDateHeading(new Date(2026, 10, 5)), 'Thursday, 5 November 2026');
    for (const value of [undefined, null, '', ' ', 'not a date', '2026-02-30', '2026-13-01', '2026-00-05', '2026-11-00', '0000-11-05']) {
      assert.equal(d.displayCalendarDate(value), '—');
      assert.equal(d.displayUtcDate(value, 'Unverified'), 'Unverified');
      assert.equal(d.displayClinicDateTime(value, ''), '');
    }
    for (const value of ['2026-02-30T09:00:00Z', '2026-11-05T24:00:00Z', '2026-11-05T09:60:00Z', '2026-11-05T09:00:60Z', '2026-11-05T09:00:00+24:00', '2026-11-05T09:00:00+05:60', '2026-11-05T09:00:00', new Date(NaN)]) {
      assert.equal(d.displayUtcDate(value, 'Unverified'), 'Unverified');
      assert.equal(d.displayClinicDateTime(value, ''), '');
      assert.equal(d.displayClinicDate(value), '—');
      assert.equal(d.displayClinicTime(value), '—');
    }
    assert.equal(d.displayClinicDateTime('2026-11-05'), '—');
    assert.equal(d.displayClinicDateTime('2026-11'), '—');
    assert.equal(d.displayLocalDate(new Date(NaN), ''), '');
    assert.equal(d.displayLocalDate(null), '—');
  }
  const stock = loadTs('frontend/src/components/inventory/stock-batch-view.ts');
  assert.equal(stock.fmtStockExpiry('2026-11-30T23:59:59.999Z'), '30 Nov 2026');
  assert.equal(stock.fmtStockExpiry('2026-11'), 'Nov 2026');
  assert.equal(stock.fmtStockExpiry('2026-02-30'), 'Unverified');
  assert.equal(stock.fmtStockExpiry(null), 'Unverified');
  console.log(`Date display assertions passed in ${process.env.TZ}`);
}
