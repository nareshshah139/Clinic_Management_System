#!/usr/bin/env node
// Stops the instance this skill launched (by the pid in its state file, never by process name).
// The launcher's SIGTERM handler drops the private schema and kills only its own children.
// Evidence under output/verify-clinic/evidence/ is never touched.
// Usage: node .claude/skills/verify-clinic/scripts/stop.cjs [--instance default]
const fs = require("node:fs");
const path = require("node:path");
const { outRoot, arg, pidAlive } = require("./lib.cjs");

(async () => {
  const name = arg("instance", "default");
  const file = path.join(outRoot, "instances", `${name}.json`);
  if (!fs.existsSync(file)) {
    console.log(`No state file for "${name}"; nothing to stop.`);
    return;
  }
  const { pid } = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!pidAlive(pid)) {
    fs.rmSync(file, { force: true });
    console.log(`pid ${pid} already gone; removed stale state. Its schema is swept on the next launch.`);
    return;
  }
  process.kill(pid, "SIGTERM");
  for (let i = 0; i < 100 && pidAlive(pid); i++) await new Promise((r) => setTimeout(r, 200));
  if (pidAlive(pid)) {
    console.log(`pid ${pid} ignored SIGTERM for 20s; sending SIGKILL (schema left for the next launch's sweep).`);
    process.kill(pid, "SIGKILL");
  }
  fs.rmSync(file, { force: true });
  console.log(`STOPPED ${name} (pid ${pid})`);
})();
