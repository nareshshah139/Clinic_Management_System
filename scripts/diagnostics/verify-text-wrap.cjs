const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const baseUrl = process.env.WRAP_URL || 'http://127.0.0.1:3012';
const output = process.env.WRAP_OUTPUT || '/tmp/clinic-hover-evidence/after';
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
    if (location.search.includes('wrap-extreme=1')) appointments[0].notes = 'ProcedureReferenceWithoutWhitespace'.repeat(20);
    if (location.search.includes('wrap-clipped=1')) appointments[0].slot = '08:50-09:05';
    if (location.search.includes('wrap-short=1')) appointments[0].slot = '09:00-09:05';
    if (location.search.includes('wrap-edge=1')) appointments[0].slot = '17:45-18:00';
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
  return page.evaluate(() => {
    const labels = [...document.querySelectorAll('[data-appointment-id]')];
    if (!labels.length) throw new Error('Synthetic appointment did not render');
    const appointments = labels.map(label => {
      const box = label.getBoundingClientRect();
      const summary = label.querySelector('[data-appointment-summary]');
      const buttonBox = summary?.getBoundingClientRect();
      return {
        width: box.width, height: box.height,
        summaryContained: buttonBox ? buttonBox.left >= box.left - 1 && buttonBox.right <= box.right + 1 && buttonBox.top >= box.top - 1 && buttonBox.bottom <= box.bottom + 1 : false,
      };
    });
    const boxes = labels.map(label => label.getBoundingClientRect());
    const intersectingAppointments = boxes.some((a, i) => boxes.slice(i + 1).some(b => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1));
    return { intersectingAppointments, viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, mainOverflow: [...document.querySelectorAll('main')].some(e => e.scrollWidth > e.clientWidth + 1), appointments };
  });
}

async function settle(page, selector) {
  await page.$eval(selector, async element => {
    await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function verifyDialog(page) {
  await settle(page, '[role="dialog"]');
  const result = await page.$eval('[role="dialog"]', element => {
    const box = element.getBoundingClientRect();
    return {
      inViewport: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1,
      horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
      actionsFit: [...element.querySelectorAll('button')].every(button => {
        const action = button.getBoundingClientRect();
        return action.left >= box.left - 1 && action.right <= box.right + 1;
      }),
    };
  });
  assert.ok(result.inViewport && !result.horizontalOverflow && result.actionsFit, `Details containment: ${JSON.stringify(result)}`);
}

async function verifyPreview(page, scenario) {
  const trigger = '[data-appointment-summary]';
  const preview = '[data-appointment-preview]';
  const before = await measure(page);
  await page.hover(trigger);
  await page.waitForSelector(preview, { visible: true });
  await settle(page, preview);
  const details = await page.$eval(preview, element => {
    const box = element.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const rects = [];
    while (walker.nextNode()) {
      if (walker.currentNode.parentElement.closest('[role="tooltip"]')) continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      rects.push(...[...range.getClientRects()].filter(r => r.width && r.height));
    }
    if (!rects.length) throw new Error('Browser did not provide text-layout rectangles');
    return {
      text: element.textContent,
      inViewport: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1,
      horizontalTextOverflow: rects.some(r => r.left < box.left - 1 || r.right > box.right + 1),
      width: box.width, height: box.height,
      bounds: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
    };
  });
  assert.ok(details.text.includes(patientName), 'Hover reveals the full patient name');
  assert.ok(details.text.includes('Consultation and Diagnostic Procedures Room'), 'Hover reveals the full room');
  assert.ok(details.text.includes(scenario.extreme ? 'ProcedureReferenceWithoutWhitespace'.repeat(20) : 'Follow-up assessment and ultrasound-guided diagnostic procedure'), 'Hover reveals the full procedure');
  if (!details.inViewport || details.horizontalTextOverflow) await page.screenshot({ path: path.join(output, `failed-preview-${scenario.name}.png`) });
  assert.ok(details.inViewport && !details.horizontalTextOverflow, `Preview containment: ${JSON.stringify({ inViewport: details.inViewport, horizontalTextOverflow: details.horizontalTextOverflow, bounds: details.bounds })}`);
  assert.deepEqual((await measure(page)).appointments, before.appointments, 'Hover does not change appointment geometry');
  const previewBox = await (await page.$(preview)).boundingBox();
  await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2, { steps: 12 });
  await page.waitForSelector(preview, { visible: true });
  if (scenario.reduced) assert.equal(await page.$eval(preview, e => getComputedStyle(e).animationName), 'none', 'Reduced motion disables preview animation');
  await page.screenshot({ path: path.join(output, `preview-${scenario.name}.png`) });
  await page.keyboard.press('Escape');
  await page.waitForSelector(preview, { hidden: true });
  await page.mouse.move(0, 0);
  await page.focus(trigger);
  await page.waitForSelector(preview, { visible: true });
  await page.keyboard.press('Escape');
  await page.waitForSelector(preview, { hidden: true });
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]', { visible: true });
  await verifyDialog(page);
  const dialogText = await page.$eval('[role="dialog"]', e => e.textContent);
  assert.ok(dialogText.includes(patientName) && dialogText.includes('Consultation and Diagnostic Procedures Room'), 'Keyboard opens full appointment details');
  for (const action of ['Reschedule', 'Start Visit', 'Cancel Appointment']) assert.ok(dialogText.includes(action), `${action} remains available`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  assert.equal(await page.$eval(trigger, e => document.activeElement === e), true, 'Closing details returns focus to its appointment');
  return { width: details.width, height: details.height, keyboard: true, hover: true, escape: true };
}

async function verifyRescheduleFocus(page) {
  await page.click('[data-appointment-summary]');
  await page.waitForSelector('[role="dialog"]', { visible: true });
  await verifyDialog(page);
  for (const button of await page.$$('[role="dialog"] button')) {
    if ((await button.evaluate(e => e.textContent)).includes('Reschedule')) { await button.click(); break; }
  }
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await page.waitForFunction(() => document.activeElement?.textContent.includes('Rescheduling'));
  await page.mouse.move(0, 0);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.$eval('[data-appointment-summary]', e => document.activeElement === e), true, 'Keyboard returns to appointment after rescheduling');
  await page.waitForSelector('[data-appointment-preview]', { visible: true, timeout: 3000 });
  await settle(page, '[data-appointment-preview]');
  await page.screenshot({ path: path.join(output, 'reschedule-keyboard-preview.png') });
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-appointment-preview]', { hidden: true });
}

async function verifyControls(page) {
  return page.evaluate(() => {
    const text = 'Long clinical label with ConfirmationReferenceWithoutWhitespace';
    const sources = [
      ['button', [...document.querySelectorAll('[data-slot="button"]')].find(e => e.textContent.includes('Quick Guide'))],
      ['select', document.querySelector('[data-slot="select-trigger"]')],
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
    const scenarios = baseline ? [{ name: '1440', width: 1440 }, { name: '390', width: 390 }] : [
      { name: '1440', width: 1440 }, { name: '390', width: 390 }, { name: '320', width: 320 },
      { name: 'large-text', width: 390, scale: true }, { name: 'overlap', width: 390, overlap: true },
      { name: 'chain', width: 390, chain: true }, { name: 'extreme', width: 320, extreme: true },
      { name: 'edge', width: 1440, edge: true }, { name: 'short', width: 390, short: true, reduced: true }, { name: 'clipped', width: 390, clipped: true },
    ];
    for (const scenario of scenarios) {
      const { width, scale, overlap, chain, extreme, edge, short, reduced, clipped } = scenario;
      await page.setViewport({ width, height: 1000 });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
      const query = overlap ? '?wrap-overlap=1' : chain ? '?wrap-chain=1' : extreme ? '?wrap-extreme=1' : edge ? '?wrap-edge=1' : short ? '?wrap-short=1' : clipped ? '?wrap-clipped=1' : '';
      await page.goto(`${baseUrl}/dashboard/appointments${query}`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(name => document.body.textContent.includes(name), { timeout: 60000 }, patientName);
      if (scale) await page.evaluate(() => document.documentElement.style.setProperty('--app-text-increase', '0.5rem'));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.$eval('[data-appointment-id]', e => e.scrollIntoView({ block: 'center' }));
      const result = { ...scenario, ...await measure(page) };
      results.push(result);
      await page.screenshot({ path: path.join(output, `${baseline ? 'before' : 'compact'}-${scenario.name}.png`) });
      if (!baseline) {
        assert.ok(result.pageWidth <= width + 1 && !result.mainOverflow, `Page exceeds ${width}px viewport`);
        assert.equal(result.appointments.length, chain ? 3 : overlap ? 2 : 1, 'Expected appointment count');
        assert.equal(result.intersectingAppointments, false, 'Overlapping appointments have separate columns');
        result.appointments.forEach(appointment => assert.ok(appointment.summaryContained, `Appointment button escapes at ${width}px`));
        if (short || clipped) assert.ok(result.appointments[0].height >= 23, 'Five-minute appointment retains a usable target');
        result.preview = await verifyPreview(page, scenario);
        result.wrappingControls = await verifyControls(page);
        if (scenario.name === '1440') {
          await verifyRescheduleFocus(page);
          result.rescheduleKeyboard = true;
        }
      }
    }
    if (!baseline) {
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await page.goto(`${baseUrl}/dashboard/appointments`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-appointment-summary]');
      await page.$eval('[data-appointment-summary]', e => e.scrollIntoView({ block: 'center' }));
      await page.tap('[data-appointment-summary]');
      await page.waitForSelector('[role="dialog"]', { visible: true });
      await verifyDialog(page);
      await page.waitForSelector('[data-appointment-preview]', { hidden: true });
      assert.ok((await page.$eval('[role="dialog"]', e => e.textContent)).includes(patientName), 'Touch reveals full appointment details');
      await page.screenshot({ path: path.join(output, 'touch-details.png') });
      const reschedule = await page.$$('[role="dialog"] button');
      for (const button of reschedule) {
        if ((await button.evaluate(e => e.textContent)).includes('Reschedule')) { await button.tap(); break; }
      }
      await page.waitForFunction(() => document.body.textContent.includes('Rescheduling'));
      await page.waitForSelector('[role="dialog"]', { hidden: true });
      assert.equal(await page.$('[role="dialog"]'), null, 'Rescheduling returns to the calendar');
      results.push({ name: 'touch', details: true, reschedule: true });
    }

  } finally {
    await fs.writeFile(path.join(output, `${baseline ? 'before' : 'after'}.json`), JSON.stringify(results));
    console.log(JSON.stringify(results));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
