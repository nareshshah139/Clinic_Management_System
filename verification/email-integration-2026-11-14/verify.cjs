const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { bootStack } = require("../../scripts/stack/boot.cjs");

const out = path.resolve(__dirname, "../../output/stack/email-integration-verify");
const mailLog = path.join(out, "mail.log");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const n = s.address().port;
  await new Promise((r) => s.close(r));
  return n;
}

const mails = () => (fs.existsSync(mailLog) ? fs.readFileSync(mailLog, "utf8").split("=====END=====\n").filter(Boolean) : []);
const to = (addr) => mails().filter((m) => new RegExp(`^To: ${addr}$`, "mi").test(m));

async function waitFor(fn, label, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(250);
  }
  assert.fail(`timed out: ${label}`);
}

(async () => {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const smtpPort = await freePort();
  const sink = spawn("python3", ["-I", path.join(__dirname, "smtp_sink.py"), String(smtpPort), mailLog], { stdio: "inherit" });
  const stack = await bootStack({
    databaseUrl: process.env.STACK_DATABASE_URL,
    label: "email-integration",
    env: { SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtpPort), SMTP_USER: "sink", SMTP_PASS: "sink", SMTP_FROM: "frontdesk@stack.example.invalid" },
  });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const doctor = await stack.login(page, "doctor");
    await page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded" });
    const api = (method, url, body) =>
      page.evaluate(
        async ({ method, url, body }) => {
          const r = await fetch(`/api${url}`, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
          return { status: r.status, body: await r.json().catch(() => null) };
        },
        { method, url, body },
      );

    const status = await api("GET", "/notifications/email/status");
    assert.deepEqual(status, { status: 200, body: { configured: true, from: "frontdesk@stack.example.invalid" } }, "status endpoint reports the sender");
    console.log("PASS status endpoint");

    const openSettings = async () => {
      await page.getByText("Your queue today").waitFor({ timeout: 120000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      for (let i = 0; i < 10 && !(await page.getByRole("dialog", { name: "My Settings" }).isVisible()); i++) {
        await page.getByRole("button", { name: "Open settings" }).click();
        await sleep(1000);
      }
      await page.getByText("Sending from frontdesk@stack.example.invalid").waitFor().catch(async (e) => {
        await page.screenshot({ path: path.join(out, "settings-failure.png") });
        throw e;
      });
    };
    await openSettings();
    await page.screenshot({ path: path.join(out, "my-settings.png") });
    await page.getByRole("button", { name: "Send test email" }).click();
    await page.getByText(`Check the inbox of ${doctor.email}.`).waitFor();
    await waitFor(() => to(doctor.email).length === 1, "test email reaches the doctor");
    assert.match(to(doctor.email)[0], /^Subject: Test email from your clinic$/m, "test email subject");
    console.log("PASS UI test email delivered over SMTP");
    await page.keyboard.press("Escape");

    const patient = await api("POST", "/patients", { name: "Meera Kulkarni", gender: "F", phone: "+919812300001", email: "meera.k@stack.example.invalid", age: 34 });
    assert.equal(patient.status, 201, `create patient ${JSON.stringify(patient.body)}`);
    const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const book = (slot) => api("POST", "/appointments", { patientId: patient.body.id, doctorId: doctor.id, date, slot, visitType: "OPD", allowOverbook: true });

    const first = await book("10:00-10:15");
    assert.equal(first.status, 201, `book first ${JSON.stringify(first.body)}`);
    await waitFor(() => to("meera.k@stack.example.invalid").length === 1, "confirmation email with default setting");
    assert.match(to("meera.k@stack.example.invalid")[0], /^Subject: Appointment Confirmation$/m);
    console.log("PASS confirmation email sent by default");

    await openSettings();
    const toggle = page.getByRole("switch", { name: "Email patients on appointment creation" });
    assert.equal(await toggle.getAttribute("aria-checked"), "true", "toggle starts on");
    await toggle.click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Messaging preferences updated.").first().waitFor();
    const me = await api("GET", `/users/${doctor.id}`);
    const meta = typeof me.body?.metadata === "string" ? JSON.parse(me.body.metadata) : me.body?.metadata;
    assert.equal(meta?.emailAutoConfirmAppointments, false, `saved opt-out ${JSON.stringify(me.body?.metadata)}`);

    const second = await book("11:00-11:15");
    assert.equal(second.status, 201, `book second ${JSON.stringify(second.body)}`);
    await sleep(3000);
    assert.equal(to("meera.k@stack.example.invalid").length, 1, "no email after opting out");
    console.log("PASS opt-out persists and suppresses the confirmation email");

    await openSettings();
    assert.equal(await page.getByRole("switch", { name: "Email patients on appointment creation" }).getAttribute("aria-checked"), "false", "toggle reloads off");
    await page.screenshot({ path: path.join(out, "my-settings-opted-out.png") });
    console.log("EMAIL INTEGRATION PASS");
  } finally {
    await browser.close();
    await stack.stop();
    sink.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
