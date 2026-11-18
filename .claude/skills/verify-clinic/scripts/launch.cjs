#!/usr/bin/env node
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "../../../..");
const { bootStack } = require(path.join(root, "scripts/stack/boot.cjs"));

const name = (process.argv.includes("--name") ? process.argv[process.argv.indexOf("--name") + 1] : "default").replace(/[^A-Za-z0-9_-]/g, "_");
const stateDir = path.join(root, "output/verify-clinic/instances");
const stateFile = path.join(stateDir, `${name}.json`);

function replaceBootSignalHandlers(stop) {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.removeAllListeners(signal);
    process.on(signal, stop);
  }
}

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
  replaceBootSignalHandlers(stop);
  console.log(`READY ${stateFile} base=${stack.base} api=${stack.api} boot=${state.bootSeconds}s`);
  setInterval(() => {}, 1 << 30);
})().catch((e) => {
  console.error("LAUNCH FAIL", e.stack || e);
  fs.rmSync(stateFile, { force: true });
  process.exit(1);
});
