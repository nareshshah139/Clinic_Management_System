// Running-app proof for the visit fix round: boots its own stack from the visit worktree.
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const WT = "/home/user/wt/visit";
const { chromium } = require(require.resolve("playwright", { paths: [WT] }));
const { bootStack } = require(path.join(WT, "scripts/stack/boot.cjs"));
const { seed } = require(path.join(WT, "scripts/ux/journeys/seed.cjs"));
const OUT = path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });

async function reseed(stack) {
  const tables = await stack.db.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = '${stack.schema}' AND tablename NOT IN ('users', 'branches')`);
  await stack.db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${stack.schema}"."${t.tablename}"`).join(", ")}`);
  return seed(stack);
}

async function login(page, stack, who) {
  const user = stack.users[who];
  await page.goto(`${stack.base}/login`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 9; i++) {
    const s = await page.evaluate(async ({ identifier, password }) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) })).status, { identifier: user.email, password: user.password });
    if (s === 201) return;
    await page.waitForTimeout(10000);
  }
  throw Error("login failed");
}

const api = (page, method, url) => page.evaluate(async ({ method, url }) => {
  const r = await fetch(`/api${url}`, { method, credentials: "include" });
  return { status: r.status, body: await r.json().catch(() => null) };
}, { method, url });

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

async function addMed(page, idx, name, freq, dur) {
  await page.getByPlaceholder("Search medicine name...").nth(idx).pressSequentially(name, { delay: 15 });
  await page.getByRole("button", { name: "Select" }).first().click();
  await page.getByRole("button", { name: freq, exact: true }).click();
  await page.getByRole("button", { name: dur, exact: true }).click();
}

async function createRx(page) {
  await page.getByRole("button", { name: "Create Prescription" }).click();
  await page.getByText("Prescription created").first().waitFor();
  await page.waitForTimeout(1500);
}

async function stored(page, owner, seeded) {
  const appt = seeded.appointments.today.find((a) => a.patient === "Vikram Patil");
  const visit = ((await api(page, "GET", `/visits?appointmentId=${appt.id}`)).body?.visits || [])[0];
  if (!visit) return { visit: null };
  const full = (await api(page, "GET", `/visits/${visit.id}`)).body;
  const rx = (await api(page, "GET", `/prescriptions?visitId=${visit.id}`)).body?.prescriptions || [];
  const queue = JSON.stringify((await api(owner, "GET", "/pharmacy/prescription-queue?limit=100")).body || {});
  return {
    visitStatus: visit.status,
    visitFollowUp: full?.plan?.followUpInstructions ?? full?.plan?.dermatology?.followUpInstructions ?? null,
    prescriptions: rx.map((p) => ({ status: p.status, instructions: p.instructions, cancellationReason: p.cancellationReason ?? null, inPharmacyQueue: queue.includes(p.id),
      items: (p.items || []).map((i) => `${i.drugName}|${i.frequency}|${i.dosePattern || ""}|${i.duration}${i.durationUnit}`) })),
  };
}

const complete = (page) => page.getByRole("button", { name: /^(Complete visit|Completing\.\.\.)$/ });
const toCompleted = async (page) => { await page.waitForURL(/\/dashboard$/, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500); };

const scenarios = {
  async removeAllAfterCreate(page) {
    await page.locator("textarea").first().fill("Itchy patches");
    await addMed(page, 0, "Mometasone", "1-0-1", "14d");
    await addMed(page, 1, "Cetirizine", "Night", "10d");
    await createRx(page);
    await page.getByRole("button", { name: /^Remove .*Cetirizine/ }).first().click();
    await page.getByRole("button", { name: /^Remove .*Mometasone/ }).first().click();
    await page.waitForTimeout(800);
    await complete(page).click();
    await toCompleted(page);
    return { url: page.url() };
  },
  async editInstructionsAfterCreate(page) {
    await page.locator("textarea").first().fill("Itchy patches");
    await page.getByRole("textbox", { name: "Diagnosis" }).fill("Psoriasis vulgaris");
    await addMed(page, 0, "Mometasone", "1-0-1", "14d");
    await createRx(page);
    await page.getByLabel("Follow-up instructions").fill("Review in 2 weeks");
    await page.waitForTimeout(500);
    await complete(page).click();
    await toCompleted(page);
    return { url: page.url() };
  },
  async adviceOnly(page) {
    await page.locator("textarea").first().fill("Hair fall, counselling only");
    await page.getByRole("textbox", { name: "Diagnosis" }).fill("Telogen effluvium");
    await page.getByLabel("Follow-up instructions").fill("Diet advice; review in 6 weeks");
    await page.waitForTimeout(1000);
    const enabled = await complete(page).isEnabled();
    await complete(page).click();
    await toCompleted(page);
    return { completeEnabled: enabled, url: page.url() };
  },
  async hungLoad(page, stack) {
    await page.locator("textarea").first().fill("Itchy patches");
    await addMed(page, 0, "Mometasone", "1-0-1", "14d");
    const writes = [];
    page.on("request", (r) => { if (r.method() !== "GET" && /\/api\/(prescriptions|visits)/.test(r.url())) writes.push(`${r.method()} ${r.url().replace(stack.base, "").replace(/[a-z0-9]{25}/g, ":id")}`); });
    const hang = /\/api\/visits\/[a-z0-9]{20,}$/i;
    let held = 0;
    await page.route(hang, (route) => { if (route.request().method() === "GET") { held++; return; } return route.continue(); });
    await complete(page).click();
    await page.waitForTimeout(13000);
    const afterWait = { held, button: await complete(page).innerText(), enabled: await complete(page).isEnabled(),
      notCompletedShown: await page.getByText("Visit not completed").first().isVisible().catch(() => false) };
    await page.screenshot({ path: path.join(OUT, "hung-load.png") });
    await page.unroute(hang);
    await complete(page).click();
    await toCompleted(page);
    return { afterWait, writes, url: page.url() };
  },
};

(async () => {
  const stack = await bootStack({ label: "visit-fix-proof" });
  const browser = await chromium.launch();
  const results = {};
  try {
    let seeded = await seed(stack);
    let first = true;
    for (const [name, fn] of Object.entries(scenarios)) {
      if (!first) seeded = await reseed(stack);
      first = false;
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, timezoneId: "Asia/Kolkata", locale: "en-IN" });
      const ownerCtx = await browser.newContext();
      const page = await ctx.newPage();
      const owner = await ownerCtx.newPage();
      page.setDefaultTimeout(60000);
      try {
        await login(owner, stack, "owner");
        await login(page, stack, "doctor");
        await openVisit(page, stack);
        results[name] = await fn(page, stack, seeded);
        results[name].stored = await stored(page, owner, seeded);
      } catch (e) {
        results[name] = { error: e.message.split("\n")[0] };
        await page.screenshot({ path: path.join(OUT, `${name}-fail.png`) }).catch(() => {});
        try { results[name].stored = await stored(page, owner, seeded); } catch {}
      } finally {
        await ctx.close();
        await ownerCtx.close();
      }
      console.log(name, JSON.stringify(results[name], null, 1));
    }
    try {
      const out = execFileSync("node", [path.join(WT, "scripts/diagnostics/clinic-ux-browser.cjs")], {
        env: { ...process.env, CLINIC_URL: stack.base, CHROME_PATH: chromium.executablePath() }, encoding: "utf8", timeout: 600000,
      });
      console.log("diagnostics\n" + out);
    } catch (e) {
      console.log("diagnostics FAILED\n" + (e.stdout || "") + (e.stderr || e.message));
    }
  } finally {
    await browser.close();
    await stack.stop();
  }
  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify(results, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
