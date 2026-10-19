const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const net = require("node:net");
const { randomUUID } = require("node:crypto");
const { spawn, execFileSync, fork } = require("node:child_process");
const { createRequire } = require("node:module");
const registry = require("./registry.cjs");
const root = path.resolve(__dirname, "../..");
const req = createRequire(path.join(root, "backend/package.json"));
const frontReq = createRequire(path.join(root, "frontend/package.json"));
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
const output = path.join(root, "output/diagnostics/recovery-e2e", runId);
fs.mkdirSync(output, { recursive: true });
const result = {
  runId,
  nodeVersion: process.version,
  sourceDirty: Boolean(
    execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
  ),
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  scope:
    "Focused production feature E2E; desktop-driven scenarios with mobile responsive screenshots. Excludes full AppModule boot and unmounted ShelfIntelligence.",
  browser: null,
  setup: { status: "running" },
  scenarios: registry.map((s) => ({
    ...s,
    status: "pending",
    assertions: [],
    screenshots: [],
  })),
};
const owned = { children: [], schemaCreated: false };
let cancelled;
const checkCancelled = () => {
  if (cancelled) throw Error(`Interrupted by ${cancelled}`);
};
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "clinic-recovery-e2e-"));
fs.symlinkSync(
  path.join(root, "node_modules"),
  path.join(temp, "node_modules"),
);
const schema = `recovery_e2e_${randomUUID().replaceAll("-", "")}`;
const env = {
  PATH: process.env.PATH,
  HOME: temp,
  TMPDIR: temp,
  NODE_ENV: "test",
  TZ: "Asia/Kolkata",
  NEXT_TELEMETRY_DISABLED: "1",
  JWT_SECRET: randomUUID(),
  JWT_EXPIRES_IN: "1d",
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const writeResult = () =>
  fs.writeFileSync(
    path.join(output, "result.json"),
    JSON.stringify(result, null, 2),
  );
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function gallery() {
  const summary = result.scenarios
    .map((s) => `<a href="#${esc(s.id)}">${esc(s.id)} · ${esc(s.status)}</a>`)
    .join(" · ");
  const sections = result.scenarios
    .map(
      (s) =>
        `<section id="${esc(s.id)}"><h2>${esc(s.id)} · ${esc(s.category)} · ${esc(s.status)}</h2>${s.error ? `<p>${esc(s.error)}</p>` : ""}<div class="images">${s.screenshots.map((i) => `<article><h3>${esc(i.checkpoint)} · ${i.width}px</h3><a href="${esc(i.file)}"><img loading="lazy" src="${esc(i.file)}" alt="${esc(s.id + " " + i.checkpoint + " " + i.width + "px")}"></a></article>`).join("")}</div><details><summary>Persisted-state assertions</summary><pre>${esc(JSON.stringify(s.assertions, null, 2))}</pre></details></section>`,
    )
    .join("");
  fs.writeFileSync(
    path.join(output, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Recovery E2E screenshots</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px system-ui;margin:32px;color:#172554;background:#f8fafc}nav{position:sticky;top:0;background:white;padding:16px}section{margin:48px 0}img{max-width:100%;max-height:600px;border:1px solid #cbd5e1}article{min-width:0}pre{white-space:pre-wrap;overflow-wrap:anywhere}.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}details{margin:20px 0}a{color:#1d4ed8}</style><h1>Recovery E2E screenshots</h1><p>${esc(result.scope)}</p><p>Setup: ${esc(result.setup.status)}. Browser: ${esc(result.browser)}</p><nav>${summary}</nav>${sections}<details><summary>Browser diagnostics</summary><pre>${esc(JSON.stringify(result.browserDiagnostics, null, 2))}</pre></details>`,
  );
}

function child(command, args, cwd, label, extra = {}) {
  checkCancelled();
  const fd = fs.openSync(path.join(output, `${label}.log`), "w");
  const p = spawn(command, args, {
    cwd,
    env: { ...env, ...extra },
    stdio: ["ignore", fd, fd],
  });
  fs.closeSync(fd);
  owned.children.push(p);
  return p;
}
async function port() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const n = s.address().port;
  await new Promise((r) => s.close(r));
  return n;
}
async function ready(url, processRef) {
  for (let i = 0; i < 150; i++) {
    checkCancelled();
    if (processRef?.exitCode !== null && processRef?.exitCode !== undefined)
      throw Error("Owned server exited");
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return;
    } catch {}
    await sleep(400);
  }
  throw Error(`Server readiness timed out: ${new URL(url).pathname}`);
}
/**
 * @cc [owner:nareshshah139,label:testing] owned-recovery-lifecycle
 * The runner MUST require a loopback database, isolate a random owned schema and private clients, and stop or remove only resources created by this run.
 */
async function setup() {
  if (!process.env.RECOVERY_E2E_DATABASE_URL)
    throw Error("RECOVERY_E2E_DATABASE_URL is required");
  const url = new URL(process.env.RECOVERY_E2E_DATABASE_URL);
  assert(
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
    "Loopback database required",
  );
  assert(
    !url.searchParams.has("schema"),
    "Supply a database URL without a schema",
  );
  url.searchParams.set("schema", schema);
  env.DATABASE_URL = url.toString();
  const clientDir = path.join(temp, "prisma");
  const schemaFile = path.join(temp, "schema.prisma");
  fs.writeFileSync(
    schemaFile,
    fs
      .readFileSync(path.join(root, "backend/prisma/schema.prisma"), "utf8")
      .replace(
        'provider = "prisma-client-js"',
        `provider = "prisma-client-js"\n  output = "${clientDir}"`,
      ),
  );
  const prisma = (...args) =>
    execFileSync(
      process.execPath,
      [req.resolve("prisma/build/index.js"), ...args],
      {
        cwd: temp,
        env: { ...env, PRISMA_GENERATE_SKIP_AUTOINSTALL: "1" },
        stdio: "pipe",
      },
    );
  prisma("generate", "--schema", schemaFile);
  const { PrismaClient } = require(clientDir);
  owned.admin = new PrismaClient({
    datasourceUrl: process.env.RECOVERY_E2E_DATABASE_URL,
  });
  await owned.admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  owned.schemaCreated = true;
  checkCancelled();
  prisma("db", "push", "--skip-generate", "--schema", schemaFile);
  owned.db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  const branch = await owned.db.branch.create({
    data: { name: "Recovery Test Clinic", address: "Synthetic E2E" },
  });
  const permissions = [
    "inventory:item:read",
    "inventory:item:create",
    "inventory:item:update",
    "inventory:transaction:create",
    "inventory:transaction:read",
    "inventory:transaction:bulk",
    "inventory:adjustment:create",
    "pharmacy:purchase-ledger:read",
    "pharmacy:purchase-ledger:write",
    "pharmacy:purchase-invoice:read",
    "pharmacy:purchase-invoice:create",
    "pharmacy:purchase-invoice:review",
    "pharmacy:purchase-invoice:commit-stock",
    "pharmacy:dashboard:read",
  ];
  const password = "Synthetic-Recovery-Only-2026";
  const user = await owned.db.user.create({
    data: {
      branchId: branch.id,
      email: "recovery@example.invalid",
      firstName: "Recovery",
      lastName: "Pharmacist",
      role: "PHARMACIST",
      password: await req("bcryptjs").hash(password, 4),
      permissions: JSON.stringify(permissions),
    },
  });
  checkCancelled();
  const fd = fs.openSync(path.join(output, "backend.log"), "w");
  const backend = fork(path.join(__dirname, "app.cjs"), [], {
    cwd: temp,
    env: { ...env, RECOVERY_PRIVATE_CLIENT: clientDir },
    stdio: ["ignore", fd, fd, "ipc"],
  });
  fs.closeSync(fd);
  owned.children.push(backend);
  const backendPort = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Error("Backend boot timeout")), 60000);
    backend.once("message", (m) => {
      clearTimeout(t);
      resolve(m.port);
    });
    backend.once("exit", (code) => {
      clearTimeout(t);
      reject(Error(`Backend exited ${code}`));
    });
  });
  checkCancelled();
  const faults = [];
  owned.proxy = http.createServer((incoming, outgoing) => {
    const chunks = [];
    incoming.on("data", (b) => chunks.push(b));
    incoming.on("end", () => {
      const body = Buffer.concat(chunks);
      let payload;
      try {
        payload = JSON.parse(body.toString());
      } catch {}
      const upstream = http.request(
        {
          hostname: "127.0.0.1",
          port: backendPort,
          path: incoming.url,
          method: incoming.method,
          headers: { ...incoming.headers, host: `127.0.0.1:${backendPort}` },
        },
        (response) => {
          const data = [];
          response.on("data", (b) => data.push(b));
          response.on("end", async () => {
            try {
              const fault = faults.find(
                (f) =>
                  !f.used &&
                  !f.claimed &&
                  f.path === incoming.url &&
                  f.method === incoming.method &&
                  f.match(payload),
              );
              if (fault) {
                fault.claimed = true;
                assert(
                  response.statusCode >= 200 && response.statusCode < 300,
                  "Only committed successful responses may be dropped",
                );
                await fault.confirm();
                fault.used = true;
                fault.payload = payload;
                outgoing.destroy();
                fault.resolve();
              } else {
                outgoing.writeHead(response.statusCode, response.headers);
                outgoing.end(Buffer.concat(data));
              }
            } catch (e) {
              outgoing.destroy();
              faults.forEach((f) => f.reject(e));
            }
          });
        },
      );
      upstream.setTimeout(30000, () => upstream.destroy());
      upstream.on("error", () => {
        outgoing.writeHead(502);
        outgoing.end();
      });
      upstream.end(body);
    });
  });
  await new Promise((r) => owned.proxy.listen(0, "127.0.0.1", r));
  checkCancelled();
  const proxyUrl = `http://127.0.0.1:${owned.proxy.address().port}`;
  const frontend = path.join(temp, "frontend");
  fs.mkdirSync(frontend);
  for (const name of [
    "src",
    "public",
    "package.json",
    "tsconfig.json",
    "tsconfig.build.json",
    "next.config.ts",
    "postcss.config.mjs",
    "postcss.config.js",
  ]) {
    const from = path.join(root, "frontend", name);
    if (fs.existsSync(from))
      fs.cpSync(from, path.join(frontend, name), {
        recursive: true,
        filter: (p) => !path.basename(p).startsWith(".env"),
      });
  }
  fs.symlinkSync(
    path.join(root, "frontend/node_modules"),
    path.join(frontend, "node_modules"),
  );
  fs.symlinkSync(
    path.join(root, "shared-types"),
    path.join(temp, "shared-types"),
  );
  const nextPort = await port();
  const next = child(
    process.execPath,
    [
      frontReq.resolve("next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(nextPort),
    ],
    frontend,
    "frontend",
    { NEXT_PUBLIC_API_PROXY: proxyUrl, NODE_ENV: "development" },
  );
  const base = `http://127.0.0.1:${nextPort}`;
  await ready(`${base}/login`, next);
  const executable =
    process.env.RECOVERY_E2E_BROWSER_EXECUTABLE ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  assert(
    fs.existsSync(executable),
    "RECOVERY_E2E_BROWSER_EXECUTABLE must point at an installed browser",
  );
  owned.browser = await frontReq("puppeteer-core").launch({
    executablePath: executable,
    headless: true,
    userDataDir: path.join(temp, "browser"),
    args: ["--no-first-run", "--no-default-browser-check", "--no-sandbox"],
  });
  checkCancelled();
  result.browser = await owned.browser.version();
  const page = await owned.browser.newPage();
  result.browserDiagnostics = { pageErrors: [], consoleErrors: [] };
  page.on("pageerror", (error) => {
    result.browserDiagnostics.pageErrors.push(error.message);
    writeResult();
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      result.browserDiagnostics.consoleErrors.push(message.text());
      writeResult();
    }
  });
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.origin === base || ["data:", "blob:", "about:"].includes(u.protocol))
      r.continue();
    else r.abort();
  });
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  const login = await page.evaluate(
    async ({ identifier, password }) => {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      return { status: r.status };
    },
    { identifier: user.email, password },
  );
  assert.equal(login.status, 201);
  const call = async (method, pathname, data, headers = {}) =>
    page.evaluate(
      async ({ method, pathname, data, headers }) => {
        try {
          const r = await fetch("/api" + pathname, {
            method,
            headers: { "Content-Type": "application/json", ...headers },
            body: data === undefined ? undefined : JSON.stringify(data),
          });
          return { status: r.status, body: await r.json() };
        } catch (e) {
          return { status: 0, error: e.message };
        }
      },
      { method, pathname, data, headers },
    );
  assert.equal((await fetch(base + "/api/auth/me")).status, 401);
  await owned.db.user.update({
    where: { id: user.id },
    data: { permissions: "[]" },
  });
  assert.equal(
    (await call("POST", "/pharmacy/purchase-ledger/payments", {})).status,
    403,
  );
  await owned.db.user.update({
    where: { id: user.id },
    data: { permissions: JSON.stringify(permissions) },
  });
  assert.equal((await call("GET", "/auth/me")).body.id, user.id);
  assert.equal(
    (await call("GET", "/inventory/workspace/capabilities")).status,
    200,
  );
  await page.goto(`${base}/dashboard/inventory?area=stock&view=opening`, {
    waitUntil: "networkidle0",
  });
  await page.waitForFunction(() =>
    document.body.innerText.includes("Opening stock import"),
  );
  result.setup = {
    status: "passed",
    checks: [
      "private Prisma alias",
      "real HttpOnly cookie login",
      "auth/me",
      "workspace capabilities",
      "mounted opening import page",
      "unauthenticated HTTP 401",
      "pharmacist without permission HTTP 403",
    ],
  };
  writeResult();
  console.log(
    "BOOT PASS: real login, identity, capabilities and mounted opening page",
  );
  return {
    db: owned.db,
    user,
    branch,
    page,
    base,
    output,
    call,
    req,
    randomUUID,
    sleep,
    drop(path, match, confirm) {
      let resolve, reject;
      const done = new Promise((a, b) => {
        const t = setTimeout(
          () =>
            b(
              Error(
                "Committed response fault was not observed within 30 seconds",
              ),
            ),
          30000,
        );
        resolve = () => {
          clearTimeout(t);
          a();
        };
        reject = (e) => {
          clearTimeout(t);
          b(e);
        };
      });
      done.catch(() => {});
      const f = {
        path,
        method: "POST",
        match,
        confirm,
        resolve,
        reject,
        done,
        used: false,
      };
      faults.push(f);
      return f;
    },
    async capture(scenario, checkpoint) {
      assert(scenario.checkpoints.includes(checkpoint));
      await page.waitForNetworkIdle({ idleTime: 200, timeout: 10000 });
      for (const width of [1280, 390]) {
        await page.setViewport({ width, height: width === 390 ? 1200 : 1000 });
        await sleep(200);
        if (scenario.id !== "stock")
          await page.evaluate(
            ({ id, checkpoint }) => {
              document
                .querySelectorAll("[data-recovery-capture]")
                .forEach((e) => e.removeAttribute("data-recovery-capture"));
              let target;
              if (id === "purchase") target = document.querySelector("#purchase-recovery-panel") || document.querySelector("#purchase-action-feedback");
              if (id === "opening")
                target = Array.from(
                  document.querySelectorAll("div.bg-slate-50"),
                ).find(
                  (e) =>
                    e.textContent.includes("Created") &&
                    e.textContent.includes("Skipped"),
                );
              if (id === "supplier")
                target = Array.from(
                  document.querySelectorAll('[data-slot="card-title"]'),
                )
                  .find((e) => e.textContent.trim() === "Recorded payments")
                  ?.closest('[data-slot="card"]');
              if (id === "partner") {
                target = Array.from(document.querySelectorAll("p")).find((e) =>
                  e.textContent.includes("Recovery partner ·"),
                )?.parentElement?.parentElement;
                if (!target)
                  target = Array.from(
                    document.querySelectorAll('[data-slot="card-title"]'),
                  )
                    .find((e) => e.textContent.trim() === "Recent Submissions")
                    ?.closest('[data-slot="card"]');
              }
              if (!target)
                throw Error(
                  `Missing screenshot target for ${id}/${checkpoint}`,
                );
              if (id === "partner" && checkpoint === "recovered") {
                const cell = target.querySelector("tbody td:nth-child(3)");
                if (cell)
                  cell.scrollIntoView({ inline: "start", block: "nearest" });
              }
              target.setAttribute("data-recovery-capture", "");
              target.scrollIntoView({ block: "center", inline: "nearest" });
            },
            { id: scenario.id, checkpoint },
          );
        await sleep(200);
        const file = `${scenario.id}-${checkpoint}-${width}.png`;
        await page.screenshot({
          path: path.join(output, file),
          fullPage: scenario.id === "stock",
        });
        scenario.screenshots.push({
          checkpoint,
          width,
          height: width === 390 ? 1200 : 1000,
          category: scenario.category,
          file,
        });
      }
      await page.setViewport({ width: 1280, height: 1000 });
      writeResult();
    },
    check(scenario, label, actual, expected) {
      assert.deepEqual(actual, expected, label);
      scenario.assertions.push({ label, expected, actual });
      writeResult();
    },
  };
}
async function waitExit(child, timeout) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeout);
    child.once("exit", onExit);
  });
}
async function cleanup() {
  const errors = [];
  const attempt = async (action) => {
    try {
      await action();
    } catch (error) {
      errors.push(error.message);
    }
  };
  await attempt(async () => {
    await owned.browser?.close();
  });
  await attempt(async () => {
    if (!owned.proxy) return;
    owned.proxy.closeAllConnections();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Proxy cleanup timed out")),
        3000,
      );
      owned.proxy.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  });
  for (const child of owned.children.reverse())
    await attempt(async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      if (!(await waitExit(child, 5000))) {
        child.kill("SIGKILL");
        assert(
          await waitExit(child, 3000),
          "Owned child did not exit after SIGKILL",
        );
      }
    });
  await attempt(async () => {
    await owned.db?.$disconnect();
  });
  await attempt(async () => {
    if (!owned.schemaCreated) return;
    assert(/^recovery_e2e_[a-f0-9]{32}$/.test(schema));
    await owned.admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    owned.schemaCreated = false;
  });
  await attempt(async () => {
    await owned.admin?.$disconnect();
  });
  await attempt(async () => {
    fs.rmSync(temp, { recursive: true, force: true });
  });
  if (errors.length) throw Error(errors.join("; "));
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    cancelled = signal;
    result.setup.interrupted = signal;
    for (const child of owned.children)
      if (child.exitCode === null) child.kill("SIGTERM");
    void owned.browser?.close().catch(() => {});
  });
(async () => {
  try {
    const fixture = await setup();
    checkCancelled();
    if (process.argv.includes("--smoke")) return;
    const scenarios = require("./scenarios.cjs");
    for (const row of result.scenarios) {
      checkCancelled();
      row.status = "running";
      try {
        await scenarios[row.id](fixture, row);
        checkCancelled();
        assert.equal(
          result.browserDiagnostics.consoleErrors.some((message) =>
            message.includes("same key"),
          ),
          false,
          "No duplicate React panel keys",
        );
        assert.deepEqual(
          result.browserDiagnostics.pageErrors,
          [],
          "No unhandled browser runtime errors",
        );
        for (const checkpoint of row.checkpoints)
          for (const width of [1280, 390])
            assert(
              row.screenshots.some(
                (s) => s.checkpoint === checkpoint && s.width === width,
              ),
              `Missing ${checkpoint}/${width}`,
            );
        row.status = "passed";
      } catch (error) {
        row.status = "failed";
        row.error = error.message;
        console.error(`${row.id}: ${error.stack}`);
        await fixture.page
          .screenshot({
            path: path.join(output, `${row.id}-failure.png`),
            fullPage: true,
          })
          .catch(() => {});
        process.exitCode = 1;
      } finally {
        writeResult();
        gallery();
      }
    }
  } catch (error) {
    if (result.setup.status !== "passed")
      result.setup = { status: "failed", error: error.message };
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (e) {
      result.cleanupError = e.message;
      process.exitCode = 1;
    }
    result.status = process.exitCode
      ? "failed"
      : process.argv.includes("--smoke")
        ? "smoke-passed"
        : "passed";
    writeResult();
    gallery();
    console.log(`Evidence: ${output}`);
  }
})();
