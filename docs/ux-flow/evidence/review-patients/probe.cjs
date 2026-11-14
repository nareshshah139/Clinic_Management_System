const path = require('node:path');
const W = '/home/user/wt/patients';
const { chromium } = require(require.resolve('playwright', { paths: [W] }));
const { bootStack } = require(W + '/scripts/stack/boot.cjs');
const { seed } = require(W + '/scripts/ux/journeys/seed.cjs');
const OUT = __dirname;
(async () => {
  const stack = await bootStack({ label: 'ux-review-patients-probe' });
  const browser = await chromium.launch();
  try {
    await seed(stack);
    console.log('users', Object.keys(stack.users));
    // 1. reception, gender button style
    let ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
    let page = await ctx.newPage();
    await stack.login(page, 'reception');
    await page.goto(`${stack.base}/dashboard/patients`);
    await page.getByRole('button', { name: 'New patient' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Name *').waitFor();
    await dlg.getByRole('radio', { name: 'Male', exact: true }).click();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(800);
    const style = async (loc) => loc.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color, opacity: s.opacity, cls: el.className, disabled: el.disabled }; });
    console.log('MALE', JSON.stringify(await style(dlg.getByRole('radio', { name: 'Male', exact: true }))));
    console.log('BOOK', JSON.stringify(await style(dlg.getByRole('button', { name: 'Book for today' }))));
    await dlg.getByLabel('Phone *').click();
    await page.waitForTimeout(300);
    console.log('MALE after phone focus', JSON.stringify(await style(dlg.getByRole('radio', { name: 'Male', exact: true }))));
    await page.screenshot({ path: path.join(OUT, 'gender.png') });
    // reception patient page buttons
    const pid = 'cuxpatient000000000000002';
    await page.goto(`${stack.base}/dashboard/patients/${pid}`);
    await page.getByRole('heading', { name: 'Last visit' }).waitFor();
    await page.waitForTimeout(1500);
    console.log('RECEPTION patient page buttons', JSON.stringify(await page.locator('main button').allInnerTexts()));
    await page.screenshot({ path: path.join(OUT, 'reception-patient.png'), fullPage: true });
    await ctx.close();

    // 2. doctor: stale stored age
    const rows = await stack.db.$queryRawUnsafe(`SELECT id, name, dob, age FROM "${stack.schema}"."patients" WHERE dob IS NOT NULL ORDER BY id LIMIT 3`);
    const target = rows.find((r) => r.id !== pid) || rows[0];
    const dob = new Date(target.dob);
    const now = new Date();
    let dobAge = now.getFullYear() - dob.getFullYear();
    if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) dobAge--;
    await stack.db.$executeRawUnsafe(`UPDATE "${stack.schema}"."patients" SET age = ${dobAge - 1} WHERE id = '${target.id}'`);
    console.log('stale target', target.id, target.name, 'dob', dob.toISOString(), 'dobAge', dobAge, 'stored age set to', dobAge - 1);
    ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
    page = await ctx.newPage();
    await stack.login(page, 'doctor');
    await page.goto(`${stack.base}/dashboard/patients/${target.id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const d2 = page.getByRole('dialog');
    await page.waitForFunction(() => document.querySelector('#age')?.value.length > 0);
    console.log('age shown in edit', await d2.locator('#age').inputValue());
    await d2.locator('#age').fill(String(dobAge));
    await d2.getByRole('button', { name: 'Save changes' }).click();
    await d2.waitFor({ state: 'hidden' });
    await page.waitForTimeout(1000);
    const after = await stack.db.$queryRawUnsafe(`SELECT dob, age FROM "${stack.schema}"."patients" WHERE id = '${target.id}'`);
    console.log('after save', JSON.stringify(after));
    console.log('header badges', JSON.stringify(await page.locator('main .flex.flex-wrap.gap-2').first().innerText()));
    // doctor resume path on Rohan
    await page.goto(`${stack.base}/dashboard/patients/${pid}`);
    await page.getByRole('heading', { name: 'Last visit' }).waitFor();
    await page.waitForTimeout(2000);
    console.log('DOCTOR resume buttons', await page.getByRole('button', { name: /Resume/ }).count());
    console.log('DOCTOR patient page buttons', JSON.stringify(await page.locator('main button').allInnerTexts()));
    await page.screenshot({ path: path.join(OUT, 'doctor-patient-full.png'), fullPage: true });
    await ctx.close();
  } finally {
    await browser.close();
    await stack.stop();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
