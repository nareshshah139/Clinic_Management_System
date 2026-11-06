const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');

const backend = path.resolve(__dirname, '../../backend');
const { PrismaClient } = require(require.resolve('@prisma/client', { paths: [backend] }));
const bcrypt = require(require.resolve('bcryptjs', { paths: [backend] }));

const baseUrl = process.env.CR20_BASE_URL || 'http://localhost:3000';
const databaseUrl = process.env.CR20_DATABASE_URL;
const output = path.resolve(process.env.CR20_OUTPUT || path.join(require('node:os').tmpdir(), 'cr20-saved-investigations'));
const password = 'Cr20-synthetic-only';
const run = randomUUID().slice(0, 8);

async function seedClinic(db, label) {
  const branch = await db.branch.create({ data: { name: `SYNTHETIC CR20 ${label} ${run}`, address: 'Test' } });
  const doctor = await db.user.create({
    data: { branchId: branch.id, firstName: 'Synthetic', lastName: `Doctor ${label}`, email: `cr20-${label.toLowerCase()}-${run}@example.invalid`, password: await bcrypt.hash(password, 10), role: 'DOCTOR' },
  });
  const visit = async (name) => {
    const patient = await db.patient.create({ data: { branchId: branch.id, name, gender: 'FEMALE', age: 30, phone: '9999999999' } });
    return (await db.visit.create({ data: { patientId: patient.id, doctorId: doctor.id, complaints: '[]' } })).id;
  };
  return { branchId: branch.id, email: doctor.email, visits: [await visit(`SYNTHETIC CR20 ${label} FIRST`), await visit(`SYNTHETIC CR20 ${label} SECOND`)] };
}

async function login(page, email) {
  await page.context().clearCookies();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('#login-identifier', email);
  await page.fill('#login-password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
}

async function openVisit(page, visitId) {
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${baseUrl}/dashboard/visits?visitId=${visitId}`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByRole('tab', { name: /^\s*Prescription\b/ }).first().click({ timeout: 60000 });
  await page.getByText('Add Custom Investigation').waitFor({ timeout: 60000 });
  await page.waitForLoadState('networkidle');
}

const box = (page, name) => page.getByRole('checkbox', { name, exact: true });
const nameInput = (page) => page.getByRole('textbox', { name: 'Add Custom Investigation', exact: true });
const addButton = (page) => page.getByRole('button', { name: 'Add custom investigation' });

async function main() {
  if (!databaseUrl || !/@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl)) throw new Error('CR20_DATABASE_URL must be the local database the backend uses');
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  const stored = async (branchId) => (await db.clinicInvestigation.findMany({ where: { branchId }, select: { name: true } })).map((row) => row.name);
  const a = await seedClinic(db, 'A');
  const b = await seedClinic(db, 'B');
  const [first, second] = a.visits;

  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const shot = (name) => page.screenshot({ path: path.join(output, `${name}.png`) });
  try {
    await login(page, a.email);
    await openVisit(page, first);
    assert.equal(await box(page, 'MRI Brain').count(), 0, 'MRI Brain is not offered before it is added');
    await nameInput(page).fill('MRI Brain');
    await addButton(page).click();
    await box(page, 'MRI Brain').waitFor();
    assert(await box(page, 'MRI Brain').isChecked(), 'the new investigation is ticked on the prescription it was added to');
    await box(page, 'MRI Brain').scrollIntoViewIfNeeded();
    await shot('1-added-on-first-visit');
    assert.deepEqual(await stored(a.branchId), ['MRI Brain'], 'the investigation is stored for the clinic');
    await page.getByRole('button', { name: 'Print Preview', exact: true }).click();
    await page.waitForSelector('#pagedjs-container .pagedjs_page', { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('#pagedjs-container')?.textContent.includes('MRI Brain'), null, { timeout: 60000 });

    await openVisit(page, second);
    assert.equal(await box(page, 'MRI Brain').count(), 1, 'another patient sees MRI Brain as a standing checkbox');
    assert.equal(await box(page, 'MRI Brain').isChecked(), false, 'it is not pre-ticked on another prescription');
    assert.equal(await box(page, 'CBC').count(), 1, 'built-in investigations still show');
    await box(page, 'MRI Brain').scrollIntoViewIfNeeded();
    await shot('2-standing-checkbox-on-second-patient');

    await nameInput(page).fill('  mri   BRAIN ');
    assert(await addButton(page).isDisabled(), 'a case or spacing variant of an existing option cannot be added again');
    await nameInput(page).fill('');

    await page.getByRole('button', { name: 'Manage saved investigations' }).click();
    await page.getByRole('button', { name: 'Rename MRI Brain' }).click();
    await page.getByRole('textbox', { name: 'New name for MRI Brain' }).fill('MRI Brain with contrast');
    await page.getByRole('button', { name: 'Save new name for MRI Brain' }).click();
    await box(page, 'MRI Brain with contrast').waitFor();
    await shot('3-renamed');
    await openVisit(page, first);
    assert.equal(await box(page, 'MRI Brain').count(), 0, 'the old name is gone after a reload');
    assert.equal(await box(page, 'MRI Brain with contrast').count(), 1, 'the new name persists after a reload');

    await login(page, b.email);
    await openVisit(page, b.visits[0]);
    assert.equal(await box(page, 'MRI Brain with contrast').count(), 0, 'another clinic does not see this clinic\'s investigations');

    await login(page, a.email);
    await openVisit(page, second);
    await page.getByRole('button', { name: 'Manage saved investigations' }).click();
    await page.getByRole('button', { name: 'Remove MRI Brain with contrast' }).click();
    await page.getByRole('button', { name: 'Confirm removing MRI Brain with contrast' }).click();
    await box(page, 'MRI Brain with contrast').waitFor({ state: 'detached' });
    await openVisit(page, second);
    assert.equal(await box(page, 'MRI Brain with contrast').count(), 0, 'a removed investigation stays removed after a reload');
    assert.deepEqual(await stored(a.branchId), [], 'the investigation is deleted for the clinic');
    console.log('PASS cr20: saved, printed, offered to another patient, renamed, kept per clinic, removed');
  } catch (error) {
    await shot('failure');
    throw error;
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
