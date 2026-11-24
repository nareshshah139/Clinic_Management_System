#!/usr/bin/env node
// Release 1c on a verify-clinic stack launched with a fake Meta env file: two patients share one WhatsApp
// number; the patient signs in on /p with the code fake Meta received, picks a profile, reads appointments,
// prescriptions, check-ins and messages, writes to the clinic; staff reply after the WhatsApp window is
// shut, so the reply lands in the portal with a notice template; then sign out and sign out everywhere.
// Exits 0 only when every check passes.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { loadState, evidenceDir, sql, openPage, recorder, checker } = require("./lib.cjs");
const fake = require("./fake-meta.cjs");

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, ignoreHTTPSErrors: true };
const DESK = { viewport: { width: 1366, height: 900 } };
const COOKIE = "__Host-portal_session";
const PATIENT_TEXT = "Can I put the cream on twice a day?";
const STAFF_REPLY = "Yes, twice a day for one week, then once a day.";
const DIAGNOSIS = "Contact dermatitis synthetic";
const COMPLAINT = "Itchy rash on forearms for two weeks";
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const digits = (e164) => e164.replace(/\D/g, "");
const sentTo = (e164) => (s) => s.authorized && digits(String(s.body?.to ?? "")) === digits(e164);
const newSince = (meta, template) => {
  const before = new Set(fake.sends(meta).filter((x) => fake.templateOf(x) === template).map((x) => x.id));
  return (s) => fake.templateOf(s) === template && !before.has(s.id);
};
const istDay = (ms) => new Date(ms + 330 * 60000).toISOString().slice(0, 10);

async function main() {
  const state = loadState();
  const meta = fake.loadFake();
  const out = evidenceDir("portal-sign-in");
  const c = checker();
  const t0 = Date.now();
  const timings = {};
  const mark = (k) => (timings[k] = Math.round((Date.now() - t0) / 1000));
  const shot = async (page, name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  const browser = await chromium.launch();
  const logs = {};
  const api = (p, init = {}) => fetch(`${state.base}/api/${p}`, { redirect: "manual", ...init });
  // --portal https://127.0.0.1:<port>: the https-proxy.cjs origin the stack was launched with as PORTAL_BASE_URL.
  const portal = process.argv.includes("--portal") ? process.argv[process.argv.indexOf("--portal") + 1] : state.base;
  try {
    // --reuse-phone <10 digits>: rerun on patients a previous run registered and confirmed on this stack,
    // skipping the two 5-minute confirmations and the bookings.
    const reuseAt = process.argv.indexOf("--reuse-phone");
    const reuse = reuseAt > 0 ? process.argv[reuseAt + 1] : null;
    const phone = reuse ?? `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
    const e164 = `+91${phone}`;
    const prior = reuse ? sql(state, `SELECT id, name FROM patients WHERE phone = ${q(phone)} ORDER BY name`) : [];
    const run = reuse ? prior[0].name.replace(/^\D+/, "") : Date.now().toString().slice(-6);
    const pts = [{ key: "a", name: `Asha Portal${run}` }, { key: "b", name: `Bala Portal${run}` }];
    if (reuse) {
      for (const p of pts) {
        p.id = prior.find((r) => r.name === p.name).id;
        p.slot = sql(state, `SELECT slot FROM appointments WHERE "patientId" = ${q(p.id)} ORDER BY date DESC LIMIT 1`)[0].slot;
      }
    }

    // 0. Plans for the visit's check-ins (no import screen; the owner posts it, as in the follow-up loop).
    const owner = await openPage(browser, state, "owner", DESK);
    const imported = await owner.page.evaluate(async () => (await fetch("/api/follow-ups/import", { method: "POST" })).status);
    c.ok("owner import of follow-up plans succeeded", imported < 300, imported);
    await owner.context.close();

    // 1. Reception registers two patients on one phone and confirms the number for each.
    const desk = await openPage(browser, state, "reception", DESK);
    logs.reception = recorder(desk.page, state);
    for (const p of reuse ? [] : pts) {
      const created = await desk.page.evaluate(async (body) => {
        const r = await fetch("/api/patients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        return { status: r.status, body: await r.json().catch(() => null) };
      }, { name: p.name, gender: "F", age: p.key === "a" ? 34 : 9, phone });
      c.ok(`registered patient ${p.key} on the shared phone`, created.status === 201 && created.body?.id, created.status);
      p.id = created.body.id;
      await desk.page.goto(`${state.base}/dashboard/patients/${p.id}`, { waitUntil: "networkidle", timeout: 180000 });
      const fresh = newSince(meta, "number_confirmation");
      await desk.page.getByRole("button", { name: "Patient agreed to WhatsApp" }).click();
      await desk.page.locator("#whatsapp-code").waitFor();
      const conf = await fake.waitForSend(meta, (s) => sentTo(e164)(s) && fresh(s), { label: `number_confirmation for ${p.key}` });
      await desk.page.goto(`${state.base}/dashboard/patients/${p.id}`, { waitUntil: "networkidle" });
      await desk.page.locator("#whatsapp-code").fill(fake.bodyParams(conf)[1]);
      await desk.page.getByRole("button", { name: "Confirm number" }).click();
      await desk.page.locator("#whatsapp-code").waitFor({ state: "detached" });
      const [prof] = sql(state, `SELECT "consentState", "phoneConfirmedAt" IS NOT NULL AS confirmed, "portalEnabled" FROM patient_portal_profiles WHERE "patientId" = ${q(p.id)}`);
      c.ok(`${p.key}: number confirmed, consent OPTED_IN, portal on`, prof?.consentState === "OPTED_IN" && prof.confirmed && prof.portalEnabled, prof);
    }
    await shot(desk.page, "01-reception-number-confirmed");
    mark("numbersConfirmed");

    // 2. Appointments: A in three days, B (another family member) in four.
    const doctorId = state.users.doctor.id;
    for (const [p, days, slot] of reuse ? [] : [[pts[0], 3, "10:30-10:45"], [pts[1], 4, "16:00-16:15"]]) {
      // Earlier runs on the same stack hold these slots; walk forward a day at a time until one is free.
      let r = 409;
      for (let d = days; r === 409 && d < days + 60; d += 2) {
        r = await desk.page.evaluate(async (body) => (await fetch("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).status,
          { patientId: p.id, doctorId, date: istDay(Date.now() + d * 86400000), slot });
      }
      c.ok(`booked ${p.key}'s appointment ${slot}`, r < 300, r);
      p.slot = slot;
    }

    // 3. The doctor sees A: complaint and diagnosis (never shown in the portal), a prescription, the two-week plan.
    const doc = await openPage(browser, state, "doctor", DESK);
    logs.doctor = recorder(doc.page, state);
    const a = pts[0];
    await doc.page.goto(`${state.base}/dashboard/patients/${a.id}`, { waitUntil: "networkidle", timeout: 180000 });
    await doc.page.getByRole("button", { name: "Start new visit" }).click();
    await doc.page.waitForURL(/\/dashboard\/visits/, { timeout: 180000 });
    await doc.page.locator("#visit-chief-complaints").waitFor({ timeout: 180000 });
    await doc.page.locator("#visit-chief-complaints").fill(COMPLAINT);
    await doc.page.locator("#visit-diagnosis").fill(DIAGNOSIS);
    const instructions = doc.page.locator("#visit-followup-instructions");
    if (!(await instructions.isVisible())) await doc.page.getByRole("button", { name: /Follow-up and language/ }).first().click();
    await instructions.fill("Send photos on the check-in link");
    await doc.page.locator("#follow-up-plan").selectOption({ label: "Two-week skin check" });
    await doc.page.getByRole("button", { name: "Save Draft" }).click();
    await doc.page.getByText("Unsaved changes").waitFor({ state: "detached", timeout: 60000 });
    const [visit] = sql(state, `SELECT id FROM visits WHERE "patientId" = ${q(a.id)} ORDER BY "createdAt" DESC LIMIT 1`);
    const rx = await doc.page.evaluate(async (body) => {
      const r = await fetch("/api/prescriptions", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json().catch(() => null) };
    }, { patientId: a.id, visitId: visit.id, doctorId, items: [{ drugName: `Mometasone cream ${run}`, dosageUnit: "MG", frequency: "BD", duration: 14, durationUnit: "DAYS", route: "Topical", applicationSite: "Forearms", instructions: "Thin layer after bath", hsnCode: "HSN-SECRET-3004" }], followUpInstructions: "Avoid hot water on the rash", notes: "doctor-note-synthetic" });
    c.ok("doctor saved a prescription on the visit", rx.status < 300, rx);
    // The prescription bumps the visit's version; reload the saved visit rather than trip the save-conflict banner.
    await doc.page.goto(`${state.base}/dashboard/visits?visitId=${encodeURIComponent(visit.id)}`, { waitUntil: "networkidle", timeout: 180000 });
    await doc.page.locator("#visit-chief-complaints").waitFor({ timeout: 180000 });
    const discard = doc.page.getByRole("button", { name: "Discard draft and reload saved visit" });
    if (await discard.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
      await discard.click();
      await discard.waitFor({ state: "detached" });
    }
    // The plan rides on completion, so pick it again on the reloaded visit.
    if (!(await doc.page.locator("#follow-up-plan").isVisible())) await doc.page.getByRole("button", { name: /Follow-up and language/ }).first().click();
    await doc.page.locator("#follow-up-plan").selectOption({ label: "Two-week skin check" });
    await doc.page.getByRole("button", { name: "Complete Visit" }).first().click();
    await doc.page.getByText("Completed. Read only.").first().waitFor({ timeout: 60000 });
    const tracks = sql(state, `SELECT count(*)::int AS n FROM follow_up_tracks WHERE "visitId" = ${q(visit.id)}`);
    c.ok("completing the visit started the two-week follow-up track", tracks[0].n === 1, tracks);
    await shot(doc.page, "02-doctor-visit-completed");
    mark("visitCompleted");

    // 4. The patient signs in at 390px with the code fake Meta received.
    const ctx = await browser.newContext(PHONE);
    const pg = await ctx.newPage();
    pg.setDefaultTimeout(60000);
    logs.patient = recorder(pg, state, portal);
    await pg.goto(`${portal}/p`, { waitUntil: "networkidle", timeout: 180000 });
    const csp = (await pg.request.get(`${portal}/p`)).headers()["content-security-policy"] ?? "";
    c.ok("PP-91: /p is served with the portal CSP", /script-src 'self' 'nonce-/.test(csp), csp.slice(0, 200));
    await pg.getByLabel("Your WhatsApp number").fill(phone);
    await shot(pg, "03-patient-phone-390");
    const codeAt = Date.now();
    const firstCode = newSince(meta, "portal_sign_in_code");
    await pg.getByRole("button", { name: "Send me a code" }).click();
    const onWay = await pg.getByTestId("code-on-way").innerText();
    const unknown = await api("portal/auth/code", { method: "POST", headers: { "Content-Type": "application/json", Origin: portal }, body: JSON.stringify({ phone: "9000000001" }) });
    const unknownBody = await unknown.json();
    const eligibleStatus = logs.patient.writes.find((w) => w.path === "/api/portal/auth/code")?.status;
    c.ok("PP-55: an unknown number gets the same answer as an eligible one", unknown.status === eligibleStatus && unknownBody.message === onWay, { status: unknown.status, eligibleStatus, unknownBody, onWay });
    const codeSend = await fake.waitForSend(meta, (s) => sentTo(e164)(s) && firstCode(s), { label: "portal_sign_in_code", timeoutMs: 60000 });
    const code = fake.bodyParams(codeSend)[0];
    c.ok("PP-55: fake Meta received a 6-digit sign-in code within 30s", /^\d{6}$/.test(code ?? "") && Date.parse(codeSend.at) - codeAt < 30000, { code: !!code, ms: Date.parse(codeSend.at) - codeAt });
    c.ok("the unknown number got no WhatsApp message", !fake.sends(meta).some((s) => digits(String(s.body?.to ?? "")).endsWith("9000000001")), null);
    await shot(pg, "04-patient-code-on-way");
    await pg.getByLabel("6-digit code").fill(code);
    await pg.getByRole("button", { name: "Sign in" }).click();
    const picker = pg.getByTestId("profile-picker");
    await picker.waitFor();
    const pickerText = await picker.innerText();
    c.ok("PP-61: the shared phone lists both profiles by first name and branch only", pickerText.includes("Asha") && pickerText.includes("Bala") && !pickerText.includes(`Portal${run}`) && pickerText.includes("Lakshmi Family Clinic"), pickerText);
    await shot(pg, "05-patient-profile-picker");
    await picker.getByRole("button", { name: /Asha/ }).click();
    await pg.waitForURL(/\/p\/records/);
    await pg.getByTestId("portal-name").waitFor();
    mark("signedIn");

    const [cookie] = (await ctx.cookies()).filter((k) => k.name === COOKIE);
    c.ok("PP-58: session cookie is __Host-, HttpOnly, Secure, SameSite=Lax, path /", cookie && cookie.httpOnly && cookie.secure && cookie.sameSite === "Lax" && cookie.path === "/" && !cookie.domain.startsWith("."), cookie && { ...cookie, value: "[redacted]" });
    const storage = await pg.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie }));
    c.ok("PP-58: the token is not readable by page script or kept in storage", !storage.includes(cookie.value), null);
    const sessions = sql(state, `SELECT "tokenHash", "patientId" FROM portal_sessions WHERE "identityId" IN (SELECT id FROM portal_identities WHERE "phoneE164" = ${q(e164)}) AND "createdAt" >= to_timestamp(${codeAt / 1000})`);
    const tokenHash = require("node:crypto").createHash("sha256").update(cookie.value).digest("hex");
    c.ok("PP-58: the database holds only a hash of the token, bound to the chosen patient", sessions.length === 1 && sessions[0].tokenHash === tokenHash && !JSON.stringify(sessions).includes(cookie.value) && sessions[0].patientId === a.id, sessions.length);
    const jar = `${COOKIE}=${cookie.value}`;

    // 5. Records: home, appointments, prescriptions, check-ins; nothing clinical (PP-63, PP-64).
    const home = await pg.locator("body").innerText();
    c.ok("PP-63: home shows the next appointment and the latest prescription", home.includes(a.slot) && home.includes(`Mometasone cream ${run}`), home.slice(0, 400));
    await shot(pg, "06-portal-home-390");
    const seenText = [home];
    // The plan's check-ins are still SCHEDULED (they open days after the visit), and history lists only opened ones.
    for (const [tab, testid, expectText] of [["Appointments", "appointments", a.slot], ["Prescriptions", "visits", "Thin layer after bath"], ["Check-ins", null, "No check-ins yet."], ["Messages", null, "Write to the clinic"]]) {
      await pg.getByRole("navigation").getByRole("button", { name: tab, exact: true }).click();
      await (testid ? pg.getByTestId(testid) : pg.getByText(expectText)).waitFor();
      const text = await pg.locator("body").innerText();
      seenText.push(text);
      if (expectText) c.ok(`PP-63: ${tab} shows its records`, text.includes(expectText), text.slice(0, 300));
      await shot(pg, `07-portal-${testid ?? "check-ins"}-390`);
    }
    const scheduled = sql(state, `SELECT c.state FROM check_ins c JOIN follow_up_tracks t ON t.id = c."trackId" WHERE t."patientId" = ${q(a.id)}`);
    c.ok("PP-63: the plan's not-yet-open check-ins are not listed as history", scheduled.length > 0 && scheduled.every((r) => r.state === "SCHEDULED"), scheduled);
    const rxText = seenText[2];
    c.ok("PP-63: the prescription shows the doctor and the general instructions", /Priya/.test(rxText) && rxText.includes("Avoid hot water on the rash"), rxText.slice(0, 300));
    const all = seenText.join("\n");
    c.ok("PP-64: no complaint, diagnosis, doctor's note, HSN or surname anywhere in the portal", ![DIAGNOSIS, COMPLAINT, "doctor-note-synthetic", "HSN-SECRET", `Portal${run}`].some((s) => all.includes(s)), null);
    c.ok("PP-63: B's appointment is not in A's records", !all.includes(pts[1].slot), null);
    const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    c.ok("no horizontal scroll at 390px", overflow <= 0, { overflow });

    // 6. Switch to B (rebuilt list), then back.
    await pg.getByTestId("profile-switch").getByRole("button", { name: /Bala/ }).click();
    await pg.getByTestId("portal-name").filter({ hasText: "Bala" }).waitFor();
    await pg.getByRole("navigation").getByRole("button", { name: "Appointments", exact: true }).click();
    await pg.getByTestId("appointments").waitFor();
    const bText = await pg.locator("body").innerText();
    c.ok("PP-61/OwnDataOnly: B's view shows B's appointment and none of A's", bText.includes(pts[1].slot) && !bText.includes(a.slot), bText.slice(0, 300));
    await shot(pg, "08-portal-switched-to-b");
    await pg.getByTestId("profile-switch").getByRole("button", { name: /Asha/ }).click();
    await pg.getByTestId("portal-name").filter({ hasText: "Asha" }).waitFor();

    // 7. A writes to the clinic (PP-65).
    await pg.getByRole("navigation").getByRole("button", { name: "Messages", exact: true }).click();
    await pg.getByLabel("Write to the clinic").fill(PATIENT_TEXT);
    const posted = pg.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/api/portal/records/messages"));
    await pg.getByRole("button", { name: "Send", exact: true }).click();
    c.ok("portal message POST succeeded", (await posted).status() < 300, null);
    await pg.getByTestId("thread").getByText(PATIENT_TEXT).waitFor();
    await shot(pg, "09-portal-message-sent");
    const msgs = sql(state, `SELECT channel, direction, "patientId", "clientKey" IS NOT NULL AS keyed FROM patient_messages WHERE body = ${q(PATIENT_TEXT)} AND "patientId" IN (${q(a.id)}, ${q(pts[1].id)})`);
    c.ok("PP-65: one inbound PORTAL message stored for A with a client key", msgs.length === 1 && msgs[0].channel === "PORTAL" && msgs[0].direction === "INBOUND" && msgs[0].patientId === a.id && msgs[0].keyed, msgs);
    const items = sql(state, `SELECT state FROM attention_items WHERE "patientId" = ${q(a.id)} AND kind = 'PATIENT_MESSAGE'`);
    c.ok("PP-65: the message opened one PATIENT_MESSAGE worklist item", items.length === 1 && items[0].state === "OPEN", items);

    // 8. Security probes with the real cookie (PP-59, PP-62).
    const evil = await api("portal/records/messages", { method: "POST", headers: { Cookie: jar, "Content-Type": "application/json", Origin: "http://evil.example" }, body: JSON.stringify({ body: "forged", clientKey: crypto.randomUUID() }) });
    c.ok("PP-59: a portal write from another origin is refused", evil.status === 403, evil.status);
    const noOrigin = await api("portal/records/messages", { method: "POST", headers: { Cookie: jar, "Content-Type": "application/json" }, body: JSON.stringify({ body: "forged", clientKey: crypto.randomUUID() }) });
    c.ok("PP-59: a portal write with no Origin is refused", noOrigin.status === 403, noOrigin.status);
    const staffRoute = await api("patients", { headers: { Cookie: jar } });
    c.ok("PP-62/StaffCookieStaysStaff: the portal cookie opens no staff API", staffRoute.status === 401, staffRoute.status);
    const dash = await api("../dashboard", { headers: { Cookie: jar } });
    c.ok("PP-62: the portal cookie does not open /dashboard", dash.status === 307 && /\/login/.test(dash.headers.get("location") ?? ""), dash.status);
    const staffCookies = (await desk.context.cookies()).map((k) => `${k.name}=${k.value}`).join("; ");
    const staffOnPortal = await api("portal/session", { headers: { Cookie: staffCookies } });
    c.ok("PP-62: a staff session opens no portal record", staffOnPortal.status === 401, staffOnPortal.status);

    // 9. Reception replies; the WhatsApp window is shut (A never wrote on WhatsApp), so the reply goes to the portal.
    await desk.page.goto(`${state.base}/dashboard/follow-ups`, { waitUntil: "networkidle", timeout: 180000 });
    const list = desk.page.getByRole("list", { name: "Items that need attention" });
    await list.getByRole("button").filter({ hasText: a.name }).filter({ hasText: "Patient message" }).first().click();
    const detail = desk.page.getByRole("region", { name: "Item details" });
    await detail.getByText(PATIENT_TEXT).first().waitFor();
    await detail.getByRole("button", { name: "Claim" }).click();
    await detail.getByRole("button", { name: "Release" }).waitFor();
    const note = await desk.page.getByTestId("reply-via-portal").innerText();
    c.ok("PP-65: staff are told the reply goes to the portal with a WhatsApp notice", /goes to the patient portal/.test(note), note);
    await desk.page.getByLabel("Reply in the patient portal").fill(STAFF_REPLY);
    await shot(desk.page, "10-staff-reply-via-portal");
    await detail.getByRole("button", { name: "Send reply" }).click();
    await detail.getByText("Reply sent.").first().waitFor();
    await shot(desk.page, "11-staff-reply-sent");
    const notice = await fake.waitForSend(meta, (s) => sentTo(e164)(s) && fake.templateOf(s) === "portal_reply_notice", { label: "portal_reply_notice", timeoutMs: 30000 });
    const noticeJson = JSON.stringify(notice.body);
    c.ok("PP-65: fake Meta got the portal_reply_notice template, not free text", notice.body?.type === "template", notice.body?.type);
    c.ok("PP-65: the notice carries no reply text, name or token", !noticeJson.includes("twice a day") && !noticeJson.includes("Asha") && !noticeJson.includes(cookie.value), noticeJson.slice(0, 300));
    c.ok("no free-text send reached fake Meta for this phone", !fake.sends(meta).some((s) => sentTo(e164)(s) && s.body?.type === "text"), null);
    const out1 = sql(state, `SELECT purpose, state FROM outbound_messages WHERE "patientId" = ${q(a.id)} AND purpose IN ('PORTAL_REPLY_NOTICE','STAFF_REPLY')`);
    c.ok("one PORTAL_REPLY_NOTICE sent, no STAFF_REPLY", out1.length === 1 && out1[0].purpose === "PORTAL_REPLY_NOTICE" && ["SENT", "DELIVERED", "READ"].includes(out1[0].state), out1);

    // 10. The patient reads the reply in the portal.
    await pg.getByRole("navigation").getByRole("button", { name: "Home", exact: true }).click();
    await pg.getByRole("navigation").getByRole("button", { name: "Messages", exact: true }).click();
    const reply = pg.getByTestId("thread").locator('li[data-from="clinic"]').filter({ hasText: STAFF_REPLY });
    await reply.waitFor();
    c.ok("PP-65: the staff reply is in the patient's portal thread", (await reply.count()) === 1, null);
    await shot(pg, "12-portal-reads-staff-reply");
    mark("replyRead");

    const events = sql(state, `SELECT kind, view, count(*)::int AS n FROM portal_access_events WHERE "identityId" IN (SELECT id FROM portal_identities WHERE "phoneE164" = ${q(e164)}) GROUP BY kind, view ORDER BY kind, view`);
    const has = (kind, view) => events.some((e) => e.kind === kind && (view === undefined || e.view === view));
    c.ok("PP-66: sign-in, profile choices and each record view are access events", has("SIGN_IN") && has("PROFILE_CHOICE") && ["home", "appointments", "visits", "check-ins", "messages"].every((v) => has("RECORD_VIEW", v)), events);

    // 11. Second device, sign out there; then sign out everywhere from the first (PP-60).
    const ctx2 = await browser.newContext(PHONE);
    const pg2 = await ctx2.newPage();
    await pg2.goto(`${portal}/p`, { waitUntil: "networkidle" });
    await pg2.getByLabel("Your WhatsApp number").fill(phone);
    const freshCode = newSince(meta, "portal_sign_in_code");
    await pg2.getByRole("button", { name: "Send me a code" }).click();
    const code2 = fake.bodyParams(await fake.waitForSend(meta, (s) => sentTo(e164)(s) && freshCode(s), { label: "second code", timeoutMs: 60000 }))[0];
    await pg2.getByLabel("6-digit code").fill(code === code2 ? code2 : code);
    await pg2.getByRole("button", { name: "Sign in" }).click();
    await pg2.getByTestId("sign-in-error").waitFor();
    c.ok("PP-56: the first, consumed code no longer signs in", code !== code2 && (await pg2.getByTestId("sign-in-error").isVisible()), null);
    await pg2.getByLabel("6-digit code").fill(code2);
    await pg2.getByRole("button", { name: "Sign in" }).click();
    await pg2.getByTestId("profile-picker").getByRole("button", { name: /Bala/ }).click();
    await pg2.waitForURL(/\/p\/records/);
    const jar2 = `${COOKIE}=${(await ctx2.cookies()).find((k) => k.name === COOKIE).value}`;
    await pg2.getByRole("button", { name: "Sign out", exact: true }).click();
    await pg2.waitForURL((u) => u.pathname === "/p");
    c.ok("sign out returns to /p and kills that device's session only", (await api("portal/session", { headers: { Cookie: jar2 } })).status === 401 && (await api("portal/session", { headers: { Cookie: jar } })).status === 200, null);
    await pg.getByRole("button", { name: "Sign out on every device" }).click();
    await pg.waitForURL((u) => u.pathname === "/p");
    await shot(pg, "13-signed-out-everywhere");
    c.ok("PP-60: sign out everywhere kills the first device's session", (await api("portal/session", { headers: { Cookie: jar } })).status === 401, null);
    const live = sql(state, `SELECT count(*)::int AS n FROM portal_sessions WHERE "revokedAt" IS NULL AND "identityId" IN (SELECT id FROM portal_identities WHERE "phoneE164" = ${q(e164)})`);
    c.ok("PP-60: no live session is left for the phone", live[0].n === 0, live);
    mark("signedOut");
  } catch (e) {
    c.ok("recipe ran to the end", false, String(e.message).split("\n")[0]);
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) await shot(p, `zz-failure-${browser.contexts().indexOf(ctx)}`).catch(() => {});
  }
  for (const [who, log] of Object.entries(logs)) c.ok(`${who}: no page errors`, log.pageErrors.length === 0, log.pageErrors);

  const allSends = fake.sends(meta).map((s) => ({ at: s.at, to: s.body?.to, kind: fake.templateOf(s), authorized: s.authorized }));
  fs.writeFileSync(path.join(out, "fake-meta-sends.json"), JSON.stringify(allSends, null, 2));
  fs.writeFileSync(path.join(out, "network.json"), JSON.stringify(logs, null, 2));
  fs.writeFileSync(path.join(out, "checks.json"), JSON.stringify(c.checks, null, 2));
  fs.writeFileSync(path.join(out, "summary.md"), [
    `# portal sign-in and records — ${c.failed.length ? "FAIL" : "PASS"} (${c.checks.length - c.failed.length}/${c.checks.length})`,
    "",
    `- stack: ${state.base} (schema ${state.schema}); portal origin ${portal}`,
    `- fake Meta: port ${meta.port}`,
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

main().catch((e) => { console.error(e); process.exit(1); });
