#!/usr/bin/env node
// Read-only: is this instance worth driving? Exit 0 = healthy, 1 = not.
// Usage: node .claude/skills/verify-clinic/scripts/doctor.cjs [--instance default]
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { root, arg, loadState, pidAlive, sql, checker } = require("./lib.cjs");

(async () => {
  const c = checker();
  let state;
  try {
    state = loadState(arg("instance", "default"));
  } catch (e) {
    c.ok("instance state file exists", false, e.message);
    process.exit(1);
  }
  c.ok(`launcher pid ${state.pid} alive (booted ${state.bootedAt})`, pidAlive(state.pid));
  const get = async (url) => {
    try {
      return (await fetch(url, { signal: AbortSignal.timeout(60000) })).status;
    } catch (e) {
      return e.message;
    }
  };
  c.ok(`frontend ${state.base}/login answers 200`, (await get(`${state.base}/login`)) === 200);
  c.ok(`backend ${state.api}/health answers 200`, (await get(`${state.api}/health`)) === 200);
  const login = await fetch(`${state.api}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: state.users.pharmacist.email, password: state.users.pharmacist.password }),
  }).then((r) => r.status, (e) => e.message);
  c.ok("pharmacist credentials accepted (429 = throttled, still healthy)", login === 201 || login === 429, login);
  try {
    const [row] = sql(state, `SELECT count(*)::int AS users FROM users`);
    c.ok(`private schema ${state.schema} reachable (${row.users} users)`, row.users >= 4, row);
  } catch (e) {
    c.ok(`private schema ${state.schema} reachable`, false, e.message.split("\n")[0]);
  }
  const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  c.ok("git HEAD unchanged since boot (else relaunch)", !state.gitHead || state.gitHead === head, { booted: state.gitHead, now: head });
  // boot.cjs copies frontend/src into a temp dir and ts-node loads backend/src at boot:
  // edits made after boot are NOT served. Flag them so nobody verifies stale code.
  const booted = Date.parse(state.bootedAt);
  const changed = execFileSync("git", ["-C", root, "status", "--porcelain", "--", "frontend/src", "backend/src", "backend/prisma"], { encoding: "utf8" })
    .split("\n").filter(Boolean).map((l) => l.slice(3))
    .filter((f) => fs.existsSync(path.join(root, f)) && fs.statSync(path.join(root, f)).mtimeMs > booted);
  c.ok("no app source edited since boot (else relaunch)", changed.length === 0, changed.slice(0, 10));
  console.log(c.failed.length ? `DOCTOR UNHEALTHY (${c.failed.length} failed)` : `DOCTOR OK base=${state.base} api=${state.api}`);
  process.exit(c.failed.length ? 1 : 0);
})();
