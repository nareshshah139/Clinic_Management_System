#!/usr/bin/env node
// A stand-in for the Meta WhatsApp Cloud API, for a verify-clinic stack.
// CLI: starts the fake Graph endpoint, writes the launch env file and keeps recording sends.
// Library: reads recorded sends and signs inbound webhook events for a driver.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { outRoot, arg } = require("./lib.cjs");

const IST_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const dir = path.join(outRoot, "fake-meta");
const files = (name) => ({ state: path.join(dir, `${name}.json`), sends: path.join(dir, `${name}.sends.jsonl`), env: path.join(dir, `${name}.env`) });

// The scheduler clock lands on 10:00 IST, `days` IST days after today, so its window opens and care messages may send.
function clockOffsetMs(days, now = Date.now()) {
  const todayIst = new Date(now + IST_MS).toISOString().slice(0, 10);
  return Date.parse(`${todayIst}T10:00:00.000Z`) - IST_MS + days * DAY_MS - now;
}

function loadFake(name = arg("fake", "default")) {
  const f = files(name);
  if (!fs.existsSync(f.state)) throw Error(`No fake Meta "${name}" (${f.state} missing). Start fake-meta.cjs first.`);
  return { ...JSON.parse(fs.readFileSync(f.state, "utf8")), ...f };
}

function sends(fake) {
  if (!fs.existsSync(fake.sends)) return [];
  return fs.readFileSync(fake.sends, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

const templateOf = (s) => s.body?.template?.name ?? (s.body?.type === "text" ? "text" : s.body?.type);
const bodyParams = (s) => (s.body?.template?.components ?? []).find((c) => c.type === "body")?.parameters?.map((p) => p.text) ?? [];
const urlButtonParam = (s) => (s.body?.template?.components ?? []).find((c) => c.type === "button" && c.sub_type === "url")?.parameters?.[0]?.text ?? null;

async function waitForSend(fake, match, { timeoutMs = 7 * 60 * 1000, label = "send" } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = sends(fake).find(match);
    if (hit) return hit;
    if (Date.now() > deadline) throw Error(`fake Meta saw no ${label} in ${Math.round(timeoutMs / 1000)}s`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// Posts a webhook body to the stack exactly as Meta does: raw JSON bytes signed with the app secret.
async function deliverWebhook(fake, state, value) {
  const raw = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "fake-waba", changes: [{ field: "messages", value: { messaging_product: "whatsapp", ...value } }] }] }));
  const signature = `sha256=${crypto.createHmac("sha256", fake.appSecret).update(raw).digest("hex")}`;
  const res = await fetch(`${state.api}/webhooks/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature }, body: raw });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const inboundText = (fromE164, text, extra = {}) => ({
  messages: [{ id: `wamid.in.${crypto.randomUUID()}`, from: fromE164.replace(/\D/g, ""), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text }, ...extra }],
});

module.exports = { loadFake, sends, templateOf, bodyParams, urlButtonParam, waitForSend, deliverWebhook, inboundText, clockOffsetMs };

if (require.main === module) {
  const name = arg("name", "default").replace(/[^A-Za-z0-9_-]/g, "_");
  const days = Number(arg("advance-days", "0"));
  const f = files(name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(f.sends, "");
  const appSecret = crypto.randomBytes(24).toString("hex");
  let counter = 0;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const ok = req.method === "POST" && /\/messages$/.test(req.url) && req.headers.authorization === "Bearer fake-meta-token";
      const id = `wamid.fake.${name}.${++counter}`;
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch {}
      fs.appendFileSync(f.sends, `${JSON.stringify({ at: new Date().toISOString(), path: req.url, authorized: ok, id: ok ? id : null, body })}\n`);
      res.writeHead(ok ? 200 : 401, { "Content-Type": "application/json" });
      res.end(JSON.stringify(ok ? { messaging_product: "whatsapp", contacts: [{ wa_id: body?.to }], messages: [{ id }] } : { error: { message: "fake Meta: bad path or token", code: 190 } }));
    });
  });
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    const offset = days ? clockOffsetMs(days) : 0;
    fs.writeFileSync(f.env, [
      `WHATSAPP_TOKEN=fake-meta-token`,
      `WHATSAPP_PHONE_NUMBER_ID=100000000000001`,
      `WHATSAPP_GRAPH_BASE_URL=http://127.0.0.1:${port}/v18.0`,
      `WHATSAPP_APP_SECRET=${appSecret}`,
      `WHATSAPP_VERIFY_TOKEN=fake-verify-${name}`,
      `CLINIC_NAME=Lakshmi Family Clinic`,
      `CLINIC_PHONE=+914040001234`,
      ...(offset ? [`MESSAGING_CLOCK_OFFSET_MS=${offset}`] : []),
      "",
    ].join("\n"));
    fs.writeFileSync(f.state, JSON.stringify({ name, pid: process.pid, port, appSecret, clockOffsetMs: offset, advanceDays: days, startedAt: new Date().toISOString() }, null, 2));
    console.log(`FAKE META READY port=${port} env=${f.env} sends=${f.sends}${offset ? ` clockOffsetMs=${offset}` : ""}`);
  });
  const stop = () => { fs.rmSync(f.state, { force: true }); server.close(() => process.exit(0)); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
