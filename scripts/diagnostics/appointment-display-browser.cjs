const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const baseUrl = process.env.APPOINTMENT_UI_URL || 'http://127.0.0.1:3140';
const browserEndpoint = process.env.APPOINTMENT_BROWSER_WS || 'ws://127.0.0.1:9234/devtools/browser';
const escapedApiRequests = [];
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname));

/**
 * @cc [owner:nareshshah139,label:verification] isolated-appointment-fixtures
 * Browser checks MUST replace every API response with synthetic data and reject mutations.
 * They MUST NOT read or write clinic records.
 */
async function openFixture(browser, instant, role = 'DOCTOR', fallbackNames = false) {
  const page = await browser.newPage();
  page.on('pageerror', error => console.error('Browser error:', error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      escapedApiRequests.push(new URL(request.url()).pathname);
      void request.abort('blockedbyclient');
    } else { void request.continue(); }
  });
  await page.setCookie({ name: 'auth_token', value: 'synthetic-appointment-check', url: baseUrl, httpOnly: true });
  await page.evaluateOnNewDocument((now, userRole, useFallbackNames) => {
    const NativeDate = Date;
    window.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return new NativeDate(now).getTime(); }
    };
    const clinicDay = new NativeDate(new NativeDate(now).getTime() + 330 * 60000).toISOString().slice(0, 10);
    const user = { id: 'fixture-doctor', firstName: 'Test', lastName: 'Doctor', role: userRole, branchId: 'fixture-branch', isActive: true, status: 'ACTIVE' };
    const doctor = { ...user, role: 'DOCTOR' };
    const appointments = Array.from({ length: 6 }, (_, i) => ({
      id: `appointment-${i + 1}`, patientId: `patient-${i + 1}`, doctorId: doctor.id,
      patient: { id: `patient-${i + 1}`, name: `Synthetic Patient ${i + 1}`, phone: '0000000000' },
      date: `${clinicDay}T00:00:00.000Z`, slot: `${10 + i}:30-${11 + i}:00`,
      status: 'CONFIRMED', visitType: 'OPD', branchId: user.branchId,
    }));
    if (useFallbackNames) {
      appointments[0].patient.firstName = 'Ignored';
      appointments[0].patient.lastName = 'Legacy';
      appointments[1].patient = { id: 'patient-2', firstName: 'Legacy', lastName: 'Patient' };
      appointments[2].patient = null;
      appointments[3].patient = { id: 'patient-4' };
    }
    window.__appointmentRequests = [];
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
      const method = init?.method || input.method || 'GET';
      if (method !== 'GET') throw new Error('Fixture blocks API mutations');
      const endpoint = url.pathname.slice(4);
      window.__appointmentRequests.push(`${endpoint}${url.search}`);
      const selected = url.searchParams.get('date') === clinicDay ? appointments : [];
      let body = [];
      if (endpoint === '/auth/me' || endpoint === `/users/${user.id}`) body = user;
      else if (endpoint === '/users') body = { users: [doctor], total: 1 };
      else if (endpoint === '/auth/statistics') body = { users: { total: 1 }, patients: { total: 6 }, appointments: { total: 6 }, system: { status: 'healthy', version: 'test', uptime: 1 } };
      else if (endpoint === '/reports/alerts') body = { lowStockAlerts: [], expiryAlerts: [], pendingPayments: [] };
      else if (endpoint === '/pharmacy/reports/daily-collection') body = { wholeDay: null, collection: { expectedTotal: 0, modes: [] } };
      else if (endpoint === '/appointments') body = { appointments: selected.slice(0, Number(url.searchParams.get('limit') || 6)), total: selected.length };
      else if (endpoint === `/appointments/doctor/${doctor.id}/schedule`) body = { doctorId: doctor.id, doctorName: 'Test Doctor', date: clinicDay, appointments: selected };
      else if (endpoint === '/appointments/rooms' || endpoint === '/appointments/rooms/all') body = { rooms: [] };
      else if (endpoint === '/google-calendar/configured') body = { configured: false };
      else if (endpoint.startsWith('/google-calendar/status')) body = { connected: false };
      else if (/^\/patients\/patient-\d+$/.test(endpoint)) body = appointments.find(a => endpoint.endsWith(a.patientId)).patient;
      else if (endpoint.includes('visit-history')) body = { data: [], total: 0, totalPages: 1 };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    };
  }, instant, role, fallbackNames);
  return page;
}

/**
 * @cc [owner:nareshshah139,label:verification] appointment-screen-results
 * The check MUST fail unless the rendered dashboard shows API patient names and booked slots,
 * both dashboard roles request the IST day, and the matching calendar renders all six fixtures.
 */
async function run() {
  const useChrome = process.env.APPOINTMENT_BROWSER !== 'obscura';
  const browser = useChrome
    ? await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
    : await puppeteer.connect({ browserWSEndpoint: browserEndpoint });
  const results = [];
  try {
    for (const [label, instant, role, fallbackNames, expectedDay] of [
      ['daytime-doctor', '2026-11-05T08:00:00.000Z', 'DOCTOR', false, '2026-11-05'],
      ['early-IST-doctor', '2026-11-05T20:00:00.000Z', 'DOCTOR', false, '2026-11-06'],
      ['early-IST-admin', '2026-11-05T20:00:00.000Z', 'ADMIN', false, '2026-11-06'],
      ['fallback-names', '2026-11-05T08:00:00.000Z', 'DOCTOR', true, '2026-11-05'],
    ]) {
      const page = await openFixture(browser, instant, role, fallbackNames);
      try {
        await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('[data-tour="appointments-list"]', { timeout: 15000 }).catch(async error => {
          console.log(JSON.stringify(await page.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0, 1000), requests: window.__appointmentRequests }))));
          throw error;
        });
        const result = await page.evaluate(() => ({
          text: document.querySelector('[data-tour="appointments-list"]').innerText,
          names: [...document.querySelectorAll('[data-tour="appointments-list"] [data-patient-name]')].map(element => element.innerText.trim()),
          times: [...document.querySelectorAll('[data-tour="appointments-list"] [data-appointment-time]')].map(element => element.innerText),
          requests: window.__appointmentRequests.filter(url => url.startsWith('/appointments')),
        }));
        const expectedNames = fallbackNames
          ? ['Synthetic Patient 1', 'Legacy Patient', 'Unknown Patient', 'Patient nt-4', 'Synthetic Patient 5', 'Synthetic Patient 6']
          : Array.from({ length: role === 'ADMIN' ? 5 : 6 }, (_, i) => `Synthetic Patient ${i + 1}`);
        const expectedSlots = expectedNames.map((_, i) => `${10 + i}:30-${11 + i}:00`);
        const hasName = JSON.stringify(result.names) === JSON.stringify(expectedNames);
        const hasSlot = JSON.stringify(result.times) === JSON.stringify(expectedSlots);
        const falseClock = result.times.some((time, i) => time !== `${10 + i}:30-${11 + i}:00`);
        const correctDay = result.requests.some(url => url.includes(`date=${expectedDay}`));
        const outcome = { label, pass: hasName && hasSlot && !falseClock && correctDay, hasName, hasSlot, falseClock, correctDay };
        results.push(outcome);
        console.log(JSON.stringify(outcome));
      } finally { await page.close(); }
    }
    const page = await openFixture(browser, '2026-11-05T20:00:00.000Z');
    try {
      await page.goto(`${baseUrl}/dashboard/appointments`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => document.querySelectorAll('button[title="View Appointment Details"]').length === 6, { timeout: 15000 }).catch(async error => {
        console.log(JSON.stringify(await page.evaluate(() => ({ text: document.body.innerText.slice(-3500), requests: window.__appointmentRequests }))));
        throw error;
      });
      const calendar = await page.evaluate(() => ({
        entries: [...document.querySelectorAll('button[title="View Appointment Details"]')].map(button => {
          const block = button.closest('[data-appointment-block]');
          return { slot: block?.querySelector('[data-appointment-time]')?.textContent.trim(), name: block?.querySelector('[data-patient-name]')?.textContent.trim() };
        }),
        requestedDay: window.__appointmentRequests.includes('/appointments/doctor/fixture-doctor/schedule?date=2026-11-06'),
      }));
      const expectedEntries = Array.from({ length: 6 }, (_, i) => ({ slot: `${10 + i}:30-${11 + i}:00`, name: `Synthetic Patient ${i + 1}` }));
      const outcome = { label: 'matching-doctor-calendar', pass: calendar.requestedDay && JSON.stringify(calendar.entries) === JSON.stringify(expectedEntries), visiblePatients: calendar.entries.length };
      results.push(outcome);
      console.log(JSON.stringify(outcome));
    } finally { await page.close(); }
    assert.deepEqual(escapedApiRequests, [], 'No API request may leave the synthetic fixture');
    assert.ok(results.every(result => result.pass), 'Appointment screen regression checks failed');
  } finally { if (useChrome) await browser.close(); else await browser.disconnect(); }
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
