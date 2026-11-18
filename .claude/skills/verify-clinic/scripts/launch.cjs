#!/usr/bin/env node
// Boots one isolated clinic stack (private Postgres schema + NestJS API + Next dev server)
// through the repo's own scripts/stack/boot.cjs, writes its handles to a state file, and
// stays alive until SIGINT/SIGTERM, at which point boot.cjs drops the schema and kills
// only the children it started.
//
// Usage: [STACK_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/clinic_stack] \
//          node .claude/skills/verify-clinic/scripts/launch.cjs [--name NAME]
// Ready when the state file exists and stdout prints "READY <state-file>".
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "../../../..");
const { bootStack } = require(path.join(root, "scripts/stack/boot.cjs"));

const name = (process.argv.includes("--name") ? process.argv[process.argv.indexOf("--name") + 1] : "default").replace(/[^A-Za-z0-9_-]/g, "_");
const stateDir = path.join(root, "output/verify-clinic/instances");
const stateFile = path.join(stateDir, `${name}.json`);

(async () => {
  if (fs.existsSync(stateFile)) {
    const prior = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    let alive = false;
    try { process.kill(prior.pid, 0); alive = true; } catch {}
    if (alive) throw Error(`Instance "${name}" already running as pid ${prior.pid}; use --name for a second one or stop.cjs first`);
    fs.rmSync(stateFile);
  }
  const started = Date.now();
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/clinic_stack", label: `verify-clinic-${name}` });
  fs.mkdirSync(stateDir, { recursive: true });
  const state = {
    name, pid: process.pid, base: stack.base, api: stack.api, schema: stack.schema, branchId: stack.branch.id,
    logs: stack.output, users: stack.users,
    gitHead: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), bootedAt: new Date().toISOString(), bootSeconds: (Date.now() - started) / 1000,
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log("STOPPING");
    fs.rmSync(stateFile, { force: true });
    await stack.stop();
    console.log("STOPPED");
    process.exit(0);
  };
  // boot.cjs installs its own SIGINT/SIGTERM handlers that exit(130) as soon as its live set is
  // empty, which happens synchronously inside stack.stop(), so the schema drop would never run.
  // Take sole ownership of the signals so stop() always finishes.
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log(`READY ${stateFile} base=${stack.base} api=${stack.api} boot=${state.bootSeconds}s`);
  setInterval(() => {}, 1 << 30);
})().catch((e) => {
  console.error("LAUNCH FAIL", e.stack || e);
  fs.rmSync(stateFile, { force: true });
  process.exit(1);
});
