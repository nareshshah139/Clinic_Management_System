/**
 * PP-36 browser test: opens unknown, revoked and expired task links in Chrome against the real
 * portal routes and the real Next.js task page, and fails if the token appears in any request URL,
 * Referer, storage key or value, cookie, or the address bar after load, or if the three answers differ.
 * Usage: RECOVERY_E2E_DATABASE_URL=postgresql://... RECOVERY_E2E_BROWSER_EXECUTABLE=/usr/bin/google-chrome node e2e/portal/expired-link.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { execFileSync, fork, spawn } = require("node:child_process");
const { createRequire } = require("node:module");
const { randomUUID } = require("node:crypto");
const root = path.resolve(__dirname, "../..");
const backReq = createRequire(path.join(root, "backend/package.json"));
const frontReq = createRequire(path.join(root, "frontend/package.json"));
const out = path.join(root, "output/diagnostics/portal-e2e");
const owned = [];

const port = () => new Promise((resolve) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
async function ready(url, proc, seconds = 300) {
  for (let i = 0; i < seconds; i++) {
    if (proc.exitCode !== null) throw Error(`${url} process exited`);
    try { if ((await fetch(url)).status < 500) return; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error(`${url} not ready`);
}

(async () => {
  const url = new URL(process.env.RECOVERY_E2E_DATABASE_URL || "");
  assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "RECOVERY_E2E_DATABASE_URL must be loopback PostgreSQL");
  const executable = process.env.RECOVERY_E2E_BROWSER_EXECUTABLE;
  assert(executable && fs.existsSync(executable), "RECOVERY_E2E_BROWSER_EXECUTABLE must point at Chrome");
  fs.mkdirSync(out, { recursive: true });
  const schema = `portal_e2e_${randomUUID().replaceAll("-", "")}`;
  const prismaCli = backReq.resolve("prisma/build/index.js");
  const schemaFile = path.join(root, "backend/prisma/schema.prisma");
  execFileSync(process.execPath, [prismaCli, "generate", "--schema", schemaFile], { stdio: "pipe", env: { ...process.env, PRISMA_GENERATE_SKIP_AUTOINSTALL: "1" } });
  const admin = new (backReq("@prisma/client").PrismaClient)({ datasourceUrl: url.toString() });
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  owned.push(async () => { await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); await admin.$disconnect(); });
  url.searchParams.set("schema", schema);
  const nextPort = await port();
  const env = { ...process.env, DATABASE_URL: url.toString(), JWT_SECRET: "portal-e2e-jwt", PORTAL_LINK_SECRET: "portal-e2e-link-secret", PORTAL_BASE_URL: `http://127.0.0.1:${nextPort}`, CLINIC_NAME: "Linae Skin Clinic", NODE_ENV: "test" };
  execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate", "--schema", schemaFile], { stdio: "pipe", env });

  const backend = fork(path.join(__dirname, "app.cjs"), [], { env, stdio: ["ignore", "inherit", "inherit", "ipc"] });
  owned.push(async () => backend.kill());
  const { port: apiPort, tokens } = await new Promise((resolve, reject) => { backend.once("message", resolve); backend.once("exit", (c) => reject(Error(`backend exited ${c}`))); });

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "portal-e2e-"));
  owned.push(async () => fs.rmSync(temp, { recursive: true, force: true }));
  const frontend = path.join(temp, "frontend");
  fs.mkdirSync(frontend);
  for (const name of ["src", "public", "package.json", "tsconfig.json", "tsconfig.build.json", "next.config.ts", "postcss.config.mjs"]) {
    const from = path.join(root, "frontend", name);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(frontend, name), { recursive: true });
  }
  fs.symlinkSync(path.join(root, "frontend/node_modules"), path.join(frontend, "node_modules"));
  fs.symlinkSync(path.join(root, "node_modules"), path.join(temp, "node_modules"));
  fs.symlinkSync(path.join(root, "shared-types"), path.join(temp, "shared-types"));
  const next = spawn(process.execPath, [frontReq.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(nextPort)], {
    cwd: frontend, env: { ...process.env, NEXT_PUBLIC_API_PROXY: `http://127.0.0.1:${apiPort}/`, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", fs.openSync(path.join(out, "frontend.log"), "w"), fs.openSync(path.join(out, "frontend.log"), "a")],
  });
  owned.push(async () => next.kill());
  const base = `http://127.0.0.1:${nextPort}`;
  await ready(`${base}/p/records`, next);
  await ready(`${base}/p/t`, next);

  const browser = await frontReq("puppeteer-core").launch({ executablePath: executable, headless: true, userDataDir: path.join(temp, "browser"), args: ["--no-first-run", "--no-sandbox"] });
  owned.push(async () => browser.close());
  const result = { browser: await browser.version(), links: {} };
  const answers = [];
  for (const kind of ["unknown", "revoked", "expired"]) {
    const token = tokens[kind];
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    const requests = [];
    page.on("request", (r) => requests.push({ url: r.url(), method: r.method(), referer: r.headers().referer ?? null, body: r.postData() ?? null }));
    const pendingResponses = [];
    page.on("response", (r) => { if (r.url().includes("/api/portal/")) pendingResponses.push({ status: r.status() }); });
    console.error(`[pp36] ${kind}: open`);
    const doc = await page.goto(`${base}/p/t#${token}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForSelector('[data-testid="link-inactive"]', { timeout: 120000 });
    const state = await page.evaluate(() => ({
      href: location.href,
      text: document.querySelector('[data-testid="link-inactive"]').textContent,
      storage: [localStorage, sessionStorage].flatMap((s) => Object.keys(s).map((k) => `${k}=${s.getItem(k)}`)),
    }));
    const responses = pendingResponses;
    console.error(`[pp36] ${kind}: ${responses.length} portal response(s)`);
    const cookies = (await context.cookies()).map((c) => `${c.name}=${c.value}`);
    const dbNames = await page.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : []));
    for (const r of requests) {
      // The browser reports the navigation with its fragment, which it never sends; check the sent URL.
      assert(!r.url.split("#")[0].includes(token), `${kind}: token in request URL ${r.url}`);
      assert(!(r.referer ?? "").includes(token), `${kind}: token in Referer`);
    }
    const carrying = requests.filter((r) => (r.body ?? "").includes(token));
    assert.deepEqual(carrying.map((r) => `${r.method} ${new URL(r.url).pathname}`), ["POST /api/portal/task/questions"], `${kind}: token must travel once, in one POST body`);
    for (const s of [...state.storage, ...cookies, ...dbNames]) assert(!s.includes(token), `${kind}: token in storage/cookie ${s}`);
    assert(!state.href.includes("#"), `${kind}: fragment left in the address bar`);
    assert.equal(responses.length, 1);
    assert.equal(responses[0].status, 404);
    const csp = doc.headers()["content-security-policy"] ?? "";
    assert.match(csp, /script-src 'self' 'nonce-[^']+' 'sha256-[^']+'/, `${kind}: portal CSP missing`);
    assert(!/script-src[^;]*(https?:|\*|'unsafe-inline')/.test(csp), `${kind}: CSP allows a foreign or inline script`);
    assert.equal(doc.headers()["referrer-policy"], "no-referrer");
    // DevTools cannot read this proxied body, so replay the browser's request byte for byte.
    const replay = await fetch(`${base}/api/portal/task/questions`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: carrying[0].body });
    assert.equal(replay.status, 404);
    answers.push(JSON.stringify({ headers: [...replay.headers].filter(([k]) => !["date", "x-request-id", "etag", "keep-alive", "connection"].includes(k)), body: await replay.text() }));
    result.links[kind] = { requests: requests.length, tokenBodies: carrying.length, storageKeys: state.storage.length, cookies: cookies.length, status: responses[0].status, shown: state.text };
    await page.screenshot({ path: path.join(out, `inactive-${kind}.png`) });
    await context.close();
  }
  assert.equal(new Set(answers).size, 1, "unknown, revoked and expired answers differ");
  result.uniformBody = answers[0];
  result.verdict = "PASS";
  fs.writeFileSync(path.join(out, "expired-link.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})()
  .catch((error) => { console.error("FAIL", error.stack || error.message); process.exitCode = 1; })
  .finally(async () => { for (const undo of owned.reverse()) await undo().catch(() => {}); process.exit(); });
