const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const net = require("node:net");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, execFileSync, fork } = require("node:child_process");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "../..");
const lockFile = path.join(root, "backend/package-lock.json");

function backendDeps() {
  const installed = (dir) => fs.existsSync(path.join(dir, "node_modules/@nestjs/core/package.json")) && fs.existsSync(path.join(dir, "node_modules/prisma/build/index.js"));
  for (const dir of [path.join(root, "backend"), root]) if (installed(dir)) return dir;
  const key = crypto.createHash("sha256").update(fs.readFileSync(lockFile)).digest("hex").slice(0, 16);
  const dir = path.join(os.homedir(), ".cache/clinic-stack", `backend-deps-${key}`);
  if (installed(dir)) return dir;
  const work = `${dir}.${process.pid}.${crypto.randomUUID().slice(0, 8)}`;
  fs.mkdirSync(work, { recursive: true });
  fs.copyFileSync(path.join(root, "backend/package.json"), path.join(work, "package.json"));
  fs.copyFileSync(lockFile, path.join(work, "package-lock.json"));
  try {
    execFileSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: work, stdio: "pipe" });
    fs.renameSync(work, dir);
  } catch (error) {
    fs.rmSync(work, { recursive: true, force: true });
    if (!installed(dir)) throw error;
  }
  return dir;
}

const depsDir = backendDeps();
const req = createRequire(path.join(depsDir, "package.json"));
const PASSWORD = "Synthetic-Stack-Only-2026";
const SCHEMA_PREFIX = "stack_";
const live = new Set();
let hooked = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const n = s.address().port;
  await new Promise((r) => s.close(r));
  return n;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function hookProcess() {
  if (hooked) return;
  hooked = true;
  const stopAll = () => Promise.allSettled([...live].map((s) => s.stop()));
  for (const sig of ["SIGINT", "SIGTERM"])
    process.on(sig, () => stopAll().finally(() => process.exit(130)));
  process.on("uncaughtException", (e) => {
    console.error(e);
    stopAll().finally(() => process.exit(1));
  });
  process.on("unhandledRejection", (e) => {
    console.error(e);
    stopAll().finally(() => process.exit(1));
  });
}

function permissionsFor(prefixes) {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/controller\.ts$/.test(entry.name))
        for (const m of fs
          .readFileSync(full, "utf8")
          .matchAll(/'([a-z-]+(?::[a-z-]+)+)'/g))
          found.add(m[1]);
    }
  };
  walk(path.join(root, "backend/src"));
  return [...found].filter((p) => prefixes.includes(p.split(":")[0])).sort();
}

function seededPermissions(role) {
  req("ts-node").register({ transpileOnly: true, project: path.join(root, "backend/tsconfig.json") });
  return [...require(path.join(root, "backend/src/shared/access/role-permissions.ts")).ROLE_PERMISSIONS[role]];
}

const PEOPLE = [
  { key: "owner", role: "OWNER", firstName: "Rajesh", lastName: "Iyer", email: "rajesh.iyer@stack.example.invalid", prefixes: [] },
  { key: "doctor", role: "DOCTOR", firstName: "Priya", lastName: "Menon", email: "priya.menon@stack.example.invalid", prefixes: [] },
  { key: "pharmacist", role: "PHARMACIST", firstName: "Anil", lastName: "Deshmukh", email: "anil.deshmukh@stack.example.invalid", seeded: true },
  { key: "reception", role: "RECEPTION", firstName: "Sunita", lastName: "Patil", email: "sunita.patil@stack.example.invalid", prefixes: ["appointments", "billing", "rooms"] },
];

function engineEnv() {
  const dir = path.join(depsDir, "node_modules/@prisma/engines");
  const pick = (re) => fs.readdirSync(dir).find((f) => re.test(f));
  const query = pick(/^libquery_engine-.*\.node$/);
  const schema = pick(/^schema-engine-/);
  return {
    ...(query && { PRISMA_QUERY_ENGINE_LIBRARY: path.join(dir, query) }),
    ...(schema && { PRISMA_SCHEMA_ENGINE_BINARY: path.join(dir, schema) }),
    ...Object.fromEntries(["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"].filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
  };
}

function generatePrivateClient(env) {
  const source = fs.readFileSync(path.join(root, "backend/prisma/schema.prisma"), "utf8");
  const hash = crypto.createHash("sha256").update(source).digest("hex").slice(0, 16);
  const cache = path.join(os.tmpdir(), `clinic-stack-client-${hash}`);
  const clientDir = path.join(cache, "client");
  if (fs.existsSync(path.join(clientDir, "index.js"))) return { clientDir, schemaFile: path.join(cache, "schema.prisma") };
  const work = `${cache}.${process.pid}.${crypto.randomUUID().slice(0, 8)}`;
  fs.mkdirSync(work, { recursive: true });
  fs.symlinkSync(path.join(depsDir, "node_modules"), path.join(work, "node_modules"));
  const schemaFile = path.join(work, "schema.prisma");
  fs.writeFileSync(
    schemaFile,
    source.replace('provider = "prisma-client-js"', `provider = "prisma-client-js"\n  output = "${path.join(work, "client")}"`),
  );
  execFileSync(process.execPath, [req.resolve("prisma/build/index.js"), "generate", "--schema", schemaFile], {
    cwd: work,
    env: { ...env, PRISMA_GENERATE_SKIP_AUTOINSTALL: "1" },
    stdio: "pipe",
  });
  const finalSchema = path.join(work, "schema.prisma");
  fs.writeFileSync(finalSchema, source);
  try {
    fs.renameSync(work, cache);
  } catch {
    fs.rmSync(work, { recursive: true, force: true });
  }
  return { clientDir, schemaFile: path.join(cache, "schema.prisma") };
}

async function sweepStaleSchemas(admin) {
  const rows = await admin.$queryRawUnsafe(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE '${SCHEMA_PREFIX}%'`,
  );
  for (const { schema_name } of rows) {
    const pid = Number(schema_name.split("_")[1]);
    if (Number.isInteger(pid) && pid !== process.pid && !pidAlive(pid))
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema_name}" CASCADE`);
  }
}

async function bootStack(opts = {}) {
  const databaseUrl = opts.databaseUrl || process.env.STACK_DATABASE_URL;
  if (!databaseUrl) throw Error("databaseUrl or STACK_DATABASE_URL is required");
  const label = String(opts.label || "stack").replace(/[^A-Za-z0-9._-]/g, "_");
  const url = new URL(databaseUrl);
  assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Loopback database required");
  assert(!url.searchParams.has("schema"), "Supply a database URL without a schema");
  hookProcess();

  const output = path.join(root, "output/stack", label);
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "clinic-stack-"));
  fs.symlinkSync(path.join(root, "node_modules"), path.join(temp, "node_modules"));
  const prismaCwd = path.join(temp, "prisma-cwd");
  fs.mkdirSync(prismaCwd);
  fs.symlinkSync(path.join(depsDir, "node_modules"), path.join(prismaCwd, "node_modules"));
  const schema = `${SCHEMA_PREFIX}${process.pid}_${crypto.randomUUID().replaceAll("-", "")}`;
  url.searchParams.set("schema", schema);
  const env = {
    PATH: process.env.PATH,
    HOME: temp,
    TMPDIR: temp,
    ...engineEnv(),
    NODE_ENV: "test",
    TZ: "Asia/Kolkata",
    NEXT_TELEMETRY_DISABLED: "1",
    JWT_SECRET: crypto.randomUUID(),
    JWT_EXPIRES_IN: "1d",
    DATABASE_URL: url.toString(),
  };

  const owned = { children: [], admin: null, db: null, schemaCreated: false, stopped: null };
  const logFd = (name) => fs.openSync(path.join(output, `${name}.log`), "w");

  const stack = {
    schema,
    output,
    temp,
    users: {},
    async stop() {
      if (owned.stopped) return owned.stopped;
      owned.stopped = (async () => {
        live.delete(stack);
        for (const c of owned.children) {
          if (c.exitCode !== null && c.exitCode !== undefined) continue;
          try {
            if (c.detachedGroup) process.kill(-c.pid, "SIGTERM");
            else c.kill("SIGTERM");
          } catch {}
        }
        for (let i = 0; i < 25 && owned.children.some((c) => c.exitCode === null); i++) await sleep(200);
        for (const c of owned.children) {
          if (c.exitCode !== null) continue;
          try {
            if (c.detachedGroup) process.kill(-c.pid, "SIGKILL");
            else c.kill("SIGKILL");
          } catch {}
        }
        await owned.db?.$disconnect().catch(() => {});
        if (owned.schemaCreated)
          await owned.admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch((e) => {
            console.error(`schema drop failed: ${e.message}`);
          });
        await owned.admin?.$disconnect().catch(() => {});
        fs.rmSync(temp, { recursive: true, force: true });
      })();
      return owned.stopped;
    },
  };
  live.add(stack);

  try {
    const { clientDir, schemaFile } = generatePrivateClient(env);
    const { PrismaClient } = require(clientDir);
    const adminUrl = new URL(databaseUrl);
    owned.admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
    await sweepStaleSchemas(owned.admin);
    await owned.admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    owned.schemaCreated = true;
    execFileSync(process.execPath, [req.resolve("prisma/build/index.js"), "db", "push", "--skip-generate", "--schema", schemaFile], {
      cwd: prismaCwd,
      env: { ...env, PRISMA_GENERATE_SKIP_AUTOINSTALL: "1" },
      stdio: "pipe",
    });
    for (const migration of ["20261005093000_inventory_read_queries", "20261107090000_supplier_credit_note_reuse"])
      execFileSync(
        process.execPath,
        [
          req.resolve("prisma/build/index.js"), "db", "execute", "--url", env.DATABASE_URL,
          "--file", path.join(root, `backend/prisma/migrations/${migration}/migration.sql`),
        ],
        { cwd: prismaCwd, env: { ...env, PRISMA_GENERATE_SKIP_AUTOINSTALL: "1" }, stdio: "pipe" },
      );
    owned.db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
    stack.db = owned.db;

    const recoverySql = path.join(root, "backend/prisma/migrations/20261024150000_unlinked_purchase_recovery/migration.sql");
    if (fs.existsSync(recoverySql))
      for (const statement of fs.readFileSync(recoverySql, "utf8").split("-- statement-breakpoint"))
        if (/^\s*CREATE (FUNCTION|TRIGGER) /.test(statement)) await owned.db.$executeRawUnsafe(statement);

    const branch = await owned.db.branch.create({ data: { name: "Lakshmi Family Clinic", address: "12 MG Road, Pune 411001" } });
    stack.branch = branch;
    const hash = await req("bcryptjs").hash(PASSWORD, 4);
    for (const p of PEOPLE) {
      const user = await owned.db.user.create({
        data: {
          branchId: branch.id,
          email: p.email,
          firstName: p.firstName,
          lastName: p.lastName,
          role: p.role,
          password: hash,
          permissions: JSON.stringify(p.seeded ? seededPermissions(p.role) : permissionsFor(p.prefixes)),
        },
      });
      stack.users[p.key] = { id: user.id, email: p.email, password: PASSWORD, role: p.role, firstName: p.firstName, lastName: p.lastName };
    }

    const backendPort = await freePort();
    const bfd = logFd("backend");
    const backend = fork(path.join(__dirname, "backend.cjs"), [], {
      cwd: temp,
      env: { ...env, PORT: String(backendPort), STACK_PRIVATE_CLIENT: clientDir, STACK_DEPS_DIR: depsDir, NODE_PATH: path.join(depsDir, "node_modules") },
      stdio: ["ignore", bfd, bfd, "ipc"],
    });
    fs.closeSync(bfd);
    owned.children.push(backend);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(Error("Backend boot timeout (see backend.log)")), 120000);
      backend.once("message", () => {
        clearTimeout(t);
        resolve();
      });
      backend.once("exit", (code) => {
        clearTimeout(t);
        reject(Error(`Backend exited ${code} (see backend.log)`));
      });
    });
    stack.api = `http://127.0.0.1:${backendPort}`;

    const frontend = path.join(temp, "frontend");
    fs.mkdirSync(frontend);
    for (const name of ["src", "public", "package.json", "tsconfig.json", "tsconfig.build.json", "next.config.ts", "postcss.config.mjs", "postcss.config.js"]) {
      const from = path.join(root, "frontend", name);
      if (fs.existsSync(from))
        fs.cpSync(from, path.join(frontend, name), { recursive: true, filter: (p) => !path.basename(p).startsWith(".env") });
    }
    fs.symlinkSync(path.join(root, "frontend/node_modules"), path.join(frontend, "node_modules"));
    fs.symlinkSync(path.join(root, "shared-types"), path.join(temp, "shared-types"));
    const nextPort = await freePort();
    const ffd = logFd("frontend");
    const next = spawn(
      process.execPath,
      [createRequire(path.join(root, "frontend/package.json")).resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(nextPort)],
      {
        cwd: frontend,
        env: { ...env, NEXT_PUBLIC_API_PROXY: stack.api, NODE_ENV: "development" },
        stdio: ["ignore", ffd, ffd],
        detached: true,
      },
    );
    fs.closeSync(ffd);
    next.detachedGroup = true;
    owned.children.push(next);
    stack.base = `http://127.0.0.1:${nextPort}`;
    for (let i = 0; ; i++) {
      if (next.exitCode !== null) throw Error("Frontend exited (see frontend.log)");
      if (i > 300) throw Error("Frontend readiness timed out (see frontend.log)");
      try {
        if ((await fetch(`${stack.base}/login`, { signal: AbortSignal.timeout(60000) })).ok) break;
      } catch {}
      await sleep(400);
    }

    stack.login = async (page, who) => {
      const user = stack.users[who];
      assert(user, `Unknown user ${who}`);
      await page.goto(`${stack.base}/login`, { waitUntil: "domcontentloaded" });
      const status = await page.evaluate(
        async ({ identifier, password }) =>
          (await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier, password }),
          })).status,
        { identifier: user.email, password: user.password },
      );
      assert.equal(status, 201, `login ${who} returned ${status}`);
      return user;
    };
    return stack;
  } catch (error) {
    await stack.stop();
    throw error;
  }
}

module.exports = { bootStack };
