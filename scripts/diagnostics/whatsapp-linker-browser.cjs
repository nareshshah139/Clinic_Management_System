// Links a clinic WhatsApp number in Clinic profile and sends a test prescription, against a
// local fake of the WhatsApp Cloud API. Nothing reaches graph.facebook.com.
// Usage: STACK_DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/db node scripts/diagnostics/whatsapp-linker-browser.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const puppeteer = require("puppeteer-core");
const bcrypt = require("bcryptjs");
const { bootStack } = require("../stack/boot.cjs");

const root = path.resolve(__dirname, "../..");
const out = process.env.WHATSAPP_PROOF_DIR || path.join(root, "verification/whatsapp-linker-2026-11-14");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
const PHONE_ID = "106540352242922";
const WABA_ID = "102290129340398";
const FAKE_TOKEN = "EAAG-local-fake-token-not-a-secret";
const APP_SECRET = "local-proof-app-secret";
const VERIFY_TOKEN = "local-proof-verify-token";
const NOT_ALLOWED = "919000000000";

function multipart(body, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
  const parts = {};
  if (!boundary) return parts;
  const marker = Buffer.from(`--${boundary[1] || boundary[2]}`);
  let at = body.indexOf(marker);
  while (at !== -1) {
    const next = body.indexOf(marker, at + marker.length);
    if (next === -1) break;
    const part = body.subarray(at + marker.length + 2, next - 2);
    const split = part.indexOf("\r\n\r\n");
    const head = part.subarray(0, split).toString();
    const name = /name="([^"]+)"/.exec(head)?.[1];
    if (name) parts[name] = { filename: /filename="([^"]+)"/.exec(head)?.[1] ?? null, bytes: part.subarray(split + 4) };
    at = next;
  }
  return parts;
}

function fakeGraph() {
  const log = [];
  const uploads = [];
  let sequence = 0;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url, "http://graph.local");
      const body = Buffer.concat(chunks);
      const entry = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), authorized: req.headers.authorization === `Bearer ${FAKE_TOKEN}` };
      const reply = (status, json) => {
        entry.status = status;
        entry.response = json;
        log.push(entry);
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (!entry.authorized) return reply(401, { error: { message: "Invalid OAuth access token.", type: "OAuthException", code: 190 } });
      if (req.method === "GET" && url.pathname === `/v21.0/${PHONE_ID}`)
        return reply(200, { display_phone_number: "+91 20 2555 0199", verified_name: "Lakshmi Family Clinic", quality_rating: "GREEN", id: PHONE_ID });
      if (req.method === "GET" && url.pathname === `/v21.0/${WABA_ID}/message_templates`)
        return reply(200, {
          data: [
            { name: "prescription_ready", language: "en", status: "APPROVED", category: "UTILITY", components: [
              { type: "HEADER", format: "DOCUMENT" },
              { type: "BODY", text: "Hello {{1}}, {{2}} has shared your prescription. It is attached as a PDF." },
              { type: "FOOTER", text: "Reply to this message for help." },
            ] },
            { name: "appointment_reminder", language: "en", status: "APPROVED", category: "UTILITY", components: [{ type: "HEADER", format: "TEXT", text: "Reminder" }, { type: "BODY", text: "See you {{1}}" }] },
          ],
          paging: { cursors: { before: "a", after: "b" } },
        });
      if (req.method === "POST" && url.pathname === `/v21.0/${PHONE_ID}/media`) {
        const parts = multipart(body, req.headers["content-type"] || "");
        const file = parts.file;
        const id = `media-${++sequence}`;
        uploads.push({ id, filename: file?.filename, bytes: file?.bytes });
        entry.form = { messaging_product: parts.messaging_product?.bytes.toString(), type: parts.type?.bytes.toString(), file: file && { filename: file.filename, size: file.bytes.length, head: file.bytes.subarray(0, 8).toString("latin1") } };
        return reply(200, { id });
      }
      if (req.method === "POST" && url.pathname === `/v21.0/${PHONE_ID}/messages`) {
        entry.json = JSON.parse(body.toString());
        if (entry.json.to === NOT_ALLOWED)
          return reply(400, { error: { message: "(#131030) Recipient phone number not in allowed list", type: "OAuthException", code: 131030, error_data: { messaging_product: "whatsapp", details: "Recipient phone number not in allowed list: Add recipient phone number to recipient list and try again." } } });
        return reply(200, { messaging_product: "whatsapp", contacts: [{ input: entry.json.to, wa_id: entry.json.to }], messages: [{ id: `wamid.LOCALFAKE${String(++sequence).padStart(4, "0")}` }] });
      }
      reply(404, { error: { message: `Unknown path ${url.pathname}`, code: 803 } });
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, log, uploads, base: `http://127.0.0.1:${server.address().port}` })));
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const graph = await fakeGraph();
  const stack = await bootStack({
    databaseUrl: process.env.STACK_DATABASE_URL,
    label: "whatsapp-linker",
    backendEnv: { WHATSAPP_GRAPH_BASE_URL: graph.base, META_APP_SECRET: APP_SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN },
  });
  let browser;
  const checks = [];
  const pass = (text) => {
    checks.push(text);
    console.log("PASS", text);
  };
  try {
    console.log(`BOOT base=${stack.base} api=${stack.api} graph=${graph.base}`);
    const db = stack.db;
    await db.branch.update({ where: { id: stack.branch.id }, data: { phone: "+91 20 2555 0101" } });
    const admin = await db.user.create({
      data: { branchId: stack.branch.id, email: "meera.kulkarni@stack.example.invalid", firstName: "Meera", lastName: "Kulkarni", role: "ADMIN", password: await bcrypt.hash(stack.users.owner.password, 4), permissions: "[]" },
    });
    stack.users.admin = { id: admin.id, email: admin.email, password: stack.users.owner.password, role: "ADMIN" };

    browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args: ["--no-first-run", "--no-sandbox"], protocolTimeout: 120000 });
    const page = await browser.newPage();
    page.setDefaultTimeout(90000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewport({ width: 1280, height: 1700, deviceScaleFactor: 2 });
    await stack.login(page, "admin");
    const shot = (name) => page.screenshot({ path: path.join(out, name), fullPage: true });
    const text = (selector) => page.$eval(selector, (el) => el.textContent.trim());
    const waitText = (needle) => page.waitForFunction((n) => document.body.innerText.includes(n), { timeout: 90000 }, needle);

    await page.goto(`${stack.base}/dashboard/clinic`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForSelector('form[aria-label="Link WhatsApp"]', { timeout: 180000 });
    assert.equal(await text('[data-testid="clinic-name"]'), "Lakshmi Family Clinic");
    assert.ok(await page.$('nav[aria-label="Main navigation"] a[href="/dashboard/clinic"]'), "Clinic profile is in the admin's navigation");
    await shot("01-clinic-profile-unlinked.png");
    pass("Admin opens Clinic profile from the navigation; branch details and the unlinked WhatsApp card show");

    await page.locator("::-p-aria(Phone number ID)").fill(PHONE_ID);
    await page.locator("::-p-aria(WhatsApp Business Account ID (optional))").fill(WABA_ID);
    await page.locator("::-p-aria(Access token)").fill(FAKE_TOKEN);
    await page.locator("::-p-aria([name='Link WhatsApp'][role='button'])").click();
    await page.waitForSelector('[data-testid="whatsapp-verified-name"]');
    assert.equal(await text('[data-testid="whatsapp-verified-name"]'), "Lakshmi Family Clinic");
    await waitText("High quality");
    const stored = await db.whatsAppConnection.findUnique({ where: { branchId: stack.branch.id } });
    assert.equal(stored.accessTokenCipher.includes(FAKE_TOKEN), false, "token is stored as ciphertext");
    const viewed = await page.evaluate(async () => (await fetch("/api/whatsapp/connection")).text());
    assert.equal(viewed.includes(FAKE_TOKEN) || viewed.includes(stored.accessTokenCipher), false, "GET connection never returns the token or cipher");
    pass("Linking verifies the number with WhatsApp, stores only ciphertext, and GET /whatsapp/connection omits token and cipher");

    await page.waitForFunction(() => document.querySelector("select")?.options.length === 2);
    await page.select("select", "prescription_ready|en");
    await waitText("Prescriptions are sent with prescription_ready (en).");
    const savedTemplate = await db.whatsAppConnection.findUnique({ where: { branchId: stack.branch.id } });
    assert.deepEqual([savedTemplate.prescriptionTemplateName, savedTemplate.prescriptionTemplateLanguage, savedTemplate.prescriptionTemplateBodyParams], ["prescription_ready", "en", 2]);
    await shot("02-linked-template-chosen.png");
    pass("Only the approved document-header template is offered; choosing it stores 2 body values from Meta's copy");

    await page.locator("::-p-aria(WhatsApp number)").fill("+91 9704802443");
    await page.locator("::-p-aria([name='Send test prescription'][role='button'])").click();
    await page.waitForSelector('[data-testid="test-send-result"][role="status"]');
    const accepted = await text('[data-testid="test-send-result"]');
    const wamid = /Message ID (wamid\.\S+)\.$/.exec(accepted)?.[1];
    assert.ok(wamid, `accepted message shows the message id: ${accepted}`);
    const upload = graph.uploads.at(-1);
    assert.equal(upload.bytes.subarray(0, 5).toString(), "%PDF-");
    fs.writeFileSync(path.join(out, "sample-prescription.pdf"), upload.bytes);
    const sent = graph.log.filter((e) => e.path.endsWith("/messages")).at(-1).json;
    assert.deepEqual(sent, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "919704802443",
      type: "template",
      template: {
        name: "prescription_ready",
        language: { code: "en" },
        components: [
          { type: "header", parameters: [{ type: "document", document: { id: upload.id, filename: "sample-prescription.pdf" } }] },
          { type: "body", parameters: [{ type: "text", text: "Test Patient" }, { type: "text", text: "Dr. Meera Kulkarni" }] },
        ],
      },
    });
    const pdfText = execFileSync("pdftotext", ["-", "-"], { input: upload.bytes }).toString();
    for (const line of ["Lakshmi Family Clinic", "12 MG Road, Pune 411001", "+91 20 2555 0101", "SAMPLE - NOT FOR CLINICAL USE", "Test Patient", "Dr. Meera Kulkarni", "Paracetamol 500 mg tablet", "Cetirizine 10 mg tablet"])
      assert.ok(pdfText.includes(line), `sample PDF contains ${line}`);
    execFileSync("pdftoppm", ["-png", "-r", "110", "-singlefile", path.join(out, "sample-prescription.pdf"), path.join(out, "05-sample-prescription-page1")]);
    await shot("03-test-prescription-accepted.png");
    pass(`Test prescription to +91 9704802443: PDF upload starts %PDF-, template message to 919704802443 carries the document header and [Test Patient, Dr. Meera Kulkarni]; UI shows ${wamid}`);

    await page.locator("::-p-aria(WhatsApp number)").fill("+91 90000 00000");
    await page.locator("::-p-aria([name='Send test prescription'][role='button'])").click();
    await page.waitForSelector('[data-testid="test-send-result"][role="alert"]');
    assert.equal(
      await text('[data-testid="test-send-result"]'),
      "This number is not in the allowed list of the Meta test number. Add it under WhatsApp > API Setup in Meta, or link the clinic's live number.",
    );
    await shot("04-test-refused-with-reason.png");
    pass("A number Meta refuses (131030) shows the mapped reason instead of success");

    const patient = await db.patient.create({ data: { branchId: stack.branch.id, name: "Asha Verma", gender: "F", phone: "9704802443" } });
    const visit = await db.visit.create({ data: { patientId: patient.id, doctorId: stack.users.doctor.id, complaints: "Itchy rash on forearms" } });
    const rx = await db.prescription.create({ data: { visitId: visit.id, status: "ACTIVE", items: JSON.stringify([{ drugName: "Cetirizine 10mg Tab", quantity: 10, frequency: "ONCE_DAILY", duration: 10, durationUnit: "DAYS" }]) } });
    const share = await page.evaluate(async (id) => {
      const res = await fetch(`/api/prescriptions/${id}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: "WHATSAPP", to: "+91 97048 02443" }) });
      return { status: res.status, body: await res.json() };
    }, rx.id);
    const shared = graph.log.filter((e) => e.path.endsWith("/messages")).at(-1).json;
    assert.deepEqual([share.status, share.body.status, shared.to, shared.template.components[1].parameters.map((p) => p.text)], [201, "ACCEPTED", "919704802443", ["Asha Verma", "Dr. Priya Menon"]]);
    assert.equal(graph.uploads.at(-1).bytes.subarray(0, 5).toString(), "%PDF-");
    const events = await db.prescriptionPrintEvent.findMany({ where: { prescriptionId: rx.id } });
    assert.deepEqual(events.map((e) => e.eventType), ["WHATSAPP_SHARE"]);
    pass(`Sharing a saved prescription by WhatsApp returns ACCEPTED ${share.body.wamid} and records one print event`);

    const delivery = (status, id) => JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: WABA_ID, changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: PHONE_ID }, statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: "919704802443" }] } }] }] });
    const post = (body, signature) => fetch(`${stack.api}/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json", ...(signature ? { "X-Hub-Signature-256": signature } : {}) }, body });
    const sign = (body, secret) => `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
    const challenge = await fetch(`${stack.api}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=8675309`);
    assert.deepEqual([challenge.status, await challenge.text()], [200, "8675309"]);
    const body = delivery("delivered", wamid);
    assert.equal((await post(body)).status, 401);
    assert.equal((await post(body, sign(body, "wrong-secret"))).status, 401);
    const signed = await post(body, sign(body, APP_SECRET));
    assert.deepEqual([signed.status, await signed.json()], [200, { updated: 1 }]);
    const sentAgain = delivery("sent", wamid);
    assert.deepEqual(await (await post(sentAgain, sign(sentAgain, APP_SECRET))).json(), { updated: 0 });
    pass("Webhook answers Meta's challenge, rejects unsigned and wrongly signed deliveries, applies the signed 'delivered', and ignores a late 'sent'");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction((id) => {
      const rows = [...document.querySelectorAll('[data-testid="whatsapp-message"]')];
      return rows.length === 2 && rows.some((r) => r.textContent.startsWith("Test prescription to +919704802443") && r.textContent.endsWith("Delivered"));
    }, { timeout: 60000 }, wamid);
    const rows = await page.$$eval('[data-testid="whatsapp-message"]', (els) => els.map((e) => e.textContent));
    assert.deepEqual(rows.map((r) => r.replace(/\d{2} \w{3} \d{4}, \d{2}:\d{2} [ap]m/, "<time>")), [
      "Prescription to +919704802443<time>Accepted",
      "Test prescription to +919704802443<time>Delivered",
    ]);
    await shot("06-recent-messages-delivered.png");
    pass("After reload, recent messages show the test prescription as Delivered and the shared prescription as Accepted");

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal scroll at 390px");
    await shot("07-clinic-profile-mobile.png");
    pass("Clinic profile fits a 390px phone without horizontal scroll");

    assert.deepEqual(errors, []);
    const redacted = graph.log.map((e) => ({ ...e, authorization: e.authorized ? "Bearer <fake token>" : "missing or wrong" }));
    fs.writeFileSync(path.join(out, "graph-requests.json"), `${JSON.stringify(redacted, null, 2)}\n`);
    fs.writeFileSync(path.join(out, "checks.txt"), `${checks.map((c) => `PASS ${c}`).join("\n")}\n`);
    console.log(`DONE ${checks.length} checks, ${graph.log.length} Graph requests logged to ${path.relative(root, out)}`);
  } finally {
    await browser?.close();
    await stack.stop();
    graph.server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
