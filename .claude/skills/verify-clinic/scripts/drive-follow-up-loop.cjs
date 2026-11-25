#!/usr/bin/env node
// Release 1b full loop on a verify-clinic stack launched with a fake Meta env file:
// confirm a number, complete a visit with a plan, let the shifted scheduler clock open the check-in,
// answer it with a photo at phone width, then reply in the 24h window and resolve the worklist items.
// Optional review-reminder leg (a second patient whose review is "tomorrow" on the shifted clock).
// Exits 0 only when every check passes.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { root, arg, flag, loadState, evidenceDir, sql, openPage, recorder, checker } = require("./lib.cjs");
const fake = require("./fake-meta.cjs");

const IST_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const STAFF_REPLY = "Please come in tomorrow at 10. Avoid scratching.";
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, ignoreHTTPSErrors: true };
// The patient page lives in the portal service (clinic-patient-portal); launch the stack with PORTAL_BASE_URL set to it.
const PORTAL = (arg("portal", process.env.PORTAL_BASE_URL) ?? "").replace(/\/$/, "");
const DESK = { viewport: { width: 1366, height: 900 } };
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const istDay = (ms) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const digits = (e164) => e164.replace(/\D/g, "");
const sentTo = (e164) => (s) => s.authorized && digits(String(s.body?.to ?? "")) === digits(e164);

async function main() {
  const state = loadState();
  const meta = fake.loadFake();
  const out = evidenceDir("follow-up-loop");
  const c = checker();
  const timings = {};
  const t0 = Date.now();
  const mark = (k) => (timings[k] = Math.round((Date.now() - t0) / 1000));
  const shot = async (page, name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  const skipReview = flag("no-review-leg");

  c.ok("fake Meta advanced the scheduler clock by at least 3 days", meta.advanceDays >= 3, meta);
  const shifted = Date.now() + meta.clockOffsetMs;
  const shiftedHour = new Date(shifted + IST_MS).getUTCHours();
  c.ok("shifted clock sits inside the 09:00-20:00 IST send window", shiftedHour >= 9 && shiftedHour < 19, { shiftedHour });
  if (c.failed.length) throw Error("fake Meta is not set up for this recipe; restart it with --advance-days 3 and relaunch the stack with its env file");

  const browser = await chromium.launch();
  const logs = {};
  try {
  const run = Date.now().toString().slice(-6);
  const mkPhone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  const patients = [
    { key: "loop", name: `Kavya Loop ${run}`, phone: mkPhone() },
    ...(skipReview ? [] : [{ key: "review", name: `Ravi Review ${run}`, phone: mkPhone() }]),
  ];

  // 0. The owner imports the reviewed plans and instruments (PP-24); a repeat import changes nothing.
  const owner = await openPage(browser, state, "owner", DESK);
  const imported = await owner.page.evaluate(async () => {
    const r = await fetch("/api/follow-ups/import", { method: "POST" });
    return { status: r.status, body: await r.json().catch(() => null) };
  });
  c.ok("owner import of follow-up plans succeeded", imported.status < 300, imported);
  await owner.context.close();
  const reuse = arg("patients", "");
  if (reuse) reuse.split(",").forEach((id, i) => patients[i] && Object.assign(patients[i], { id, reused: true }));
  // 1. Reception registers the patients and confirms each number with the code fake Meta received.
  const desk = await openPage(browser, state, "reception", DESK);
  logs.reception = recorder(desk.page, state);
  for (const p of patients.filter((x) => x.reused)) {
    const [row] = sql(state, `SELECT p.name, f."phoneE164" FROM patients p JOIN patient_portal_profiles f ON f."patientId" = p.id WHERE p.id = ${q(p.id)}`);
    Object.assign(p, { name: row.name, e164: row.phoneE164 });
  }
  for (const p of patients.filter((x) => !x.reused)) {
    const created = await desk.page.evaluate(async (body) => {
      const r = await fetch("/api/patients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json().catch(() => null) };
    }, { name: p.name, gender: "F", age: 34, phone: p.phone });
    c.ok(`registered ${p.key} patient`, created.status === 201 && created.body?.id, created);
    p.id = created.body.id;
    p.e164 = `+91${p.phone}`;
    await desk.page.goto(`${state.base}/dashboard/patients/${p.id}`, { waitUntil: "networkidle", timeout: 180000 });
    await desk.page.getByRole("button", { name: "Patient agreed to WhatsApp" }).click();
    await desk.page.locator("#whatsapp-code").waitFor();
    await shot(desk.page, `01-${p.key}-consent-pending`);
  }
  mark("consentRequested");
  for (const p of patients.filter((x) => !x.reused)) {
    const confirmation = await fake.waitForSend(meta, (s) => sentTo(p.e164)(s) && fake.templateOf(s) === "number_confirmation", { label: `number_confirmation to ${p.key}` });
    const code = fake.bodyParams(confirmation)[1];
    c.ok(`fake Meta received a 6-digit confirmation code for ${p.key}`, /^\d{6}$/.test(code ?? ""), fake.bodyParams(confirmation));
    await desk.page.goto(`${state.base}/dashboard/patients/${p.id}`, { waitUntil: "networkidle" });
    await desk.page.locator("#whatsapp-code").fill(code);
    await desk.page.getByRole("button", { name: "Confirm number" }).click();
    await desk.page.locator("#whatsapp-code").waitFor({ state: "detached" });
    await shot(desk.page, `02-${p.key}-number-confirmed`);
    const [profile] = sql(state, `SELECT "consentState", "phoneConfirmedAt" IS NOT NULL AS confirmed, "portalEnabled" FROM patient_portal_profiles WHERE "patientId" = ${q(p.id)}`);
    c.ok(`${p.key}: consent OPTED_IN with a confirmed number and the portal on`, profile?.consentState === "OPTED_IN" && profile.confirmed && profile.portalEnabled, profile);
  }
  mark("numbersConfirmed");

  // 2. The doctor completes a visit: the loop patient gets the two-week skin plan, the review patient a review tomorrow (shifted clock).
  const doc = await openPage(browser, state, "doctor", DESK);
  logs.doctor = recorder(doc.page, state);
  const reviewDay = istDay(shifted + DAY_MS);
  for (const p of patients) {
    await doc.page.goto(`${state.base}/dashboard/patients/${p.id}`, { waitUntil: "networkidle", timeout: 180000 });
    await doc.page.getByRole("button", { name: "Start new visit" }).click();
    await doc.page.waitForURL(/\/dashboard\/visits/, { timeout: 180000 });
    const complaints = doc.page.locator("#visit-chief-complaints");
    await complaints.waitFor({ timeout: 180000 });
    await complaints.fill("Itchy rash on forearms for two weeks");
    await doc.page.locator("#visit-diagnosis").fill("Contact dermatitis");
    const instructions = doc.page.locator("#visit-followup-instructions");
    if (!(await instructions.isVisible())) await doc.page.getByRole("button", { name: /Follow-up and language/ }).first().click();
    await instructions.fill(p.key === "loop" ? "Send photos on the check-in link" : "Review tomorrow");
    if (p.key === "loop") {
      const picker = doc.page.locator("#follow-up-plan");
      await picker.waitFor();
      const firstOption = await picker.locator("option").first().textContent();
      c.ok("plan picker lists No follow-up first", firstOption?.trim() === "No follow-up", firstOption);
      await picker.selectOption({ label: "Two-week skin check" });
    } else {
      await doc.page.locator('input[aria-label="Review date"]').fill(reviewDay);
    }
    await shot(doc.page, `03-${p.key}-visit-before-complete`);
    const complete = doc.page.getByRole("button", { name: "Complete Visit" }).first();
    await complete.click();
    await doc.page.getByText("Completed. Read only.").first().waitFor({ timeout: 60000 });
    await shot(doc.page, `04-${p.key}-visit-completed`);
  }
  mark("visitsCompleted");
  const loop = patients[0];
  const tracks = sql(state, `SELECT t.id, t.state, (SELECT count(*) FROM check_ins c WHERE c."trackId" = t.id) AS checkins FROM follow_up_tracks t WHERE t."patientId" = ${q(loop.id)}`);
  c.ok("visit completion started one ACTIVE track with two check-ins", tracks.length === 1 && tracks[0].state === "ACTIVE" && Number(tracks[0].checkins) === 2, tracks);
  const review = patients.find((p) => p.key === "review");
  if (review) {
    const appts = sql(state, `SELECT id, to_char(date, 'YYYY-MM-DD') AS day, status, "reviewRequestedFor" IS NOT NULL AS requested FROM appointments WHERE "patientId" = ${q(review.id)}`);
    c.ok("review patient has a review appointment booked for tomorrow on the shifted clock", appts.length === 1 && appts[0].day === reviewDay && appts[0].requested, { appts, reviewDay });
  }

  // 3. The scheduler pass on the shifted clock opens the day-3 check-in and sends the link through fake Meta.
  const opened = await fake.waitForSend(meta, (s) => sentTo(loop.e164)(s) && fake.templateOf(s) === "check_in_opened", { label: "check_in_opened" });
  mark("checkInMessageSent");
  const token = fake.urlButtonParam(opened);
  c.ok("check_in_opened carries a token only in the URL-button parameter", token && token.length >= 32 && !JSON.stringify(fake.bodyParams(opened)).includes(token), { params: fake.bodyParams(opened) });
  const checkIns = sql(state, `SELECT c."stepKey", c.state FROM check_ins c JOIN follow_up_tracks t ON t.id = c."trackId" WHERE t."patientId" = ${q(loop.id)} ORDER BY c.seq`);
  c.ok("day-3 check-in is OPEN and day-14 still SCHEDULED", checkIns[0]?.state === "OPEN" && checkIns[1]?.state === "SCHEDULED", checkIns);
  if (review) {
    const reminder = await fake.waitForSend(meta, (s) => sentTo(review.e164)(s) && fake.templateOf(s) === "review_reminder", { label: "review_reminder", timeoutMs: 60000 });
    c.ok("review reminder sent to the review patient", Boolean(reminder), null);
    const n = sql(state, `SELECT count(*)::int AS n FROM outbound_messages WHERE "patientId" = ${q(review.id)} AND purpose = 'REVIEW_REMINDER' AND state IN ('SENT','DELIVERED','READ')`);
    c.ok("exactly one REVIEW_REMINDER row was sent", n[0].n === 1, n);
  }

  // 4. The patient opens the link at phone width, with no login, and answers with a photo.
  const phoneCtx = await browser.newContext(PHONE);
  const phone = await phoneCtx.newPage();
  phone.setDefaultTimeout(60000);
  logs.patient = recorder(phone, state);
  const leaks = [];
  phone.on("request", (r) => {
    const h = r.headers();
    if (r.url().includes(token) || String(h.referer ?? "").includes(token)) leaks.push({ url: r.url().slice(0, 200), referer: h.referer ?? null });
  });
  await phone.goto(`${PORTAL}/t#${token}`, { waitUntil: "networkidle", timeout: 180000 });
  await phone.getByRole("button", { name: /send|submit/i }).last().waitFor({ timeout: 120000 });
  c.ok("token left the address bar", !phone.url().includes(token) && !phone.url().includes("#"), phone.url());
  const pageText = await phone.locator("body").innerText();
  c.ok("task page greets the patient by first name and names the doctor", pageText.includes(loop.name.split(" ")[0]) && /Priya/.test(pageText), pageText.slice(0, 300));
  c.ok("task page does not show the surname", !pageText.includes(loop.name.split(" ").slice(1).join(" ")), null);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  c.ok("no horizontal scroll at 390px", overflow <= 0, { overflow });
  await shot(phone, "05-patient-task-page-390");
  await phone.locator('input[type="radio"][value="9"]').first().check({ force: true });
  await phone.locator('input[type="radio"][value="worse"]').first().check({ force: true }).catch(async () => {
    await phone.locator('fieldset').nth(1).locator('input[type="radio"]').last().check({ force: true });
  });
  const photoPath = await makeCameraPhoto(out);
  await phone.locator('input[type="file"]').first().setInputFiles(photoPath);
  await phone.locator("img").first().waitFor();
  await shot(phone, "06-patient-answers-with-photo");
  const submitWait = phone.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/api/task/"), { timeout: 120000 });
  await phone.getByRole("button", { name: /send|submit/i }).last().click();
  const submitted = await submitWait;
  c.ok("answer POST succeeded", submitted.status() < 300, submitted.status());
  await phone.getByTestId("urgent").waitFor({ timeout: 60000 });
  const call = phone.getByTestId("urgent").locator('a[href^="tel:"]');
  c.ok("urgent screen offers a call to the clinic", (await call.count()) === 1 && /\+?\d{10,}/.test((await call.getAttribute("href")) ?? ""), await call.count());
  await shot(phone, "07-patient-urgent-screen");
  const storage = await phone.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie }));
  const cookies = JSON.stringify(await phoneCtx.cookies());
  c.ok("token never sent in a request URL or referrer", leaks.length === 0, leaks);
  c.ok("token not stored in storage or cookies", !storage.includes(token) && !cookies.includes(token), null);
  mark("answered");
  const responses = sql(state, `SELECT r.flag, r."instrumentVersionId" = c."instrumentVersionId" AS pinned, (SELECT count(*)::int FROM response_attachments a WHERE a."responseId" = r.id) AS photos FROM check_in_responses r JOIN check_ins c ON c.id = r."checkInId" JOIN follow_up_tracks t ON t.id = c."trackId" WHERE t."patientId" = ${q(loop.id)}`);
  c.ok("one response stored, flagged URGENT, pinned to the instrument version, with one photo", responses.length === 1 && responses[0].flag === "URGENT" && responses[0].pinned && responses[0].photos === 1, responses);
  const flagItems = sql(state, `SELECT id, state, priority FROM attention_items WHERE "patientId" = ${q(loop.id)} AND kind = 'RESPONSE_FLAG'`);
  c.ok("one URGENT response-flag item is OPEN", flagItems.length === 1 && flagItems[0].state === "OPEN" && flagItems[0].priority === "URGENT", flagItems);

  // 5. The patient writes on WhatsApp (signed inbound webhook); staff reply inside the 24h window.
  const inbound = await fake.deliverWebhook(meta, state, fake.inboundText(loop.e164, "The rash is spreading to my neck, should I come in?"));
  c.ok("signed inbound webhook accepted", inbound.status === 200 && inbound.body?.ok, inbound);
  const forged = await fetch(`${state.api}/webhooks/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=00" }, body: "{}" });
  c.ok("unsigned webhook rejected with 401", forged.status === 401, forged.status);
  await fake.waitForSend(meta, (s) => sentTo(loop.e164)(s) && fake.templateOf(s) === "patient_message_ack", { label: "acknowledgement", timeoutMs: 6 * 60 * 1000 }).then(
    () => c.ok("acknowledgement sent for the inbound message", true),
    (e) => c.ok("acknowledgement sent for the inbound message", false, e.message),
  );

  const staff = await openPage(browser, state, "reception", DESK);
  logs.worklist = recorder(staff.page, state);
  await staff.page.goto(`${state.base}/dashboard`, { waitUntil: "networkidle", timeout: 180000 });
  await staff.page.getByRole("link", { name: "Follow-ups", exact: true }).first().click();
  await staff.page.waitForURL(/\/dashboard\/follow-ups/, { timeout: 180000 });
  const list = staff.page.getByRole("list", { name: "Items that need attention" });
  await list.waitFor();
  await shot(staff.page, "08-worklist");
  const rows = list.getByRole("button").filter({ hasText: loop.name.split(" ")[0] });
  const firstRow = (await rows.first().innerText()).toLowerCase();
  c.ok("urgent check-in answer is first among the patient's items", firstRow.includes("urgent") || firstRow.includes("check-in answer"), firstRow);

  // 5a. Message item: claim, reply in the window, resolve as replied.
  await rows.filter({ hasText: "Patient message" }).first().click();
  const detail = staff.page.getByRole("region", { name: "Item details" });
  await detail.getByText("The rash is spreading to my neck").first().waitFor();
  await detail.getByRole("button", { name: "Claim" }).click();
  await detail.getByRole("button", { name: "Release" }).waitFor();
  await staff.page.locator("#staff-reply").fill(STAFF_REPLY);
  await shot(staff.page, "09-staff-reply-before-send");
  await detail.getByRole("button", { name: "Send reply" }).click();
  const reply = await fake.waitForSend(meta, (s) => sentTo(loop.e164)(s) && s.body?.type === "text" && String(s.body?.text?.body ?? "").includes("Please come in tomorrow"), { label: "staff reply", timeoutMs: 30000 }).catch((e) => e);
  c.ok("staff reply sent as free text inside the 24h window", !(reply instanceof Error), reply instanceof Error ? reply.message : null);
  await resolve(staff.page, detail, "REPLIED", "Asked to come in tomorrow");
  await shot(staff.page, "10-message-item-resolved");

  // 5b. Urgent answer item: reception claims and sees the photo but may not resolve it (PP-50); a doctor resolves it.
  await staff.page.goto(`${state.base}/dashboard/follow-ups`, { waitUntil: "networkidle" });
  await list.getByRole("button").filter({ hasText: loop.name.split(" ")[0] }).filter({ hasText: "Check-in answer" }).first().click();
  await detail.getByRole("button", { name: "Claim" }).click();
  await detail.getByRole("button", { name: "Release" }).waitFor();
  const img = detail.locator("img").first();
  await img.waitFor();
  const photoOk = await img.evaluate((el) => el.complete && el.naturalWidth > 0);
  c.ok("staff see the patient's photo in the item", photoOk, null);
  c.ok("reception cannot resolve an urgent item", await detail.getByTestId("resolve-blocked").isVisible(), null);
  await shot(staff.page, "11-urgent-item-with-photo-reception");
  await detail.getByRole("button", { name: "Release" }).click();
  await detail.getByRole("button", { name: "Claim" }).waitFor();
  const docList = doc.page.getByRole("list", { name: "Items that need attention" });
  await doc.page.goto(`${state.base}/dashboard/follow-ups`, { waitUntil: "networkidle", timeout: 180000 });
  await docList.getByRole("button").filter({ hasText: loop.name.split(" ")[0] }).filter({ hasText: "Check-in answer" }).first().click();
  const docDetail = doc.page.getByRole("region", { name: "Item details" });
  await docDetail.getByRole("button", { name: "Claim" }).click();
  await docDetail.getByRole("button", { name: "Release" }).waitFor();
  await resolve(doc.page, docDetail, "CALLED", "Called; booked review for tomorrow");
  await shot(doc.page, "12-urgent-item-resolved-by-doctor");
  mark("resolved");
  const items = sql(state, `SELECT kind, state, "resolutionCode", "resolvedById" IS NOT NULL AS by FROM attention_items WHERE "patientId" = ${q(loop.id)} ORDER BY kind`);
  c.ok("both items RESOLVED with outcome and resolver", items.length === 2 && items.every((i) => i.state === "RESOLVED" && i.resolutionCode && i.by), items);
  const audits = sql(state, `SELECT i.kind, a.action, a."actorKind", a."userId", a."oldValues", a."newValues" FROM audit_logs a JOIN attention_items i ON i.id = a."entityId" WHERE i."patientId" = ${q(loop.id)} ORDER BY a."timestamp"`);
  const fieldsOf = (a) => JSON.parse(a.newValues).fields;
  const auditFor = (kind) => audits.filter((a) => a.kind === kind);
  c.ok("PP-88: each item's opening is audited with its actor kind (webhook, task link)",
    auditFor("PATIENT_MESSAGE")[0]?.action === "CREATE" && auditFor("PATIENT_MESSAGE")[0]?.actorKind === "webhook"
      && auditFor("RESPONSE_FLAG")[0]?.action === "CREATE" && auditFor("RESPONSE_FLAG")[0]?.actorKind === "task link",
    audits.map((a) => [a.kind, a.action, a.actorKind]));
  c.ok("PP-88: claims and resolutions are audited as staff writes naming the changed fields",
    ["PATIENT_MESSAGE", "RESPONSE_FLAG"].every((k) => auditFor(k).some((a) => a.actorKind === "staff" && fieldsOf(a).includes("claimedById"))
      && auditFor(k).some((a) => a.actorKind === "staff" && fieldsOf(a).includes("resolutionCode"))),
    audits.map((a) => [a.kind, a.action, a.actorKind, fieldsOf(a)]));
  c.ok("PP-88: audit rows hold only field names, never values or a user id",
    audits.every((a) => a.oldValues === null && a.userId === null && Object.keys(JSON.parse(a.newValues)).join() === "fields"
      && !a.newValues.includes(loop.e164.slice(1)) && !a.newValues.includes(STAFF_REPLY)),
    audits.length);

  } catch (e) {
    c.ok(`recipe ran to the end`, false, String(e.message).split("\n")[0]);
    for (const ctx of browser.contexts()) for (const pg of ctx.pages()) await shot(pg, `zz-failure-${browser.contexts().indexOf(ctx)}`).catch(() => {});
  }
  for (const [who, log] of Object.entries(logs)) c.ok(`${who}: no page errors`, log.pageErrors.length === 0, log.pageErrors);

  const allSends = fake.sends(meta).map((s) => ({ at: s.at, to: s.body?.to, kind: fake.templateOf(s), authorized: s.authorized }));
  fs.writeFileSync(path.join(out, "fake-meta-sends.json"), JSON.stringify(allSends, null, 2));
  fs.writeFileSync(path.join(out, "network.json"), JSON.stringify(logs, null, 2));
  fs.writeFileSync(path.join(out, "checks.json"), JSON.stringify(c.checks, null, 2));
  fs.writeFileSync(path.join(out, "summary.md"), [
    `# follow-up loop — ${c.failed.length ? "FAIL" : "PASS"} (${c.checks.length - c.failed.length}/${c.checks.length})`,
    "",
    `- stack: ${state.base} (schema ${state.schema}, head ${state.head ?? "?"})`,
    `- fake Meta: port ${meta.port}, scheduler clock +${(meta.clockOffsetMs / 3600000).toFixed(1)} h (${istDay(shifted)} IST)`,
    `- seconds from start: ${JSON.stringify(timings)}`,
    "",
    ...c.checks.map((k) => `- ${k.ok ? "PASS" : "FAIL"} ${k.label}${k.ok ? "" : ` — ${JSON.stringify(k.detail)}`}`),
    "",
    "## fake Meta sends",
    ...allSends.map((s) => `- ${s.at} ${s.kind} → ${s.to}`),
    "",
  ].join("\n"));
  await browser.close();
  console.log(`\nEvidence: ${out}\n${c.failed.length ? `FAILED ${c.failed.length} check(s)` : `ALL ${c.checks.length} CHECKS PASSED`}`);
  process.exit(c.failed.length ? 1 : 0);
}

async function resolve(page, detail, code, note) {
  await page.locator("#resolution-code").selectOption(code);
  await page.locator("#resolution-note").fill(note);
  await detail.getByRole("button", { name: "Resolve", exact: true }).click();
  await detail.getByText("Resolved", { exact: false }).first().waitFor();
}

// A large phone-camera JPEG with EXIF, the shape the portal must re-encode.
async function makeCameraPhoto(out) {
  const sharp = require(path.join(root, "node_modules", "sharp"));
  const file = path.join(out, "camera-photo.jpg");
  const { width, height } = { width: 3000, height: 4000 };
  const noise = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    const spot = (x - 1500) ** 2 + (y - 2000) ** 2 < 900 ** 2;
    noise[i] = spot ? 200 + ((x * y) % 40) : 230; noise[i + 1] = spot ? 90 + (x % 30) : 190; noise[i + 2] = spot ? 80 : 170;
  }
  await sharp(noise, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).withMetadata({ exif: { IFD0: { Make: "FakeCam", Model: "Verify 1" } } }).toFile(file);
  return file;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
