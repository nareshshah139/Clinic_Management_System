const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const mode = process.argv[2];
assert(mode === 'configured' || mode === 'unconfigured', 'usage: verify.cjs configured|unconfigured');

const APP = 'http://localhost:3100';
const collectorFile = path.join(__dirname, 'collector.jsonl');
const PATIENT = 'cmpatient0000000000000001';
const VISIT = 'cmvisit00000000000000001';
const HOSTILE = [
  PATIENT,
  VISIT,
  'cmpatient',
  'cmvisit',
  'Asha',
  'Rao',
  '9000012345',
  'Ravi',
  'Kumar',
  'ravi.kumar',
  '9876543210',
  '0AbSecretCode',
  'statetoken',
  'patientId',
  'visitId',
  'search=',
  'q=',
  'auth_token',
  'Linaé',
  'Patient Details',
];

const records = () =>
  fs
    .readFileSync(collectorFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(4000);
}

(async () => {
  fs.writeFileSync(collectorFile, '');
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([{ name: 'auth_token', value: 'stub-session', url: APP }]);
  const page = await context.newPage();
  const toCollector = [];
  page.on('request', (request) => {
    if (request.url().startsWith('http://localhost:4010')) toCollector.push(request.url());
  });

  const first = await page.goto(`${APP}/dashboard/patients/${PATIENT}?search=Asha%20Rao`);
  const referrerPolicy = first.headers()['referrer-policy'] ?? null;
  await settle(page);

  await page.locator('a[href="/dashboard/appointments"]').first().click();
  await page.waitForURL('**/dashboard/appointments');
  await settle(page);

  await page.evaluate(() => {
    document.title = 'Asha Rao | Linaé';
  });
  await page.goto(`${APP}/dashboard/pharmacy/sales?field=mobile&q=9000012345`);
  await settle(page);

  await page.goto(`${APP}/dashboard/visits?patientId=${PATIENT}&visitId=${VISIT}`);
  await settle(page);

  await page.goto(`${APP}/dashboard/appointments/google-callback?code=4/0AbSecretCode&state=statetoken`);
  await settle(page);

  await page.goto(`${APP}/login?next=/dashboard/patients/${PATIENT}`);
  await settle(page);

  await browser.close();

  const seen = records();
  const result = { mode, requestsToCollector: toCollector.length, recorded: seen.length, referrerPolicy };

  if (mode === 'unconfigured') {
    assert.strictEqual(toCollector.length, 0, 'unconfigured build contacted the collector');
    assert.strictEqual(seen.length, 0, 'unconfigured build delivered a payload');
    console.log(JSON.stringify({ ...result, verdict: 'PASS' }, null, 2));
    return;
  }

  const bodies = seen.map((record) => JSON.parse(record.body));
  const identifies = bodies.filter((body) => body.type === 'identify');
  const screens = bodies.filter((body) => body.type === 'track' && body.payload.name === 'screen_view');
  const paths = screens.map((body) => body.payload.properties.__path);

  assert(identifies.length >= 1, 'no identify payload arrived');
  for (const identify of identifies) {
    assert.deepStrictEqual(identify.payload, {
      profileId: 'cmstaff000000000000000001',
      properties: { role: 'DOCTOR', branch_id: 'branch-seed-1' },
    });
  }
  assert.deepStrictEqual(paths, [
    `${APP}/dashboard/patients/[id]`,
    `${APP}/dashboard/appointments`,
    `${APP}/dashboard/pharmacy/sales`,
    `${APP}/dashboard/visits`,
    `${APP}/dashboard/appointments/google-callback`,
  ]);
  for (const screen of screens) {
    assert.deepStrictEqual(Object.keys(screen.payload.properties).sort(), ['__path', 'branch_id', 'role']);
    assert.strictEqual(screen.payload.profileId, 'cmstaff000000000000000001');
  }
  for (const record of seen) {
    assert.strictEqual(record.url, '/track');
    assert.strictEqual(record.clientId, 'verify-client');
    assert.strictEqual(record.referer, `${APP}/`, `referer leaked a path: ${record.referer}`);
    assert.strictEqual(record.cookie, null, 'cookie reached the collector');
    const wire = JSON.stringify(record);
    for (const token of HOSTILE) {
      assert(!wire.includes(token), `hostile token "${token}" reached the collector: ${wire}`);
    }
  }
  assert.strictEqual(referrerPolicy, 'strict-origin-when-cross-origin');

  console.log(
    JSON.stringify({ ...result, identifies: identifies.length, screenPaths: paths, sdkName: seen[0].sdkName, verdict: 'PASS' }, null, 2),
  );
})().catch((error) => {
  console.error('FAIL', error.message);
  process.exit(1);
});
