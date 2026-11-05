const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const baseUrl = process.env.WRAP_URL || 'http://127.0.0.1:3012';
const output = process.env.WRAP_OUTPUT || '/tmp/clinic-wrap-evidence';
const baseline = process.argv.includes('--baseline');
const patientName = 'Annapoorna Venkatasubramanian Chandrasekharan';

/**
 * @cc [owner:nareshshah139,label:verification] isolated-wrap-fixtures
 * Browser checks MUST use synthetic clinic responses and reject all API writes.
 */
async function prepare(page) {
  await page.browserContext().setCookie({ name: 'auth_token', value: 'wrap-fixture', url: baseUrl, httpOnly: true });
  await page.evaluateOnNewDocument((name) => {
    localStorage.setItem('appointments.date', '2030-11-05');
    localStorage.setItem('appointments.doctorId', 'wrap-doctor');
    const nativeFetch = window.fetch.bind(window);
    const user = { id: 'wrap-doctor', firstName: 'Lakshminarayanan', lastName: 'Venkatasubramanian' , role: 'DOCTOR', status: 'ACTIVE', isActive: true };
    const patient = { id: 'wrap-patient', name, gender: 'FEMALE', age: 42, phone: '9999999999' };
    const room = { id: 'wrap-room', name: 'Consultation and Diagnostic Procedures Room', type: 'PROCEDURE', isActive: true };
    const appointments = [{ id: 'wrap-appointment', patient, doctor: user, doctorId: user.id, date: '2030-11-05', slot: '09:00-09:15', status: 'CONFIRMED', visitType: 'PROCEDURE', room, notes: 'Follow-up assessment and ultrasound-guided diagnostic procedure' }];
    if (location.search.includes('wrap-overlap=1')) appointments.push({ ...appointments[0], id: 'wrap-appointment-2', patient: { ...patient, name: 'Second patient with a long family name' } });
    if (location.search.includes('wrap-chain=1')) {
      appointments[0].slot = '09:00-09:30';
      appointments.push({ ...appointments[0], id: 'wrap-appointment-2', slot: '09:15-09:45' }, { ...appointments[0], id: 'wrap-appointment-3', slot: '09:30-10:00' });
    }
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
      const method = init?.method || (typeof input === 'string' ? 'GET' : input.method);
      if (method !== 'GET') return new Response('{}', { status: 409 });
      const endpoint = url.pathname.slice(4);
      let body = [];
      if (endpoint === '/auth/me' || endpoint === '/users/wrap-doctor') body = user;
      else if (endpoint === '/users') body = { users: [user] };
      else if (endpoint === '/appointments/rooms') body = { rooms: [room] };
      else if (endpoint.endsWith('/schedule') || endpoint === '/appointments') body = { appointments, doctorId: user.id, date: '2030-11-05' };
      else if (endpoint === '/patients/wrap-patient') body = patient;
      else if (endpoint.includes('visit-history')) body = { visits: [] };
      else if (endpoint.includes('google')) body = { connected: false };
      else if (endpoint === '/patients') body = { patients: [patient], total: 1 };
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    };
  }, patientName);
}

async function measure(page) {
  return page.evaluate(name => {
    const labels = [...document.querySelectorAll('[data-appointment-id]')];
    if (!labels.length) {
      const text = [...document.querySelectorAll('span')].find(e => e.textContent.includes(name) && ![...e.children].some(c => c.textContent.includes(name)));
      if (text?.closest('.absolute.group')) labels.push(text.closest('.absolute.group'));
    }
    if (!labels.length) throw new Error('Synthetic appointment did not render');
    const appointments = labels.map(label => {
      const box = label.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(label);
      const rects = [...range.getClientRects()].filter(r => r.width && r.height);
      if (!rects.length) throw new Error('Browser did not provide text-layout rectangles');
      return { width: box.width, height: box.height, overflowingRects: rects.filter(r => r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1).length };
    });
    const boxes = labels.map(label => label.getBoundingClientRect());
    const intersectingAppointments = boxes.some((a, i) => boxes.slice(i + 1).some(b => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1));
    return { intersectingAppointments, viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, mainOverflow: [...document.querySelectorAll('main')].some(e => e.scrollWidth > e.clientWidth + 1), appointments };

  }, patientName);
}

async function verifyControls(page) {
  return page.evaluate(() => {
    const text = 'Long clinical label with ConfirmationReferenceWithoutWhitespace';
    const sources = [
      ['button', [...document.querySelectorAll('[data-slot="button"]')].find(e => e.textContent.includes('Quick Guide'))],
      ['select', document.querySelector('[data-slot="select-trigger"]')],
      ['badge', document.querySelector('[data-slot="badge"]')],
      ['heading', document.querySelector('h1')?.parentElement?.parentElement],
    ];
    return sources.map(([name, source]) => {
      if (!source) throw new Error(`Missing real ${name} component for label probe`);
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;top:60px;left:10px;width:160px;z-index:9999;background:white';
      const control = source.cloneNode(true);
      const target = name === 'select' ? control.querySelector('[data-slot="select-value"]') : name === 'heading' ? control.querySelector('h1') : control;
      target.textContent = text;
      host.append(control);
      document.body.append(host);
      const box = control.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(target);
      const rects = [...range.getClientRects()].filter(r => r.width && r.height);
      const fits = rects.length > 1 && rects.every(r => r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1) && box.width <= 161;
      host.remove();
      if (!fits) throw new Error(`${name} label did not wrap inside 160px`);
      return name;
    });
  });
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = process.env.WRAP_BROWSER === 'chrome'
    ? await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run', '--no-default-browser-check'] })
    : await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333' });
  const page = await browser.newPage();
  const results = [];
  try {
    await prepare(page);
    const scenarios = baseline ? [{ width: 1440 }, { width: 390 }] : [{ width: 1440 }, { width: 390 }, { width: 320 }, { width: 390, scale: true }, { width: 390, overlap: true }, { width: 390, chain: true }];
    for (const scenario of scenarios) {
      const { width, scale, overlap, chain } = scenario;
      await page.setViewport({ width, height: 1000 });
      await page.goto(`${baseUrl}/dashboard/appointments${overlap ? '?wrap-overlap=1' : chain ? '?wrap-chain=1' : ''}`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(name => document.body.textContent.includes(name), { timeout: 60000 }, patientName);
      if (scale) await page.evaluate(() => document.documentElement.style.setProperty('--app-text-increase', '0.5rem'));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (!baseline) await page.waitForFunction(() => [...document.querySelectorAll('[data-appointment-content]')].every(e => e.scrollHeight <= e.parentElement.getBoundingClientRect().height + 1), { timeout: 5000 });
      const result = { ...scenario, ...await measure(page) };
      results.push(result);
      await page.evaluate(name => [...document.querySelectorAll('span')].find(e => e.textContent.includes(name))?.scrollIntoView({ block: 'center' }), patientName);
      await page.screenshot({ path: path.join(output, `${baseline ? 'before' : 'after'}-${width}${scale ? '-large-text' : ''}${overlap ? '-overlap' : chain ? '-chain' : ''}.png`) });
      if (!baseline) {
        assert.ok(result.pageWidth <= width + 1 && !result.mainOverflow, `Page exceeds ${width}px viewport`);
        assert.equal(result.appointments.length, chain ? 3 : overlap ? 2 : 1, 'Expected appointment count');
        assert.equal(result.intersectingAppointments, false, 'Overlapping appointments have separate columns');
        result.appointments.forEach(appointment => assert.equal(appointment.overflowingRects, 0, `Appointment text escapes at ${width}px`));
        await page.click('[title="View Appointment Details"]');
        await page.waitForSelector('[role="dialog"]');
        const dialogText = await page.$eval('[role="dialog"]', e => e.textContent);
        assert.ok(dialogText.includes(patientName), 'Appointment details remain reachable');
        result.wrappingControls = await verifyControls(page);
      }
    }

  } finally {
    await fs.writeFile(path.join(output, `${baseline ? 'before' : 'after'}.json`), JSON.stringify(results));
    console.log(JSON.stringify(results));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
