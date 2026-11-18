const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "../../../..");
const outRoot = path.join(root, "output/verify-clinic");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const flag = (name) => process.argv.includes(`--${name}`);

function loadState(name = arg("instance", "default")) {
  const file = path.join(outRoot, "instances", `${name}.json`);
  if (!fs.existsSync(file)) throw Error(`No running instance "${name}" (${file} missing). Launch it first.`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function evidenceDir(feature) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(outRoot, "evidence", `${stamp}-${feature}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sql(state, query) {
  const url = new URL(process.env.STACK_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/clinic_stack");
  const wrapped = `SET search_path TO "${state.schema}"; SELECT coalesce(json_agg(t), '[]'::json) FROM (${query}) t;`;
  const out = execFileSync("psql", ["-X", "-q", "-t", "-A", "-h", url.hostname, "-p", url.port || "5432", "-U", decodeURIComponent(url.username), "-d", url.pathname.slice(1), "-c", wrapped], {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
    encoding: "utf8",
  });
  return JSON.parse(out.trim());
}

async function login(page, state, who = "pharmacist") {
  const user = state.users[who];
  if (!user) throw Error(`Unknown user ${who}; known: ${Object.keys(state.users).join(", ")}`);
  await page.goto(`${state.base}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
  let status;
  for (let wait = 0; wait <= 75000; wait += 15000) {
    status = await page.evaluate(
      async ({ identifier, password }) =>
        (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) })).status,
      { identifier: user.email, password: user.password },
    );
    if (status !== 429) break;
    console.log("login throttled (429); waiting 15s");
    await page.waitForTimeout(15000);
  }
  if (status !== 201) throw Error(`login ${who} returned ${status}`);
  return user;
}

const sessions = new Map();
async function openPage(browser, state, who = "pharmacist", contextOptions = {}) {
  const context = await browser.newContext({ ...contextOptions, ...(sessions.has(who) && { storageState: sessions.get(who) }) });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  if (!sessions.has(who)) {
    await login(page, state, who);
    sessions.set(who, await context.storageState());
  }
  return { context, page };
}

function recorder(page, state) {
  const log = { pageErrors: [], consoleErrors: [], writes: [], failures: [] };
  page.on("pageerror", (e) => log.pageErrors.push(e.message.slice(0, 400)));
  page.on("console", (m) => m.type() === "error" && log.consoleErrors.push(m.text().slice(0, 400)));
  page.on("response", (r) => {
    const url = r.url();
    if (!url.startsWith(`${state.base}/api/`)) return;
    const entry = { at: Date.now(), method: r.request().method(), status: r.status(), path: url.slice(state.base.length).split("?")[0] };
    if (entry.method !== "GET") log.writes.push(entry);
    if (entry.status >= 400) log.failures.push(entry);
  });
  return log;
}

function checker() {
  const checks = [];
  return {
    checks,
    ok(label, cond, detail) {
      checks.push({ label, ok: Boolean(cond), ...(cond ? {} : { detail: detail ?? null }) });
      console.log(`${cond ? "PASS" : "FAIL"} ${label}${cond || detail === undefined ? "" : ` :: ${JSON.stringify(detail)}`}`);
    },
    get failed() {
      return checks.filter((c) => !c.ok);
    },
  };
}

module.exports = { root, outRoot, arg, flag, loadState, pidAlive, evidenceDir, sql, login, openPage, recorder, checker };
