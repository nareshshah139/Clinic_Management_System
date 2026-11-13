"use strict";

const fx = require("./visits-fixtures.cjs");

const SEP = " · ";
const expectedBar = (p, doctorName, extra = []) => ["Patient: " + [p.name, p.age, p.sex].join(SEP), `Doctor: ${doctorName}`, ...extra].join(SEP);

const model = {
  id: "cr21-visit-identity",
  title: "CR-21: patient identity stays visible on Visit Documentation",
  initial: "SetupEmpty",
  maxSteps: 16,
  states: {
    SetupEmpty: { label: "Visits setup, no patient selected" },
    SetupReady: { label: "Setup: new patient picked by search, ready card shows identity" },
    FreshOpen: { label: "Visit #1 of new patient, Patient Context open" },
    FreshCollapsed: { label: "Visit #1, Patient Context collapsed" },
    FreshRxScrolled: { label: "Visit #1 collapsed, Treatment/Rx scrolled into view" },
    FreshTabsScrolled: { label: "Visit #1 collapsed, every scrolling tab scrolled to bottom" },
    FreshOpenSaveReached: { label: "Visit #1, context open, scrolled to the Rx Save Draft button" },
    FreshCollapsedSaveReached: { label: "Visit #1, context collapsed, scrolled to the Rx Save Draft button" },
    ApptOpen: { label: "Visit from appointment (slot + OPD), context open" },
    ApptCollapsed: { label: "Appointment visit, context collapsed" },
    ApptRxScrolled: { label: "Appointment visit collapsed, Rx scrolled into view" },
    DobOpen: { label: "Patient whose age comes from dob only, context open" },
    DobCollapsed: { label: "Dob-only patient, context collapsed" },
    ResumeOpen: { label: "Existing visit resumed by ?visitId (later visit, other doctor)" },
    ResumeCollapsed: { label: "Resumed visit, context collapsed" },
    ResumeRxScrolled: { label: "Resumed visit collapsed, Rx scrolled into view" },
  },
  transitions: [
    { from: "SetupEmpty", event: "searchAndPickPatient", to: "SetupReady" },
    { from: "SetupReady", event: "startVisit", to: "FreshOpen" },
    { from: "FreshOpen", event: "collapseContext", to: "FreshCollapsed" },
    { from: "FreshCollapsed", event: "expandContext", to: "FreshOpen" },
    { from: "FreshCollapsed", event: "scrollToRx", to: "FreshRxScrolled" },
    { from: "FreshOpen", event: "scrollToRxSaveButton", to: "FreshOpenSaveReached" },
    { from: "FreshCollapsed", event: "scrollToRxSaveButton", to: "FreshCollapsedSaveReached" },
    { from: "FreshRxScrolled", event: "scrollEveryTab", to: "FreshTabsScrolled" },
    { from: "FreshTabsScrolled", event: "openAppointmentVisit", to: "ApptOpen" },
    { from: "ApptOpen", event: "collapseContext", to: "ApptCollapsed" },
    { from: "ApptCollapsed", event: "expandContext", to: "ApptOpen" },
    { from: "ApptCollapsed", event: "scrollToRx", to: "ApptRxScrolled" },
    { from: "ApptRxScrolled", event: "openDobOnlyVisit", to: "DobOpen" },
    { from: "DobOpen", event: "collapseContext", to: "DobCollapsed" },
    { from: "DobCollapsed", event: "resumeVisitById", to: "ResumeOpen" },
    { from: "ResumeOpen", event: "collapseContext", to: "ResumeCollapsed" },
    { from: "ResumeCollapsed", event: "scrollToRx", to: "ResumeRxScrolled" },
  ],
};

async function waitForBar(page, expected) {
  await fx.identityBar(page).waitFor({ state: "visible", timeout: 60000 });
  const deadline = Date.now() + 30000;
  let text = "";
  while (Date.now() < deadline) {
    text = ((await fx.identityBar(page).textContent()) || "").replace(/\s+/g, " ").trim();
    if (text === expected) return text;
    await page.waitForTimeout(200);
  }
  return text;
}

function contextCloseButton(page) {
  return page.getByText("Patient Context", { exact: true }).locator("xpath=..").getByRole("button");
}

async function openPrescriptionTab(page) {
  await page.getByRole("tab", { name: /Prescription/ }).click();
  await page.locator("#section-treatment-heading").waitFor({ state: "visible", timeout: 30000 });
}

async function scrollTreatmentIntoView(ctx) {
  const { page } = ctx;
  await openPrescriptionTab(page);
  await page.locator("#section-treatment-heading").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
}

async function gotoVisit(ctx, query) {
  await ctx.page.goto(`${ctx.baseUrl}/dashboard/visits?${query}`, { timeout: 120000 });
}

async function identityStateChecks(ctx, check, { patient, doctorName, extra = [], contextOpen, visitNumber }) {
  const { page } = ctx;
  const expected = expectedBar(patient, doctorName, extra);
  const text = await waitForBar(page, expected);
  check(text === expected, `header reads "${expected}" (got "${text}")`);
  check(!/Unknown/.test(text), "header has no 'Unknown'");
  check((await page.getByText(/Patient:\s*Unknown/).count()) === 0, "no 'Patient: Unknown' anywhere on the page");
  const inView = await fx.barInViewport(page);
  check(inView.ok, `identity bar inside the viewport and on top (${JSON.stringify(inView)})`);
  const showBtn = page.getByRole("button", { name: "Show Patient Context" });
  const idBadge = page.getByText(`ID: ${patient.id}`, { exact: true });
  if (contextOpen) {
    await page.getByText("Patient Context", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
    await idBadge.waitFor({ state: "visible", timeout: 30000 });
    check(await idBadge.isVisible(), "context card shows the patient ID");
    check((await showBtn.count()) === 0, "no 'Show Patient Context' button while open");
  } else {
    await showBtn.waitFor({ state: "visible", timeout: 10000 });
    check(await showBtn.isVisible(), "'Show Patient Context' button visible");
    check(!(await page.getByText("Patient Context", { exact: true }).isVisible()), "context card hidden");
    check((await idBadge.count()) === 0, "patient ID detail hidden");
    check((await page.getByText(/^Phone:/).count()) === 0, "phone detail hidden");
  }
  if (visitNumber) {
    const vn = page.getByText(new RegExp(`Visit #${visitNumber}(?!\\d)`)).first();
    await vn.waitFor({ state: "visible", timeout: 30000 });
    check(await vn.isVisible(), `form header shows Visit #${visitNumber}`);
  }
}

async function scrolledChecks(ctx, check, scenario) {
  const { page } = ctx;
  const top = await fx.mainScrollTop(page);
  check(top > 200, `<main> scrolled down (scrollTop ${top})`);
  const treatment = await page.locator("#section-treatment-heading").boundingBox();
  check(treatment && treatment.y > 0 && treatment.y < 900, "Treatment heading is in the viewport");
  await identityStateChecks(ctx, check, { ...scenario, contextOpen: false });
}

const scenarios = {
  fresh: (ctx) => ({ patient: ctx.vars.fresh, doctorName: ctx.vars.setupDoctorName, visitNumber: 1 }),
  appt: (ctx) => ({ patient: ctx.shared.patients.appt, doctorName: ctx.shared.doctors.praneeta.name, extra: ["16:00–16:30", "OPD"], visitNumber: 1 }),
  dob: (ctx) => ({ patient: ctx.shared.patients.dobOnly, doctorName: ctx.shared.doctors.praneeta.name }),
  resume: (ctx) => ({ patient: ctx.shared.patients.seed, doctorName: ctx.shared.doctors.shravya.name }),
};

const driver = {
  setup: async ({ baseUrl, apiUrl, shared }) => {
    await fx.createFixtures({ baseUrl, apiUrl, shared });
  },
  reset: async (ctx) => {
    const tag = `${ctx.shared.tag}${ctx.pathIndex}`;
    const fresh = await fx.createPatient(ctx.shared, `ABHILASH NEW ${tag}`, { gender: "F", age: 33 });
    ctx.vars.fresh = { id: fresh.id, name: fresh.name, age: "33", sex: "Female" };
    await fx.createPatient(ctx.shared, `FILLER ${tag}`, { gender: "M", age: 60 });
    ctx.vars.firstRowId = await fx.firstPatientRowId(ctx.shared);
    await fx.loginBrowser(ctx, "praneeta@clinic.test");
    await gotoVisit(ctx, "");
  },
  actions: {
    searchAndPickPatient: async (ctx) => {
      const { page } = ctx;
      const input = page.getByPlaceholder("Search name, phone, or email");
      await input.fill(ctx.vars.fresh.name);
      const option = page.getByRole("option", { name: new RegExp(ctx.vars.fresh.name) });
      await option.waitFor({ state: "visible", timeout: 30000 });
      await option.click();
    },
    startVisit: async (ctx) => {
      await ctx.page.getByRole("button", { name: "Start Visit Documentation" }).click();
    },
    collapseContext: async (ctx) => {
      await ctx.page.getByText("Patient Context", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
      await contextCloseButton(ctx.page).click();
    },
    expandContext: async (ctx) => {
      await ctx.page.getByRole("button", { name: "Show Patient Context" }).click();
    },
    scrollToRx: async (ctx) => scrollTreatmentIntoView(ctx),
    scrollToRxSaveButton: async (ctx) => {
      await openPrescriptionTab(ctx.page);
      await ctx.page.getByRole("button", { name: "Save Draft", exact: true }).scrollIntoViewIfNeeded();
      await ctx.page.waitForTimeout(300);
    },
    scrollEveryTab: async (ctx) => {
      const { page } = ctx;
      const tabs = await page.getByRole("tab").allTextContents();
      ctx.vars.tabScroll = [];
      for (const raw of tabs) {
        const name = raw.trim();
        await page.getByRole("tab", { name, exact: true }).click();
        await page.waitForTimeout(400);
        const top = await page.evaluate(() => {
          const m = document.querySelector("main");
          m.scrollTop = m.scrollHeight;
          return m.scrollTop;
        });
        await page.waitForTimeout(250);
        const inView = await fx.barInViewport(page);
        const text = ((await fx.identityBar(page).textContent()) || "").replace(/\s+/g, " ").trim();
        ctx.vars.tabScroll.push({ name, top, inView, text });
      }
    },
    openAppointmentVisit: async (ctx) => {
      const { shared } = ctx;
      await gotoVisit(ctx, `patientId=${shared.patients.appt.id}&appointmentId=${shared.appointment.id}&autoStart=true`);
    },
    openDobOnlyVisit: async (ctx) => {
      const { shared } = ctx;
      await gotoVisit(ctx, `patientId=${shared.patients.dobOnly.id}&doctorId=${shared.doctors.praneeta.id}&autoStart=true`);
    },
    resumeVisitById: async (ctx) => {
      await gotoVisit(ctx, `visitId=${ctx.shared.resumeVisit.id}&patientId=${ctx.shared.patients.seed.id}`);
    },
  },
  checks: {
    SetupEmpty: async (ctx, check) => {
      const { page } = ctx;
      const input = page.getByPlaceholder("Search name, phone, or email");
      await input.waitFor({ state: "visible", timeout: 120000 });
      check(await input.isVisible(), "setup screen shows the patient search");
      check((await page.getByText(/Patient:\s*Unknown/).count()) === 0, "no 'Patient: Unknown' on the setup screen");
      check(ctx.vars.fresh.id !== ctx.vars.firstRowId, "the new patient is not the first row of the patients list");
    },
    SetupReady: async (ctx, check) => {
      const { page } = ctx;
      await page.getByText("Ready to start visit").waitFor({ state: "visible", timeout: 30000 });
      const trigger = page.locator("button[role=combobox]").first();
      const doctorName = ((await trigger.textContent()) || "").replace(/\s+/g, " ").trim();
      ctx.vars.setupDoctorName = doctorName;
      check(/^Dr\. \S+/.test(doctorName), `doctor picker shows a doctor (${doctorName})`);
      const expected = expectedBar(ctx.vars.fresh, doctorName);
      const text = await waitForBar(page, expected);
      check(text === expected, `ready card reads "${expected}" (got "${text}")`);
      check((await page.getByText(/Patient:\s*Unknown/).count()) === 0, "no 'Patient: Unknown' in the ready card");
    },
    FreshOpen: async (ctx, check) => identityStateChecks(ctx, check, { ...scenarios.fresh(ctx), contextOpen: true }),
    FreshCollapsed: async (ctx, check) => identityStateChecks(ctx, check, { ...scenarios.fresh(ctx), contextOpen: false }),
    FreshRxScrolled: async (ctx, check) => scrolledChecks(ctx, check, scenarios.fresh(ctx)),
    FreshOpenSaveReached: async (ctx, check) => {
      const top = await fx.mainScrollTop(ctx.page);
      check(top > 200, `<main> scrolled down to the action bar (scrollTop ${top})`);
      await identityStateChecks(ctx, check, { ...scenarios.fresh(ctx), contextOpen: true });
    },
    FreshCollapsedSaveReached: async (ctx, check) => {
      const top = await fx.mainScrollTop(ctx.page);
      check(top > 200, `<main> scrolled down to the action bar (scrollTop ${top})`);
      await identityStateChecks(ctx, check, { ...scenarios.fresh(ctx), contextOpen: false });
    },
    FreshTabsScrolled: async (ctx, check) => {
      const expected = expectedBar(ctx.vars.fresh, ctx.vars.setupDoctorName);
      const rows = ctx.vars.tabScroll || [];
      check(rows.length >= 5, `visited ${rows.length} tabs`);
      const scrolling = rows.filter((r) => r.top > 0);
      check(scrolling.length >= 1, `at least one tab scrolls (${scrolling.map((r) => r.name).join(", ")})`);
      for (const r of scrolling) {
        check(r.inView.ok, `${r.name}: bar inside viewport at scrollTop ${r.top} (${JSON.stringify(r.inView)})`);
        check(r.text === expected, `${r.name}: bar reads "${expected}" (got "${r.text}")`);
      }
    },
    ApptOpen: async (ctx, check) => identityStateChecks(ctx, check, { ...scenarios.appt(ctx), contextOpen: true }),
    ApptCollapsed: async (ctx, check) => identityStateChecks(ctx, check, { ...scenarios.appt(ctx), contextOpen: false }),
    ApptRxScrolled: async (ctx, check) => scrolledChecks(ctx, check, scenarios.appt(ctx)),
    DobOpen: async (ctx, check) => {
      await identityStateChecks(ctx, check, { ...scenarios.dob(ctx), contextOpen: true });
      const row = fx.sql(`select coalesce(age::text,'NULL'), to_char(dob,'YYYY-MM-DD') from patients where id='${ctx.shared.patients.dobOnly.id}'`);
      check(row === "NULL\t1985-03-15", `DB patient has no age, only dob (${row})`);
    },
    DobCollapsed: async (ctx, check) => identityStateChecks(ctx, check, { ...scenarios.dob(ctx), contextOpen: false }),
    ResumeOpen: async (ctx, check) => identityStateChecks(ctx, check, { ...scenarios.resume(ctx), contextOpen: true }),
    ResumeCollapsed: async (ctx, check) => identityStateChecks(ctx, check, { ...scenarios.resume(ctx), contextOpen: false }),
    ResumeRxScrolled: async (ctx, check) => scrolledChecks(ctx, check, scenarios.resume(ctx)),
  },
};

module.exports = { model, driver };
