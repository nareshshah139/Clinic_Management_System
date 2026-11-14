// Throwaway review probe: boots its own stack from the visit worktree, runs j03 and edge scenarios.
const path = require("node:path");
const fs = require("node:fs");
const WT = "/home/user/wt/visit";
const { chromium } = require(require.resolve("playwright", { paths: [WT] }));
const { bootStack } = require(path.join(WT, "scripts/stack/boot.cjs"));
const { seed } = require(path.join(WT, "scripts/ux/journeys/seed.cjs"));
const OUT = path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

async function reseed(stack) {
  const tables = await stack.db.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = '${stack.schema}' AND tablename NOT IN ('users', 'branches')`);
  await stack.db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${stack.schema}"."${t.tablename}"`).join(", ")}`);
  return seed(stack);
}

async function login(page, stack, who = "doctor") {
  const user = stack.users[who];
  await page.goto(`${stack.base}/login`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 9; i++) {
    const s = await page.evaluate(async ({ identifier, password }) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) })).status, { identifier: user.email, password: user.password });
    if (s === 201) return;
    await page.waitForTimeout(10000);
  }
  throw Error("login failed");
}

const api = (page, method, url, body) => page.evaluate(async ({ method, url, body }) => {
  const r = await fetch(`/api${url}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}, { method, url, body });

async function openVisit(page, stack) {
  await page.goto(`${stack.base}/dashboard/appointments`, { waitUntil: "domcontentloaded" });
  const row = page.locator('.group:has-text("Vikram Patil")').last();
  await row.waitFor();
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await row.locator('button[title="Start Visit"]').click();
  await page.getByText("Chief Complaints").first().waitFor();
  await page.waitForTimeout(1500);
}

async function addMed(page, idx, name, freq, dur, instr) {
  const search = page.getByPlaceholder("Search medicine name...");
  await search.nth(idx).pressSequentially(name, { delay: 15 });
  await page.getByRole("button", { name: "Select" }).first().click();
  if (freq) await page.getByRole("button", { name: freq, exact: true }).click();
  if (dur) await page.getByRole("button", { name: dur, exact: true }).click();
  if (instr) await page.getByPlaceholder("e.g., Avoid alcohol").nth(idx).fill(instr);
}

async function stored(page, seeded) {
  const appt = seeded.appointments.today.find((a) => a.patient === "Vikram Patil");
  const v = (await api(page, "GET", `/visits?appointmentId=${appt.id}`)).body;
  const visit = (v?.visits || [])[0];
  if (!visit) return { visit: null };
  const rx = (await api(page, "GET", `/prescriptions?visitId=${visit.id}`)).body;
  const p = rx?.prescriptions || [];
  return {
    visitStatus: visit.status, visitId: visit.id, rxCount: p.length,
    rx: p.map((x) => ({ id: x.id, diagnosis: x.diagnosis, instructions: x.instructions, followUpInstructions: x.followUpInstructions, items: (x.items || []).map((i) => `${i.drugName}|${i.frequency}|${i.dosePattern || ''}|${i.duration}${i.durationUnit}|${i.instructions || ''}`) })),
  };
}

const complete = (page) => page.getByRole("button", { name: /^(Complete visit|Completing\.\.\.)$/ });

const scenarios = {
  async editAfterCreate(page, stack, seeded) {
    await openVisit(page, stack);
    await page.locator("textarea").first().fill("Itchy patches");
    await page.getByRole("textbox", { name: "Diagnosis" }).fill("Psoriasis vulgaris");
    await addMed(page, 0, "Mometasone", "1-0-1", "14d", "Apply twice daily");
    await page.getByRole("button", { name: "Create Prescription" }).click();
    await page.getByText("Prescription created").first().waitFor();
    await page.waitForTimeout(2500);
    const afterCreate = await stored(page, seeded);
    await page.getByRole("textbox", { name: "Diagnosis" }).fill("Plaque psoriasis");
    await page.getByLabel("Follow-up instructions").fill("Review in 2 weeks");
    await page.waitForTimeout(500);
    await complete(page).click();
    await page.waitForURL(/\/dashboard$/, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return { afterCreate, url: page.url(), final: await stored(page, seeded) };
  },
  async editMedAfterCreate(page, stack, seeded) {
    await openVisit(page, stack);
    await page.locator("textarea").first().fill("Itchy patches");
    await addMed(page, 0, "Mometasone", "1-0-1", "14d", "Apply twice daily");
    await page.getByRole("button", { name: "Create Prescription" }).click();
    await page.getByText("Prescription created").first().waitFor();
    await page.waitForTimeout(2000);
    await page.getByLabel(/Duration for Mometasone/).first().focus();
    await page.getByRole("button", { name: "7d", exact: true }).click();
    await page.waitForTimeout(500);
    await complete(page).click();
    await page.waitForURL(/\/dashboard$/, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return { url: page.url(), final: await stored(page, seeded) };
  },
  async removeMedAfterCreate(page, stack, seeded) {
    await openVisit(page, stack);
    await page.locator("textarea").first().fill("Itchy patches");
    await addMed(page, 0, "Mometasone", "1-0-1", "14d", "");
    await addMed(page, 1, "Cetirizine", "Night", "10d", "");
    await page.getByRole("button", { name: "Create Prescription" }).click();
    await page.getByText("Prescription created").first().waitFor();
    await page.waitForTimeout(2000);
    // doctor drops both medicines (decides on advice only)
    await page.getByRole("button", { name: /^Remove .*Cetirizine/ }).first().click();
    await page.getByRole("button", { name: /^Remove .*Mometasone/ }).first().click();
    await page.waitForTimeout(800);
    const enabled = await complete(page).isEnabled();
    await page.screenshot({ path: path.join(OUT, "removed-meds.png"), fullPage: false });
    if (enabled) await complete(page).click();
    await page.waitForURL(/\/dashboard$/, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return { completeEnabledWithNoMedicines: enabled, url: page.url(), final: await stored(page, seeded) };
  },
  async adviceOnly(page, stack, seeded) {
    await openVisit(page, stack);
    await page.locator("textarea").first().fill("Hair fall, counselling only");
    await page.getByRole("textbox", { name: "Diagnosis" }).fill("Telogen effluvium");
    await page.getByLabel("Follow-up instructions").fill("Diet advice; review in 6 weeks");
    await page.waitForTimeout(1500);
    const help = await page.locator("#visit-completion-help").innerText().catch(() => null);
    await page.screenshot({ path: path.join(OUT, "advice-only.png"), fullPage: false });
    return { completeEnabled: await complete(page).isEnabled(), help, createRxEnabled: await page.getByRole("button", { name: "Create Prescription" }).isEnabled() };
  },
  async hungLoad(page, stack, seeded) {
    await openVisit(page, stack);
    await page.locator("textarea").first().fill("Itchy patches");
    await addMed(page, 0, "Mometasone", "1-0-1", "14d", "");
    let blocked = 0;
    await page.route(/\/api\/visits\/[a-z0-9]{20,}$/i, (route) => {
      if (route.request().method() === "GET") { blocked++; return; /* never answer */ }
      return route.continue();
    });
    await complete(page).click();
    await page.waitForTimeout(45000);
    const text = await complete(page).innerText();
    const disabled = await complete(page).isDisabled();
    await page.screenshot({ path: path.join(OUT, "hung-load.png"), fullPage: false });
    return { blocked, buttonAfter45s: text, disabled, url: page.url(), final: await stored(page, seeded) };
  },
  async rxSaveFails(page, stack, seeded) {
    await openVisit(page, stack);
    await page.locator("textarea").first().fill("Itchy patches");
    await addMed(page, 0, "Mometasone", "1-0-1", "14d", "");
    await page.route(/\/api\/prescriptions$/, (route) => route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"boom"}' }) : route.continue());
    await complete(page).click();
    await page.waitForTimeout(5000);
    const toasts = await page.locator('[role="status"], li[data-state="open"], [data-sonner-toast]').allInnerTexts().catch(() => []);
    const mid = { url: page.url(), button: await complete(page).innerText(), enabled: await complete(page).isEnabled(), toasts, stored: await stored(page, seeded) };
    await page.unroute(/\/api\/prescriptions$/);
    await complete(page).click();
    await page.waitForURL(/\/dashboard$/, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return { mid, url: page.url(), final: await stored(page, seeded) };
  },
  async completeFailsAfterRx(page, stack, seeded) {
    await openVisit(page, stack);
    await page.locator("textarea").first().fill("Itchy patches");
    await addMed(page, 0, "Mometasone", "1-0-1", "14d", "");
    await page.route(/\/api\/visits\/[^/]+\/complete$/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"down"}' }));
    await complete(page).click();
    await page.waitForTimeout(8000);
    const mid = { url: page.url(), button: await complete(page).innerText(), stored: await stored(page, seeded) };
    await page.unroute(/\/api\/visits\/[^/]+\/complete$/);
    await complete(page).click();
    await page.waitForURL(/\/dashboard$/, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return { mid, url: page.url(), final: await stored(page, seeded) };
  },
  async doubleClick(page, stack, seeded) {
    await openVisit(page, stack);
    await page.locator("textarea").first().fill("Itchy patches");
    await addMed(page, 0, "Mometasone", "1-0-1", "14d", "");
    const posts = [];
    page.on("request", (r) => { if (r.method() !== "GET" && /\/api\/(prescriptions|visits)/.test(r.url())) posts.push(`${r.method()} ${r.url().replace(stack.base, "")}`); });
    await complete(page).dblclick();
    await page.keyboard.press("Control+Shift+S");
    await page.waitForURL(/\/dashboard$/, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return { posts, url: page.url(), final: await stored(page, seeded) };
  },
  async oldDraft(page, stack, seeded) {
    // old-version draft with all old sections marked complete, no medicines
    const appt = seeded.appointments.today.find((a) => a.patient === "Vikram Patil");
    await openVisit(page, stack);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    return { keys, apptId: appt.id };
  },
};

(async () => {
  const stack = await bootStack({ label: "review-visit-probe" });
  const browser = await chromium.launch();
  const results = {};
  try {
    let seeded = await seed(stack);
    let first = true;
    for (const [name, fn] of Object.entries(scenarios)) {
      if (only.length && !only.includes(name)) continue;
      if (!first) seeded = await reseed(stack);
      first = false;
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, timezoneId: "Asia/Kolkata", locale: "en-IN" });
      const page = await ctx.newPage();
      page.setDefaultTimeout(60000);
      try {
        await login(page, stack);
        results[name] = await fn(page, stack, seeded);
      } catch (e) {
        results[name] = { error: e.message.split("\n")[0] };
        await page.screenshot({ path: path.join(OUT, `${name}-fail.png`) }).catch(() => {});
        try { results[name].stored = await stored(page, seeded); } catch {}
      } finally {
        await ctx.close();
      }
      console.log(name, JSON.stringify(results[name], null, 1));
    }
  } finally {
    await browser.close();
    await stack.stop();
  }
  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify(results, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
