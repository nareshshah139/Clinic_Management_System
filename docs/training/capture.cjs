// Drives the running app through every workflow in the training guide, asserts the behaviour the guide
// teaches, and writes annotated-screenshot data to img/ and manifest.json.
// Usage: node docs/training/capture.cjs [partA|partB|partC ...]   (default: all parts, in order)
// Needs the app on :3000 and the API on :4000 with the seed users (password123).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const API = process.env.API || 'http://localhost:4000';
const WEB = process.env.WEB || 'http://localhost:3000';
const OUT = __dirname;
const IMG = path.join(OUT, 'img');
const MANIFEST = path.join(OUT, 'manifest.json');
const VIEW = { width: 1440, height: 900 };
// The app decides "today" and "past slot" from the browser clock in IST, so each browser is pinned to a
// moment on one clinic day. Data is real; only the browser's clock is set.
const TODAY = process.env.CLINIC_DAY || '2026-11-09';
const RECEPTION_CLOCK = `${TODAY}T09:20:00+05:30`;
const DOCTOR_CLOCK = `${TODAY}T10:35:00+05:30`;
const FOLLOW_UP = process.env.FOLLOW_UP || '2026-12-07';
const SLOT_RETURNING = '10:30';
const SLOT_NEW = '15:00';
const SLOT_FOLLOW_UP = '10:30';
const BACKGROUND = [
  { phone: null, name: 'Priya Sharma', slot: '09:00-09:30' },
  { phone: null, name: 'Arjun Reddy', slot: '09:30-10:00' },
  { phone: null, name: 'Vikram Singh', slot: '12:00-12:30' },
  { phone: null, name: 'Ananya Gupta', slot: '14:00-14:30' },
  { phone: null, name: 'Rohit Agarwal', slot: '18:30-19:00' },
];
const HIDE_DEV = 'nextjs-portal,[data-nextjs-toast],[data-nextjs-dialog-overlay]{display:none!important}';

const RETURNING = { name: 'Meghana Reddy', gender: 'F', age: 34, phone: '9849012345', city: 'Hyderabad', address: 'Road No. 12, Banjara Hills' };
const WALK_IN = { first: 'Syed', last: 'Arif', phone: '97012' + String(Date.now()).slice(-5) };

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { shots: {}, checks: {}, data: {} };
const checks = [];
function check(ok, msg) {
  checks.push({ ok: !!ok, msg });
  console.log(ok ? 'PASS' : 'FAIL', msg);
  if (!ok) process.exitCode = 1;
}

async function call(method, p, token, body) {
  const r = await fetch(API + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${t.slice(0, 300)}`);
  return j;
}

const tokens = {};
async function token(email) {
  if (tokens[email]) return tokens[email];
  for (let i = 0; i < 12; i++) {
    try { return (tokens[email] = (await call('POST', '/auth/login', null, { email, password: 'password123' })).access_token); }
    catch (e) { if (!/429/.test(e.message)) throw e; await new Promise(r => setTimeout(r, 12000)); }
  }
  throw new Error('login throttled for ' + email);
}

const list = (r) => (Array.isArray(r) ? r : r.data || r.appointments || r.patients || r.users || r.visits || []);

async function open(browser, email, clock) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  if (clock) await ctx.clock.setFixedTime(new Date(clock));
  await ctx.addCookies([{ name: 'auth_token', value: await token(email), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript((css) => {
    document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); });
  }, HIDE_DEV);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  return page;
}

async function boxOf(loc) {
  const b = await loc.first().boundingBox();
  if (!b) throw new Error('no bounding box for ' + loc);
  return b;
}

async function bring(page, loc, top = 200) {
  await loc.first().waitFor({ state: 'visible', timeout: 15000 });
  const b = await boxOf(loc);
  await page.evaluate((dy) => { const m = document.querySelector('main'); if (m) m.scrollTop += dy; else window.scrollBy(0, dy); }, b.y - top);
  await page.waitForTimeout(400);
}

async function shot(page, id, { clip, around, pad = {}, callouts = [], caption, keepMouse } = {}) {
  let c = clip;
  if (!c && around) {
    const bs = await Promise.all(around.map(boxOf));
    const x0 = Math.min(...bs.map(b => b.x)) - (pad.l ?? 24);
    const y0 = Math.min(...bs.map(b => b.y)) - (pad.t ?? 24);
    const x1 = Math.max(...bs.map(b => b.x + b.width)) + (pad.r ?? 24);
    const y1 = Math.max(...bs.map(b => b.y + b.height)) + (pad.b ?? 24);
    c = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  c = c || { x: 0, y: 0, ...VIEW };
  const x = Math.max(0, Math.round(c.x)), y = Math.max(0, Math.round(c.y));
  c = { x, y, width: Math.round(Math.min(VIEW.width - x, c.width - (x - c.x))), height: Math.round(Math.min(VIEW.height - y, c.height - (y - c.y))) };
  const marks = [];
  for (const co of callouts) {
    const b = co.box || await boxOf(co.loc);
    const p = co.pad ?? 2;
    marks.push({ n: co.n, x: b.x - c.x - p, y: b.y - c.y - p, w: b.width + 2 * p, h: b.height + 2 * p, badge: co.badge || 'left' });
  }
  if (!keepMouse) await page.mouse.move(VIEW.width - 2, VIEW.height / 2);
  if (!keepMouse) await page.waitForTimeout(250);
  const file = `${id}.png`;
  await page.screenshot({ path: path.join(IMG, file), clip: c });
  manifest.shots[id] = { file, w: c.width, h: c.height, callouts: marks, caption: caption || '' };
  console.log('SHOT', id, `${c.width}x${c.height}`, marks.length, 'callouts');
}

async function clickCenter(page, loc) {
  const b = await boxOf(loc);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

async function rowBox(page, loc, minHeight = 0) {
  const b = await boxOf(loc);
  const grid = await page.locator('[title^="Book "], [title^="Long press"]').first().boundingBox();
  const h = Math.max(b.height + 16, minHeight);
  return { x: grid.x, y: b.y + b.height / 2 - h / 2, width: grid.width, height: h };
}

async function setDoctorAndDate(page, date) {
  const doctor = page.getByRole('combobox').first();
  if (!/Shravya/.test(await doctor.innerText())) {
    await doctor.click();
    await page.getByRole('option', { name: /Shravya/ }).click();
    await page.waitForTimeout(1500);
  }
  await page.locator('input[type=date]').first().fill(date);
  await page.waitForTimeout(2500);
}

async function findPatientByPhone(t, phone) {
  const r = await call('GET', `/patients?search=${phone}&limit=20`, t);
  return list(r).find(p => p.phone === phone);
}

async function cancelAppointments(t, patientId, dates) {
  const appts = list(await call('GET', `/appointments?patientId=${patientId}&limit=100`, t));
  for (const a of appts) {
    if (!dates.some(d => a.date?.startsWith(d)) || a.status === 'CANCELLED') continue;
    await call('DELETE', `/appointments/${a.id}`, t).catch(() => call('PATCH', `/appointments/${a.id}`, t, { status: 'CANCELLED' }));
  }
}

function longDate(iso) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

async function seed(reset) {
  const t = await token('admin@clinic.test');
  let p = await findPatientByPhone(t, RETURNING.phone);
  if (!p) p = await call('POST', '/patients', t, RETURNING);
  if (reset) await cancelAppointments(t, p.id, [TODAY, FOLLOW_UP]);
  const doctors = list(await call('GET', '/users?role=DOCTOR&limit=50', t));
  const shravya = doctors.find(u => u.email === 'shravya@clinic.test');
  const dayAppts = list(await call('GET', `/appointments?date=${TODAY}&limit=100`, t));
  for (const a of reset ? dayAppts.filter(a => a.patient?.name === `${WALK_IN.first} ${WALK_IN.last}` && a.status !== 'CANCELLED') : []) {
    await call('DELETE', `/appointments/${a.id}`, t).catch(() => call('PATCH', `/appointments/${a.id}`, t, { status: 'CANCELLED' }));
  }
  for (const b of BACKGROUND) {
    if (dayAppts.some(a => a.patient?.name === b.name && a.status !== 'CANCELLED')) continue;
    const bp = list(await call('GET', `/patients?search=${encodeURIComponent(b.name)}&limit=5`, t)).find(x => x.name === b.name);
    if (!bp) throw new Error('seed patient missing: ' + b.name);
    await call('POST', '/appointments', t, { doctorId: shravya.id, patientId: bp.id, date: TODAY, slot: b.slot, visitType: 'OPD' });
  }
  Object.assign(manifest.data, {
    today: TODAY, followUp: FOLLOW_UP, slotReturning: SLOT_RETURNING, slotNew: SLOT_NEW, slotFollowUp: SLOT_FOLLOW_UP,
    todayLabel: longDate(TODAY), followUpLabel: longDate(FOLLOW_UP),
    returningName: RETURNING.name, returningPhone: RETURNING.phone, returningId: p.id,
    walkInName: `${WALK_IN.first} ${WALK_IN.last}`, walkInPhone: WALK_IN.phone, doctorId: shravya.id,
  });
  return { t, patient: p, doctorId: shravya.id };
}

async function partA(browser) {
  const page = await open(browser, 'reception@clinic.test', RECEPTION_CLOCK);
  await page.goto(`${WEB}/dashboard/appointments`);
  await page.waitForTimeout(4000);
  check(await page.getByRole('tab', { name: /^Slots$/ }).count() === 0, 'A: there is no Slots tab, only the one calendar');
  await setDoctorAndDate(page, TODAY);
  await page.locator('input[type=date]').first().evaluate(e => e.blur());
  await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
  await page.waitForTimeout(400);
  await shot(page, 'a1-filters', {
    clip: { x: 256, y: 76, width: 1160, height: 220 },
    callouts: [{ n: 1, loc: page.getByRole('combobox').first() }, { n: 2, loc: page.locator('input[type=date]').first() }],
  });

  const badge = page.getByText(/outside working hours/).first();
  check(await badge.count() > 0, `A: the ${TODAY} grid shows an "outside working hours" badge`);
  manifest.data.outsideBadge = (await badge.innerText().catch(() => '')).trim();
  const lateRow = page.getByText(/^18:00$/).first();
  check(await lateRow.count() > 0, 'A: the grid has an 18:00 row for the evening booking');
  const lateAppt = page.getByText(/^18:30-19:00$/).first();
  check(await lateAppt.count() > 0, 'A: the 18:30-19:00 evening booking is drawn on the grid');
  await bring(page, page.getByText(/^16:00$/).first(), 330);
  const lb = await boxOf(lateAppt);
  await shot(page, 'a1-evening', {
    clip: { x: 300, y: 300, width: 1100, height: lb.y + 60 - 300 },
    callouts: [{ n: 4, box: await rowBox(page, lateAppt) }, { n: 5, box: await page.evaluate(() => [...document.querySelectorAll('main [style*="repeating-linear-gradient"]')].map(e => e.getBoundingClientRect().toJSON()).find(r => r.height > 0)) }],
  });
  await bring(page, badge, 240);
  await shot(page, 'a1-badge', { clip: { x: 300, y: 150, width: 1100, height: 330 }, callouts: [{ n: 3, loc: badge }] });

  const tile = page.locator(`[title^="Book ${SLOT_RETURNING}"]`).first();
  check(await tile.count() > 0, `A: the ${SLOT_RETURNING} slot is free`);
  await bring(page, tile, 420);
  await tile.hover({ force: true });
  await page.waitForTimeout(500);
  const tb = await boxOf(tile);
  await shot(page, 'a2-free-slot', { clip: { x: 300, y: tb.y - 190, width: 1100, height: 330 }, callouts: [{ n: 1, loc: tile, pad: 2 }], keepMouse: true });
  await clickCenter(page, tile);
  const dialog = page.getByRole('dialog', { name: 'Book Appointment' });
  await dialog.waitFor();
  await page.waitForTimeout(800);
  const search = dialog.getByPlaceholder('Search patient by name or phone');
  check(await search.evaluate(el => el === document.activeElement), 'A: the patient search inside the booking dialog has focus when it opens');
  await search.pressSequentially('Meghana', { delay: 60 });
  await page.waitForTimeout(1600);
  const option = dialog.getByRole('option', { name: new RegExp(RETURNING.name) }).first();
  check(await option.count() > 0, `A: typing "Meghana" lists ${RETURNING.name}`);
  await shot(page, 'a2-search', { around: [dialog], pad: { l: 0, t: 0, r: 0, b: 0 }, callouts: [{ n: 2, loc: search }, { n: 3, loc: option }] });
  await option.click();
  await page.waitForTimeout(900);
  const confirm = dialog.getByRole('button', { name: 'Confirm Booking' });
  const cb = await boxOf(confirm);
  check(cb.y + cb.height <= VIEW.height, `A: Confirm Booking is visible without scrolling (bottom ${Math.round(cb.y + cb.height)}px <= ${VIEW.height}px)`);
  await shot(page, 'a2-confirm', { around: [dialog], pad: { l: 0, t: 0, r: 0, b: 0 }, callouts: [{ n: 4, loc: confirm, badge: 'top' }] });
  await confirm.click();
  await page.waitForTimeout(2500);
  const banner = page.getByRole('status').filter({ hasText: RETURNING.name });
  check(await banner.count() > 0, 'A: the success banner names the patient');
  const booked = page.getByText(new RegExp(`^${SLOT_RETURNING}-\\d\\d:\\d\\d$`)).first();
  await bring(page, banner, 110);
  const bk = await rowBox(page, booked);
  await shot(page, 'a2-booked', { clip: { x: 300, y: 90, width: 1100, height: bk.y + bk.height + 70 - 90 }, callouts: [{ n: 5, loc: banner }, { n: 6, box: bk }] });
  const t = await token('admin@clinic.test');
  const appts = list(await call('GET', `/appointments?patientId=${manifest.data.returningId}&limit=20`, t));
  const appt = appts.find(a => a.date?.startsWith(TODAY) && a.slot?.startsWith(SLOT_RETURNING) && a.status !== 'CANCELLED');
  check(!!appt, `A: ${RETURNING.name} has a ${SLOT_RETURNING} appointment on ${TODAY} with Dr. Shravya`);
  manifest.data.returningSlotFull = appt?.slot;
  check(appt?.doctorId === manifest.data.doctorId || appt?.doctor?.id === manifest.data.doctorId, 'A: the appointment is with Dr. Shravya');

  const tile2 = page.locator(`[title^="Book ${SLOT_NEW}"]`).first();
  await bring(page, tile2, 420);
  await clickCenter(page, tile2);
  await dialog.waitFor();
  await page.waitForTimeout(600);
  check(await dialog.getByPlaceholder('Search patient by name or phone').count() > 0, 'A: after a booking the next slot asks for a patient again (the last patient is not reused)');
  await dialog.getByPlaceholder('Search patient by name or phone').pressSequentially(WALK_IN.phone, { delay: 40 });
  await page.waitForTimeout(1600);
  const addNew = dialog.getByRole('button', { name: 'Add new patient' });
  await shot(page, 'a3-no-match', { around: [dialog], pad: { l: 0, t: 0, r: 0, b: 0 }, callouts: [{ n: 1, loc: dialog.getByPlaceholder('Search patient by name or phone') }, { n: 2, loc: addNew }] });
  await addNew.click();
  const create = page.getByRole('dialog').filter({ hasText: 'Create Patient' });
  await create.waitFor();
  await page.waitForTimeout(600);
  const phoneField = create.getByPlaceholder(/Phone number/);
  check(await phoneField.inputValue() === WALK_IN.phone && await create.getByPlaceholder('Patient first name').inputValue() === '', 'A: a phone-number search fills Phone in the new-patient form, not First Name');
  await create.getByPlaceholder('Patient first name').fill(WALK_IN.first);
  await create.getByPlaceholder('Patient last name').fill(WALK_IN.last);
  const gender = create.getByRole('combobox').first();
  await gender.click();
  await page.getByRole('option', { name: /^Male$|^M$/ }).first().click();
  await page.waitForTimeout(400);
  const createBtn = create.getByRole('button', { name: 'Create Patient' });
  await shot(page, 'a3-create', { around: [create], pad: { l: 0, t: 0, r: 0, b: 0 }, callouts: [{ n: 3, loc: phoneField }, { n: 4, loc: create.getByPlaceholder('Patient first name') }, { n: 5, loc: createBtn, badge: 'top' }] });
  await createBtn.click();
  await page.waitForTimeout(2200);
  check(/Syed Arif/.test(await dialog.innerText()), 'A: back in the booking dialog, the new patient is already chosen');
  const confirm2 = dialog.getByRole('button', { name: 'Confirm Booking' });
  await shot(page, 'a3-back', { around: [dialog], pad: { l: 0, t: 0, r: 0, b: 0 }, callouts: [{ n: 6, loc: dialog.getByText(WALK_IN.first + ' ' + WALK_IN.last).first() }, { n: 7, loc: confirm2, badge: 'top' }] });
  await confirm2.click();
  await page.waitForTimeout(2500);
  check(await page.getByRole('status').filter({ hasText: 'Syed Arif' }).count() > 0, 'A: the success banner names the new patient');
  check(page.errors.length === 0, 'A: no page errors ' + page.errors.join(' | '));
  await page.context().close();
}

async function footerText(page) {
  return (await page.getByText(/^To complete, add/).first().innerText().catch(() => '')).trim();
}

async function bottom(page) {
  await page.evaluate(() => { const m = document.querySelector('main'); m.scrollTop = m.scrollHeight; });
  await page.waitForTimeout(500);
}

async function cancelOpenDispenseTasks(t, patientId) {
  const tasks = list(await call('GET', '/pharmacy/dispense-tasks?limit=100', t));
  for (const k of tasks.filter(k => k.patient?.id === patientId && k.dispenseTaskId && !['dispensed', 'cancelled', 'expired'].includes(String(k.status).toLowerCase()))) {
    await call('PATCH', `/pharmacy/dispense-tasks/${k.dispenseTaskId}/status`, t, { status: 'CANCELLED', reasonType: 'OTHER', reasonNote: 'training capture rerun' });
  }
  return tasks.filter(k => k.patient?.id === patientId && !k.dispenseTaskId).length;
}

async function partB(browser) {
  const t = await token('admin@clinic.test');
  const untracked = await cancelOpenDispenseTasks(t, manifest.data.returningId);
  if (untracked) console.log('NOTE', untracked, 'queued prescriptions for the patient have no dispense task to cancel');
  const page = await open(browser, 'shravya@clinic.test', DOCTOR_CLOCK);
  await page.goto(`${WEB}/dashboard`);
  await page.waitForTimeout(5000);
  const card = page.locator('[data-tour="appointments-list"]');
  const row = card.getByRole('link', { name: new RegExp(RETURNING.name) }).first();
  check(await row.count() > 0, `B: ${RETURNING.name} is a clickable row in Dr. Shravya's Today's Appointments`);
  await bring(page, card, 90);
  const cb = await boxOf(card);
  await shot(page, 'b1-today', { clip: { x: cb.x - 12, y: cb.y - 12, width: cb.width + 24, height: Math.min(cb.height + 24, 900 - cb.y) }, callouts: [{ n: 1, loc: row }] });
  await row.click();
  await page.waitForURL(/dashboard\/visits/, { timeout: 20000 });
  await page.waitForTimeout(6000);
  const header = page.locator('text=/Patient: .* • /').first();
  const headerText = (await header.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(headerText.includes(RETURNING.name) && /Doctor: Dr\. Shravya/.test(headerText), `B: one click opens the visit for ${RETURNING.name} under Dr. Shravya (header "${headerText}")`);
  const complete = page.getByRole('button', { name: 'Complete Visit' });
  check(await complete.count() > 0, 'B: the visit form is open and ready to document');
  await shot(page, 'b1-visit', { clip: { x: 256, y: 76, width: 1160, height: 140 }, callouts: [{ n: 2, loc: header }] });
  manifest.data.visitUrl = page.url().replace(WEB, '');

  const ctxClose = page.getByText('Patient Context', { exact: true }).locator('xpath=../..').getByRole('button').first();
  if (await ctxClose.count()) { await ctxClose.click(); await page.waitForTimeout(800); }
  await bottom(page);
  const reason0 = await footerText(page);
  check(await complete.isDisabled() && /a diagnosis and a prescription, examination or notes/.test(reason0), `B: on an empty visit Complete Visit is disabled and the footer says "${reason0}"`);
  manifest.data.footerEmpty = reason0;
  const fb = await boxOf(complete);
  await shot(page, 'b2-footer-empty', { clip: { x: 256, y: fb.y - 60, width: 1172, height: 130 }, callouts: [{ n: 1, loc: page.getByText(/^To complete, add/).first() }, { n: 2, loc: complete, badge: 'top' }] });

  await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
  await page.getByRole('tab', { name: /Prescription/ }).click();
  await page.waitForTimeout(2500);
  const DX = 'Acne vulgaris, grade II';
  const diagnosis = page.getByPlaceholder('e.g., Acne vulgaris').first();
  await diagnosis.fill(DX);
  await diagnosis.press('Tab');
  await page.waitForTimeout(800);
  await bottom(page);
  const reason1 = await footerText(page);
  check(/^To complete, add a prescription, examination or notes\.$/.test(reason1), `B: with only a diagnosis the footer names what is left: "${reason1}"`);
  manifest.data.footerAfterDx = reason1;
  const fb1 = await boxOf(complete);
  await shot(page, 'b2-footer-dx', { clip: { x: 256, y: fb1.y - 60, width: 1172, height: 130 }, callouts: [{ n: 4, loc: page.getByText(/^To complete, add/).first() }] });

  await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
  const tpl = page.getByRole('button', { name: 'No template' });
  await bring(page, tpl, 250);
  const tb = await boxOf(tpl);
  await tpl.click();
  await page.waitForTimeout(800);
  const acne = page.getByRole('menuitem', { name: /Acne/ }).first();
  check(await acne.count() > 0, 'B: the Templates menu offers an Acne template');
  manifest.data.templateName = (await acne.innerText()).trim().split('\n')[0];
  const menu = page.getByRole('menu').first();
  const mb = await boxOf(menu);
  await shot(page, 'b3-template', { clip: { x: tb.x - 24, y: tb.y - 60, width: Math.max(mb.x + mb.width, tb.x + tb.width) - tb.x + 400, height: Math.max(mb.y + mb.height, tb.y + tb.height) - tb.y + 84 }, callouts: [{ n: 1, box: tb, badge: 'top' }, { n: 2, loc: acne }] });
  await acne.click();
  await page.waitForTimeout(2500);
  const dxAfter = await diagnosis.inputValue();
  manifest.data.diagnosisFromTemplate = dxAfter;
  check(dxAfter !== DX, `B: choosing the template replaces a diagnosis typed before it ("${DX}" became "${dxAfter}")`);
  await bottom(page);
  check(await complete.isEnabled() && await page.getByText('Sent to pharmacy queue').count() === 0, 'B: CAUTION the template alone enables Complete Visit before the prescription is saved (no badge yet)');

  await bring(page, diagnosis, 300);
  await diagnosis.fill(DX);
  await diagnosis.press('Tab');
  await page.waitForTimeout(800);
  const db = await boxOf(diagnosis);
  await shot(page, 'b2-diagnosis', { clip: { x: 256, y: db.y - 120, width: 1160, height: 220 }, callouts: [{ n: 3, loc: diagnosis }] });
  const save = page.getByRole('button', { name: /^(Create|Save|Update) Prescription$/ }).first();
  await bring(page, save, 640);
  const sb = await boxOf(save);
  await shot(page, 'b3-save', { clip: { x: 256, y: sb.y - 300, width: 1172, height: 360 }, callouts: [{ n: 1, loc: save, badge: 'top' }] });
  await save.click();
  await page.waitForTimeout(3500);
  const goDialog = await page.getByRole('dialog', { name: /Go to Pharmacy/ }).isVisible().catch(() => false);
  check(!goDialog, 'B: saving the prescription opens no "Go to Pharmacy?" dialog');
  check(await page.getByRole('button', { name: /^Go to Pharmacy$/ }).count() === 0, 'B: there is no "Go to Pharmacy" button on the visit');
  const badge = page.getByText('Sent to pharmacy queue').first();
  check(await badge.count() > 0, 'B: a "Sent to pharmacy queue" badge confirms the hand-off');
  check(/dashboard\/visits/.test(page.url()), 'B: the doctor is still on the visit after saving');
  await bring(page, badge, 420);
  const bb = await boxOf(badge);
  await shot(page, 'b3-sent', { clip: { x: 256, y: bb.y - 200, width: 1172, height: 330 }, callouts: [{ n: 2, loc: badge }] });

  const hist = list(await call('GET', `/visits/patient/${manifest.data.returningId}/history?limit=5`, t));
  manifest.data.visitId = hist[0]?.id;
  const vis = await call('GET', `/visits/${manifest.data.visitId}`, t);
  const rxId = vis?.prescription?.id || vis?.prescriptionId || (vis.prescriptions || [])[0]?.id;
  const queue = list(await call('GET', '/pharmacy/prescription-queue?limit=50', t));
  check(!!rxId && queue.some(e => (e.prescriptionId || e.id) === rxId), 'B: the saved prescription is in the pharmacy queue with no extra click');
  manifest.data.rxId = rxId;

  await page.reload();
  await page.waitForTimeout(6000);
  const ctxAgain = page.getByText('Patient Context', { exact: true }).locator('xpath=../..').getByRole('button').first();
  if (await ctxAgain.count()) { await ctxAgain.click(); await page.waitForTimeout(800); }
  await bottom(page);
  check(await complete.isEnabled() && (await footerText(page)) === '', 'B: after reopening the visit, the saved diagnosis and prescription keep Complete Visit enabled and the footer quiet');
  const fb2 = await boxOf(complete);
  await shot(page, 'b4-ready', { clip: { x: 256, y: fb2.y - 60, width: 1172, height: 130 }, callouts: [{ n: 1, loc: complete, badge: 'top' }] });
  await complete.click();
  await page.waitForTimeout(4000);
  const v2 = await call('GET', `/visits/${manifest.data.visitId}`, t);
  check(v2.status === 'COMPLETED', `B: the visit is COMPLETED (got ${v2.status}) with no photos, labs or vitals`);
  const toast = page.getByText('Visit completed', { exact: true }).first();
  if (await toast.count()) {
    const tb2 = await boxOf(toast);
    const card = await boxOf(toast.locator('xpath=../..'));
    await shot(page, 'b4-done', { clip: { x: card.x + 1, y: card.y + 1, width: card.width - 2, height: card.height - 2 } });
  }
  check(await toast.count() > 0, 'B: a "Visit completed" confirmation appears');
  check(page.errors.length === 0, 'B: no page errors ' + page.errors.join(' | '));
  await page.context().close();

  const desk = await open(browser, 'reception@clinic.test', DOCTOR_CLOCK);
  await desk.goto(`${WEB}/dashboard/pharmacy?section=counter`);
  await desk.waitForTimeout(5000);
  await desk.getByRole('button', { name: 'Queue', exact: true }).first().click();
  await desk.waitForTimeout(1500);
  const entry = desk.getByText(RETURNING.name).first();
  check(await entry.count() > 0, `B: ${RETURNING.name}'s prescription is waiting at the Pharmacy Counter`);
  const eb = await boxOf(entry);
  await shot(desk, 'b3-queue', { clip: { x: 256, y: 76, width: 640, height: Math.max(eb.y + 120, 420) - 76 }, callouts: [{ n: 3, box: { x: eb.x - 12, y: eb.y - 20, width: 276, height: 90 } }] });
  await desk.context().close();
}

async function partC(browser) {
  const t = await token('admin@clinic.test');
  const page = await open(browser, 'reception@clinic.test', `${TODAY}T11:10:00+05:30`);
  await page.goto(`${WEB}/dashboard/patients/${manifest.data.returningId}`);
  await page.waitForTimeout(5000);
  const book = page.getByRole('link', { name: /Book/ }).or(page.getByRole('button', { name: /Book appointment|^Book$/ })).first();
  check(await book.count() > 0, `C: ${RETURNING.name}'s chart has a Book appointment action`);
  manifest.data.chartBookLabel = (await book.innerText()).trim();
  const bb = await boxOf(book);
  await shot(page, 'c1-chart', { clip: { x: 256, y: 64, width: 1172, height: Math.max(260, bb.y + bb.height + 40 - 64) }, callouts: [{ n: 1, loc: book, badge: 'top' }] });
  await book.click();
  await page.waitForURL(/appointments\?patientId=/, { timeout: 15000 });
  await page.waitForTimeout(3500);
  await setDoctorAndDate(page, FOLLOW_UP);
  await page.locator('input[type=date]').first().evaluate(e => e.blur());
  const tile = page.locator(`[title^="Book ${SLOT_FOLLOW_UP}"]`).first();
  check(await tile.count() > 0, `C: the ${SLOT_FOLLOW_UP} slot on ${FOLLOW_UP} is free`);
  await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
  await page.waitForTimeout(300);
  await shot(page, 'c1-calendar', { clip: { x: 256, y: 64, width: 1172, height: 300 }, callouts: [{ n: 2, loc: page.locator('input[type=date]').first() }] });
  await bring(page, tile, 420);
  await clickCenter(page, tile);
  const dialog = page.getByRole('dialog', { name: 'Book Appointment' });
  await dialog.waitFor();
  await page.waitForTimeout(900);
  const txt = await dialog.innerText();
  check(txt.includes(RETURNING.name) && await dialog.getByPlaceholder('Search patient by name or phone').count() === 0, 'C: from the chart, the booking dialog already names the patient (no search needed)');
  const confirm = dialog.getByRole('button', { name: 'Confirm Booking' });
  await shot(page, 'c1-dialog', { around: [dialog], pad: { l: 0, t: 0, r: 0, b: 0 }, callouts: [{ n: 3, loc: dialog.getByText(RETURNING.name).first() }, { n: 4, loc: confirm, badge: 'top' }] });
  await confirm.click();
  await page.waitForTimeout(2500);
  const appts = list(await call('GET', `/appointments?patientId=${manifest.data.returningId}&limit=20`, t));
  check(appts.some(a => a.date?.startsWith(FOLLOW_UP) && a.slot?.startsWith(SLOT_FOLLOW_UP) && a.status !== 'CANCELLED'), `C: the follow-up on ${FOLLOW_UP} at ${SLOT_FOLLOW_UP} is booked for ${RETURNING.name}`);
  check(page.errors.length === 0, 'C: no page errors ' + page.errors.join(' | '));
  await page.context().close();
}

async function partD(browser) {
  const t = await token('admin@clinic.test');
  const day = list(await call('GET', `/appointments?date=${TODAY}&limit=100`, t));
  const appt = day.find(a => a.patient?.name === manifest.data.walkInName && a.status !== 'CANCELLED');
  check(!!appt, `D: ${manifest.data.walkInName} has an appointment to link to`);
  const other = await open(browser, 'praneeta@clinic.test', DOCTOR_CLOCK);
  await other.goto(`${WEB}/dashboard/visits?appointmentId=${appt.id}`);
  await other.waitForTimeout(6000);
  const header = (await other.locator('text=/Patient: .* • /').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(header.includes(manifest.data.walkInName) && /Doctor: Dr\. Shravya/.test(header), `D: a notification link with only the appointment opens that patient and that appointment's doctor ("${header}")`);
  await other.context().close();
  const desk = await open(browser, 'reception@clinic.test', DOCTOR_CLOCK);
  await desk.goto(`${WEB}/dashboard/visits?patientId=${manifest.data.returningId}&autoStart=true`);
  await desk.waitForTimeout(6000);
  const prompt = desk.getByText('Please select a doctor to start the visit.').first();
  check(await prompt.count() > 0 && await desk.getByRole('button', { name: 'Complete Visit' }).count() === 0, 'D: reception starting a visit is asked to choose the doctor instead of being given a guess');
  if (await prompt.count()) {
    await bring(desk, prompt, 400);
    const pb = await boxOf(prompt);
    await shot(desk, 'd1-choose-doctor', { clip: { x: 256, y: Math.max(64, pb.y - 260), width: 1172, height: 360 }, callouts: [{ n: 3, loc: prompt }] });
  }
  await desk.context().close();
}

module.exports = { partA, partB, partC, partD };

(async () => {
  fs.mkdirSync(IMG, { recursive: true });
  const parts = process.argv.slice(2);
  const want = (p) => parts.length === 0 || parts.includes(p);
  if (parts.length === 0) { manifest.checks = {}; manifest.shots = {}; }
  const browser = await chromium.launch();
  try {
    await seed(want('partA'));
    if (want('partA')) await partA(browser);
    if (want('partB')) await partB(browser);
    if (want('partC')) await partC(browser);
    if (want('partD')) await partD(browser);
  } finally {
    await browser.close();
    for (const c of checks) manifest.checks[c.msg.split(' ').slice(0, 12).join(' ')] = c;
    manifest.capturedAt = new Date().toISOString();
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    console.log(`${checks.filter(c => c.ok).length}/${checks.length} checks passed`);
  }
})().catch(e => { console.error(e); process.exit(1); });
