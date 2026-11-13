// Keeps one seeded stack running so journeys can be written and replayed against it.
// Usage: STACK_DATABASE_URL=postgresql://user:pw@127.0.0.1:5432/db node scripts/ux/journeys/serve.cjs
const fs = require("node:fs");
const path = require("node:path");
const { bootStack } = require("../../stack/boot.cjs");
const { seed } = require("./seed.cjs");

(async () => {
  const stack = await bootStack({ label: "ux-serve" });
  const seeded = await seed(stack);
  const info = { base: stack.base, api: stack.api, users: stack.users, branch: stack.branch, seeded, pid: process.pid };
  fs.writeFileSync(path.join(stack.output, "info.json"), JSON.stringify(info, null, 2));
  console.log(`READY ${stack.base} (info: ${path.join(stack.output, "info.json")})`);
  setInterval(() => {}, 1 << 30);
})();
