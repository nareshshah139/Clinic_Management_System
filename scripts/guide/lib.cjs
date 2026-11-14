const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const stack = JSON.parse(fs.readFileSync(path.join(root, "output/stack/guide/stack.json"), "utf8"));

async function login(page, who = "admin") {
  const user = stack.users[who];
  await page.goto(`${stack.base}/login`, { waitUntil: "domcontentloaded" });
  let status;
  for (let attempt = 0; attempt < 15; attempt++) {
    status = await page.evaluate(
      async ({ identifier, password }) =>
        (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) })).status,
      { identifier: user.email, password: user.password },
    );
    if (status !== 429) break;
    await page.waitForTimeout(10000);
  }
  if (status !== 201) throw Error(`login ${who} returned ${status}`);
}

const tokens = {};
async function api(who, method, route, body, headers = {}) {
  if (!tokens[who]) {
    const user = stack.users[who];
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${stack.api}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: user.email, password: user.password }) });
      if (res.status === 429 && attempt < 15) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        continue;
      }
      if (!res.ok) throw Error(`sign-in for ${who} returned ${res.status}`);
      const cookie = res.headers.get("set-cookie") || "";
      const data = await res.json().catch(() => ({}));
      tokens[who] = { bearer: data.access_token || data.accessToken || data.token, cookie: cookie.split(",").map((c) => c.split(";")[0].trim()).join("; ") };
      break;
    }
  }
  const t = tokens[who];
  const res = await fetch(`${stack.api}${route}`, {
    method,
    headers: { "Content-Type": "application/json", ...(t.bearer ? { Authorization: `Bearer ${t.bearer}` } : {}), ...(t.cookie ? { Cookie: t.cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw Object.assign(Error(`${method} ${route} -> ${res.status} ${text.slice(0, 400)}`), { status: res.status, data });
  return data;
}

function db() {
  const os = require("node:os");
  const crypto = require("node:crypto");
  const source = fs.readFileSync(path.join(root, "backend/prisma/schema.prisma"), "utf8");
  const hash = crypto.createHash("sha256").update(source).digest("hex").slice(0, 16);
  const { PrismaClient } = require(path.join(os.tmpdir(), `clinic-stack-client-${hash}`, "client"));
  const url = new URL(process.env.STACK_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres");
  url.searchParams.set("schema", stack.schema);
  return new PrismaClient({ datasourceUrl: url.toString() });
}

module.exports = { root, stack, login, api, db };
