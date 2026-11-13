const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "../../..");
const infoFile = process.env.UX_STACK_INFO || path.join(root, "output/stack/ux-serve/info.json");
const DESKTOP = { width: 1366, height: 850 };

function readInfo() {
  assert(fs.existsSync(infoFile), `No running stack at ${infoFile}. Start one with scripts/ux/journeys/serve.cjs`);
  return JSON.parse(fs.readFileSync(infoFile, "utf8"));
}

async function login(page, info, who) {
  const user = info.users[who];
  assert(user, `Unknown persona ${who}`);
  await page.goto(`${info.base}/login`, { waitUntil: "domcontentloaded" });
  const status = await page.evaluate(
    async ({ identifier, password }) =>
      (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) })).status,
    { identifier: user.email, password: user.password },
  );
  assert.equal(status, 201, `login ${who} returned ${status}`);
  return user;
}

// Every interaction a person would make goes through `ui`, so the action count is what the
// journey cost, not what the script author chose to report.
function makeUi(page, info, shots, record) {
  const at = (target) => (typeof target === "string" ? page.locator(target) : target);
  const act = async (kind, label, run) => {
    await run();
    record.actions.push({ kind, label });
  };
  return {
    page,
    info,
    start: (route) => page.goto(`${info.base}${route}`, { waitUntil: "domcontentloaded" }),
    click: (target, label) => act("click", label, () => at(target).click()),
    fill: (target, value, label) => act("fill", label, () => at(target).fill(String(value))),
    type: (target, value, label) => act("fill", label, () => at(target).pressSequentially(String(value), { delay: 15 })),
    select: (target, value, label) => act("select", label, () => at(target).selectOption(value)),
    check: (target, label) => act("click", label, () => at(target).check()),
    press: (key, label) => act("key", label || key, () => page.keyboard.press(key)),
    upload: (target, file, label) => act("upload", label, () => at(target).setInputFiles(file)),
    decide(label, hasDefault = false) {
      record.decisions.push({ label, hasDefault });
    },
    reenter(label) {
      record.reentry.push(label);
    },
    async screen(name) {
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      const file = `${String(record.screens.length + 1).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
      await page.screenshot({ path: path.join(shots, file), fullPage: true });
      record.screens.push({ name, file });
    },
    async api(method, url, body) {
      const result = await page.evaluate(
        async ({ method, url, body }) => {
          const response = await fetch(`/api${url}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
          return { status: response.status, body: await response.json().catch(() => null) };
        },
        { method, url, body },
      );
      assert(result.status < 300, `${method} ${url} -> ${result.status} ${JSON.stringify(result.body)}`);
      return result.body;
    },
    goal(ok, message) {
      assert(ok, `Goal not reached: ${message}`);
      record.goal = message;
    },
  };
}

async function runJourney(meta, body, opts = {}) {
  const info = opts.info || readInfo();
  const label = opts.label || process.env.UX_LABEL || "scratch";
  const shots = path.join(root, "output/ux-journeys", label, meta.id);
  fs.rmSync(shots, { recursive: true, force: true });
  fs.mkdirSync(shots, { recursive: true });
  const record = { ...meta, label, actions: [], decisions: [], reentry: [], screens: [], goal: null, ok: false };
  const browser = opts.browser || (await chromium.launch());
  const context = await browser.newContext({ viewport: meta.viewport || DESKTOP, timezoneId: "Asia/Kolkata", locale: "en-IN" });
  const page = await context.newPage();
  page.setDefaultTimeout(Number(process.env.UX_TIMEOUT || 20000));
  try {
    if (meta.persona) await login(page, info, meta.persona);
    await body(makeUi(page, info, shots, record));
    assert(record.goal, "Journey ended without ui.goal(): the end state was never checked");
    record.ok = true;
  } catch (error) {
    record.error = error.message.split("\n")[0];
    await page.screenshot({ path: path.join(shots, "failure.png"), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
    if (!opts.browser) await browser.close();
  }
  record.count = record.actions.length;
  record.openDecisions = record.decisions.filter((d) => !d.hasDefault).length;
  fs.writeFileSync(path.join(shots, "record.json"), JSON.stringify(record, null, 2));
  return record;
}

function journey(meta, body) {
  const run = (opts) => runJourney(meta, body, opts);
  const cli = () =>
    run().then((r) => {
      console.log(`${r.ok ? "PASS" : "FAIL"} ${r.id} actions=${r.count} decisions=${r.openDecisions} reentry=${r.reentry.length} screens=${r.screens.length}${r.error ? ` :: ${r.error}` : ""}`);
      for (const [i, a] of r.actions.entries()) console.log(`  ${String(i + 1).padStart(2)}. ${a.kind.padEnd(6)} ${a.label}`);
      process.exit(r.ok ? 0 : 1);
    });
  return { meta, run, cli };
}

module.exports = { journey, readInfo, root };
