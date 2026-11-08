// Usage: start the frontend (cd frontend && npx next dev -p 3000), then
//   NODE_PATH=$(npm root -g) node scripts/diagnostics/calendar-day-layout-browser.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.CALENDAR_UI_URL || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Calendar check must target a loopback app');

/**
 * @cc [owner:nareshshah139,label:verification] isolated-calendar-layout-fixture
 * The check MUST answer every API request with synthetic data and MUST NOT reach clinic records.
 */
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const doctor = { id: 'doc-1', firstName: 'Praneeta', lastName: 'Jain', role: 'DOCTOR', branchId: 'b', isActive: true };
const rooms = [{ id: 'r1', name: 'Consult 1', type: 'CONSULTATION', isActive: true }, { id: 'r2', name: 'Procedure', type: 'PROCEDURE', isActive: true }];
const names = ['Satya Anil Uppalapati', 'Trina Ganguly', 'Sheetal T', 'Ravi Kumar', 'Anjali Rao', 'Mohammed Irfan', 'Lakshmi Devi', 'Karthik Reddy', 'Priya Nair', 'Suresh Babu', 'Fatima Begum'];
const slots = ['09:00-09:15', '09:15-09:30', '09:30-09:45', '10:00-10:30', '10:30-10:45', '11:00-11:15', '11:00-11:15', '12:00-12:30', '14:00-14:15', '14:15-14:30', '16:00-16:45'];
const statuses = ['COMPLETED', 'COMPLETED', 'IN_PROGRESS', 'CHECKED_IN', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'CONFIRMED', 'SCHEDULED', 'NO_SHOW', 'SCHEDULED'];
const appointments = names.map((name, i) => ({
  id: `a${i}`, doctorId: doctor.id, patientId: `p${i}`, date: `${today}T00:00:00.000Z`, slot: slots[i], status: statuses[i],
  visitType: i === 7 ? 'PROCEDURE' : 'OPD', tokenNumber: i + 1, roomId: i === 7 ? 'r2' : 'r1', room: rooms[i === 7 ? 1 : 0],
  patient: { id: `p${i}`, name, phone: '98480' + String(10000 + i) }, doctor, visit: null,
}));

function fixtureBody(pathname) {
  if (pathname === '/auth/me' || pathname.startsWith('/users/doc-1')) return doctor;
  if (pathname === '/users') return { users: [doctor], data: [doctor], total: 1 };
  if (pathname.includes('/schedule')) return { doctorId: doctor.id, doctorName: 'Praneeta Jain', date: today, appointments };
  if (pathname.includes('/rooms')) return { rooms, data: rooms };
  if (pathname.includes('google')) return { configured: false, connected: false };
  if (pathname.includes('available-slots')) return { slots: [] };
  if (pathname.includes('availability') || pathname.includes('working-hours')) return { workingHours: [], timeOff: [] };
  if (pathname === '/patients') return { patients: [], total: 0 };
  return [];
}

function measure() {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  return [...document.querySelectorAll('[data-appointment-block]')].map((block) => {
    const name = block.querySelector('[data-patient-name]');
    return {
      id: block.getAttribute('data-appointment-block'),
      block: rect(block),
      name: name.textContent,
      nameRect: rect(name),
      nameOverflows: name.scrollWidth > name.clientWidth,
      nameEllipsis: getComputedStyle(name).textOverflow === 'ellipsis',
      label: block.querySelector('button').getAttribute('aria-label'),
    };
  });
}

const EPS = 0.5;
const intersects = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > EPS && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > EPS;
const inside = (inner, outer) => inner.left >= outer.left - EPS && inner.right <= outer.right + EPS && inner.top >= outer.top - EPS && inner.bottom <= outer.bottom + EPS;

(async () => {
  const browser = await chromium.launch();
  const leaked = [];
  let failed = false;
  try {
    for (const [label, width, height] of [['desktop', 1440, 2400], ['phone', 390, 2600]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.context().addCookies([{ name: 'auth_token', value: 'synthetic', url: base }]);
      await page.route('**/api/**', (route) => {
        const pathname = new URL(route.request().url()).pathname.slice(4);
        if (route.request().method() !== 'GET') { leaked.push(`${route.request().method()} ${pathname}`); return route.abort('blockedbyclient'); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureBody(pathname)) });
      });
      await page.goto(`${base}/dashboard/appointments`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.waitForFunction((n) => document.querySelectorAll('[data-appointment-block]').length === n, appointments.length, { timeout: 60000 });
      const blocks = await page.evaluate(measure);

      const problems = [];
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          if (intersects(blocks[i].block, blocks[j].block)) problems.push(`blocks ${blocks[i].name} and ${blocks[j].name} intersect`);
        }
        const b = blocks[i];
        if (!inside(b.nameRect, b.block)) problems.push(`${b.name} spills outside its block`);
        if (b.nameOverflows && !b.nameEllipsis) problems.push(`${b.name} is clipped without an ellipsis`);
      }
      const sameSlot = blocks.filter((b) => ['Mohammed Irfan', 'Lakshmi Devi'].includes(b.name));
      if (sameSlot.length !== 2 || sameSlot[0].block.left === sameSlot[1].block.left) problems.push('the two 11:00 appointments are not side by side');
      if (!blocks.some((b) => b.label.includes('Suresh Babu') && b.label.endsWith('No-show'))) problems.push('no-show status missing from accessible name');
      for (const b of blocks) {
        const block = page.locator(`[data-appointment-block="${b.id}"]`);
        await block.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        const nameHitsOwnButton = await block.evaluate((el) => {
          const r = el.querySelector('[data-patient-name]').getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!hit && hit.closest('button') === el.querySelector('button');
        });
        if (!nameHitsOwnButton) problems.push(`tapping ${b.name} does not reach its own block`);
        const box = await block.locator('[data-patient-name]').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(300);
        const actions = await block.evaluate((el) => {
          const strip = el.querySelector('[data-appointment-actions]');
          if (!strip || getComputedStyle(strip).display === 'none') return null;
          const s = strip.getBoundingClientRect();
          const o = el.getBoundingClientRect();
          return { inside: s.left >= o.left - 0.5 && s.right <= o.right + 0.5, visible: getComputedStyle(strip).opacity === '1' && getComputedStyle(strip).pointerEvents !== 'none' };
        });
        if (actions && !actions.inside) problems.push(`${b.name}'s action buttons spill outside its block`);
        if (actions && !actions.visible) problems.push(`${b.name}'s action buttons stay hidden on hover`);
      }
      await page.mouse.move(0, 0);
      const keyboard = await page.evaluate(() => {
        const all = [...document.querySelectorAll('[data-appointment-block]')];
        const i = all.findIndex((el, k) => k + 1 < all.length && getComputedStyle(el.querySelector('[data-appointment-actions]')).display !== 'none');
        return i < 0 ? null : { current: all[i].getAttribute('data-appointment-block'), next: all[i + 1].getAttribute('data-appointment-block') };
      });
      if (keyboard) {
        const insideActions = (id) => page.evaluate((id) => !!document.activeElement?.closest(`[data-appointment-block="${id}"] [data-appointment-actions]`), id);
        await page.locator(`[data-appointment-block="${keyboard.current}"] > button`).focus();
        await page.keyboard.press('Tab');
        if (!(await insideActions(keyboard.current))) problems.push('Tab from a block does not reach its action buttons');
        await page.locator(`[data-appointment-block="${keyboard.next}"] > button`).focus();
        await page.keyboard.press('Shift+Tab');
        if (!(await insideActions(keyboard.current))) problems.push('Shift+Tab does not reach the previous block\'s action buttons');
      }

      const outcome = { label, blocks: blocks.length, ellipsized: blocks.filter((b) => b.nameOverflows).map((b) => b.name), pass: problems.length === 0, problems };
      console.log(JSON.stringify(outcome));
      failed ||= !outcome.pass;
      await page.close();
    }
    assert.deepEqual(leaked, [], 'No mutating API request may leave the synthetic fixture');
    assert.ok(!failed, 'Calendar day layout check failed');
    console.log('calendar day layout check passed');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
