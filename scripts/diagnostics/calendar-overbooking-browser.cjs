// Usage: start the frontend (cd frontend && npx next dev -p 3000), then
//   NODE_PATH=$(npm root -g) node scripts/diagnostics/calendar-overbooking-browser.cjs
// Set CALENDAR_SCREENSHOT_DIR to keep a screenshot per doctor.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.CALENDAR_UI_URL || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Calendar check must target a loopback app');

/**
 * @cc [owner:nareshshah139,label:verification] isolated-calendar-overbooking-fixture
 * The check MUST answer every API request with synthetic data and MUST NOT reach clinic records.
 */
const tomorrow = new Date(Date.now() + 5.5 * 3600e3 + 86400e3).toISOString().slice(0, 10);
const doctors = [
  { id: 'doc-overbook', firstName: 'Overbook', lastName: 'Two', role: 'DOCTOR', branchId: 'b', isActive: true, maxBookingsPerSlot: 2 },
  { id: 'doc-single', firstName: 'Single', lastName: 'One', role: 'DOCTOR', branchId: 'b', isActive: true, maxBookingsPerSlot: 1 },
];
const booking = (doctor) => ({
  id: `apt-${doctor.id}`, doctorId: doctor.id, patientId: 'p1', date: `${tomorrow}T00:00:00.000Z`, slot: '11:00-11:30', status: 'SCHEDULED',
  visitType: 'OPD', tokenNumber: 1, room: null, patient: { id: 'p1', name: 'Ravi Kumar', phone: '9848010000' }, doctor, visit: null,
});

function fixtureBody(pathname, date) {
  const doctor = doctors.find((d) => pathname.includes(d.id));
  if (pathname === '/auth/me') return doctors[0];
  if (pathname === '/users') return { users: doctors, data: doctors, total: 2 };
  if (pathname.startsWith('/users/') && doctor) return doctor;
  if (pathname.includes('/schedule') && doctor) return { doctorId: doctor.id, date, appointments: date === tomorrow ? [booking(doctor)] : [] };
  if (pathname.startsWith('/doctor-availability/') && pathname.endsWith('/day') && doctor) {
    return { date: tomorrow, weekday: 1, source: 'configured', working: [{ start: 540, end: 1080 }], intervals: [{ start: 540, end: 1080 }], blocked: [], maxBookingsPerSlot: doctor.maxBookingsPerSlot };
  }
  if (pathname.includes('/rooms')) return { rooms: [], data: [] };
  if (pathname.includes('google')) return { configured: false, connected: false };
  if (pathname.includes('available-slots')) return { slots: [] };
  if (pathname === '/patients') return { patients: [], total: 0 };
  return [];
}

(async () => {
  const browser = await chromium.launch();
  const leaked = [];
  const outcomes = [];
  try {
    for (const doctor of doctors) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 2400 } });
      await page.context().addCookies([{ name: 'auth_token', value: 'synthetic', url: base }]);
      await page.addInitScript((id) => localStorage.setItem('appointments.doctorId', id), doctor.id);
      await page.route('**/api/**', (route) => {
        const url = new URL(route.request().url());
        const pathname = url.pathname.slice(4);
        if (route.request().method() !== 'GET') { leaked.push(`${route.request().method()} ${pathname}`); return route.abort('blockedbyclient'); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureBody(pathname, url.searchParams.get('date'))) });
      });
      await page.goto(`${base}/dashboard/appointments`, { waitUntil: 'networkidle', timeout: 120000 });
      const block = page.locator(`[data-appointment-block="apt-${doctor.id}"]`);
      // The booking exists only on tomorrow's schedule; refill until the hydrated page has taken the date.
      for (let attempt = 0; attempt < 20 && !(await block.count()); attempt++) {
        await page.locator('[data-tour="date-picker"] input[type="date"]').fill(tomorrow);
        await page.waitForTimeout(500);
      }
      await block.waitFor({ timeout: 60000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      const tile = page.getByRole('button', { name: /^Book 11:00-11:30/ });
      const tileCount = await tile.count();
      const facts = {
        doctor: doctor.id,
        limit: doctor.maxBookingsPerSlot,
        bookableTiles: tileCount,
        tileName: tileCount ? await tile.getAttribute('aria-label') : null,
        marker: tileCount ? (await tile.innerText()).trim() : null,
        blockWidthShare: await block.evaluate((el) => +(el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width).toFixed(2)),
        freePartReachesTile: tileCount ? await tile.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.right - 8, r.top + r.height / 2);
          return !!hit && (hit === el || el.contains(hit));
        }) : null,
      };
      if (process.env.CALENDAR_SCREENSHOT_DIR) {
        await block.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(process.env.CALENDAR_SCREENSHOT_DIR, `overbooking-${doctor.id}.png`), clip: await block.evaluate((el) => {
          const r = el.parentElement.getBoundingClientRect();
          const b = el.getBoundingClientRect();
          return { x: r.left, y: b.top - 80 + window.scrollY, width: r.width, height: b.height + 160 };
        }) });
      }
      outcomes.push(facts);
      console.log(JSON.stringify(facts));
      await page.close();
    }
    const [two, one] = outcomes;
    assert.deepEqual([two.bookableTiles, two.tileName, two.marker, two.blockWidthShare, two.freePartReachesTile],
      [1, 'Book 11:00-11:30, 1 of 2 booked', 'Overbook 1/2', 0.5, true], 'A limit-2 doctor keeps the 11:00 tile bookable as 1/2');
    assert.deepEqual([one.bookableTiles, one.blockWidthShare], [0, 1], 'A limit-1 doctor shows the 11:00 tile occupied');
    assert.deepEqual(leaked, [], 'No mutating API request may leave the synthetic fixture');
    console.log('calendar overbooking check passed');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
