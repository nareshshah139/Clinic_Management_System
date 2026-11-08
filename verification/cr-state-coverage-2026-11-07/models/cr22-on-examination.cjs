"use strict";

const fx = require("./visits-fixtures.cjs");

const LABELS = [
  "Fitzpatrick Skin Type",
  "Acne Severity",
  "Itch Score (0-10)",
  "Morphology",
  "Distribution / Body Areas",
  "Dermatology Diagnoses",
  "Detailed Examination",
];
const ACNE = "moderate";
const ITCH = "6";
const SKIN = "IV";
const detailText = (ctx) => `Comedones and papules on both cheeks ${ctx.shared.tag}-${ctx.pathIndex}`;
const prefKey = (doctorId) => `cms.ui.onExamination.open.${doctorId}`;

const model = {
  id: "cr22-on-examination",
  title: "CR-22: On Examination collapsible, collapsed by default, remembered per doctor",
  initial: "CollapsedEmpty",
  maxSteps: 12,
  states: {
    CollapsedEmpty: { label: "New visit: On Examination collapsed, nothing entered" },
    OpenEmpty: { label: "Opened, all exam fields shown, empty" },
    OpenFilled: { label: "Opened and filled in (skin type, acne, itch, detail)" },
    CollapsedFilled: { label: "Collapsed with data: 'filled' badge, values kept" },
    SavedCollapsed: { label: "Saved while collapsed: exam stored in DB" },
    SavedOpen: { label: "Saved while open: exam stored in DB, stays open" },
    ReopenedWithData: { label: "Saved visit reopened: open because it has data" },
    NextPatientCollapsed: { label: "Next patient's visit, last choice collapsed" },
    NextPatientOpen: { label: "Next patient's visit, last choice open" },
    ShravyaCollapsed: { label: "Second doctor's visit: own default (collapsed)" },
    ShravyaOpen: { label: "Second doctor opened it" },
  },
  transitions: [
    { from: "CollapsedEmpty", event: "clickHeading", to: "OpenEmpty" },
    { from: "OpenEmpty", event: "clickHeading", to: "CollapsedEmpty" },
    { from: "CollapsedEmpty", event: "pressEnterOnHeading", to: "OpenEmpty" },
    { from: "OpenEmpty", event: "pressSpaceOnHeading", to: "CollapsedEmpty" },
    { from: "OpenEmpty", event: "fillExam", to: "OpenFilled" },
    { from: "OpenFilled", event: "clickHeading", to: "CollapsedFilled" },
    { from: "CollapsedFilled", event: "clickHeading", to: "OpenFilled" },
    { from: "CollapsedFilled", event: "saveDraft", to: "SavedCollapsed" },
    { from: "SavedCollapsed", event: "reopenSavedVisit", to: "ReopenedWithData" },
    { from: "ReopenedWithData", event: "openNextPatientVisit", to: "NextPatientCollapsed" },
    { from: "NextPatientCollapsed", event: "reloadPage", to: "NextPatientCollapsed" },
    { from: "OpenFilled", event: "saveDraft", to: "SavedOpen" },
    { from: "SavedOpen", event: "openNextPatientVisit", to: "NextPatientOpen" },
    { from: "NextPatientOpen", event: "reloadPage", to: "NextPatientOpen" },
    { from: "NextPatientOpen", event: "switchToShravya", to: "ShravyaCollapsed" },
    { from: "ShravyaCollapsed", event: "clickHeading", to: "ShravyaOpen" },
  ],
};

const heading = (page) => page.getByRole("button", { name: "On Examination", exact: true });
const content = (page) => page.locator("#section-on-examination-content");
const acneInput = (page) => content(page).getByPlaceholder("mild/moderate/severe");
const itchInput = (page) => content(page).getByPlaceholder("0-10");
const detailInput = (page) => content(page).getByPlaceholder("Detailed physical examination findings...");

async function openVisit(ctx, patient, doctor) {
  ctx.vars.patient = patient;
  ctx.vars.doctor = doctor;
  await ctx.page.goto(`${ctx.baseUrl}/dashboard/visits?patientId=${patient.id}&doctorId=${doctor.id}&autoStart=true`, { timeout: 120000 });
  await openPrescriptionTab(ctx.page);
}

async function openPrescriptionTab(page) {
  await page.getByRole("tab", { name: /Prescription/ }).click({ timeout: 120000 });
  await page.locator("#section-treatment-heading").waitFor({ state: "visible", timeout: 60000 });
  await heading(page).waitFor({ state: "visible", timeout: 30000 });
}

async function newPatient(ctx, label) {
  const p = await fx.createPatient(ctx.shared, `${label} ${ctx.shared.tag}-${ctx.pathIndex}-${Date.now() % 1000}`, { gender: "F", age: 30 });
  return { id: p.id, name: p.name };
}

async function readPref(page, doctorId) {
  return page.evaluate((k) => window.localStorage.getItem(k), prefKey(doctorId));
}

function latestExam(patientId) {
  const row = fx.sql(`select id, coalesce(exam,'') from visits where "patientId"='${patientId}' and "deletedAt" is null order by "createdAt" desc limit 1`);
  const [id, exam] = row.split("\t");
  return { id, exam: exam || "" };
}

async function panelChecks(ctx, check, { open, filled, pref, otherPref }) {
  const { page } = ctx;
  const btn = heading(page);
  await btn.waitFor({ state: "visible", timeout: 30000 });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && (await btn.getAttribute("aria-expanded")) !== String(open)) await page.waitForTimeout(200);
  check((await btn.getAttribute("aria-expanded")) === String(open), `heading aria-expanded=${open}`);
  for (const label of LABELS) {
    const visible = await content(page).getByText(label, { exact: true }).isVisible();
    check(visible === open, `'${label}' ${open ? "visible" : "hidden"}`);
  }
  const badge = page.locator("#section-on-examination-heading").locator("xpath=..").getByText("filled", { exact: true });
  const badgeVisible = (await badge.count()) > 0 && (await badge.isVisible());
  check(badgeVisible === (!open && filled), `'filled' badge ${!open && filled ? "shown" : "absent"}`);
  if (filled) {
    check((await acneInput(page).inputValue()) === ACNE, `acne severity kept as '${ACNE}'`);
    check((await itchInput(page).inputValue()) === ITCH, `itch score kept as '${ITCH}'`);
    check((await detailInput(page).inputValue()) === ctx.vars.detail, "detailed examination text kept");
  } else {
    check((await acneInput(page).inputValue()) === "", "acne severity empty");
    check((await detailInput(page).inputValue()) === "", "detailed examination empty");
  }
  if (!open) {
    const h = await page.locator("#section-histories-heading").boundingBox();
    const oe = await btn.boundingBox();
    const tr = await page.locator("#section-treatment-heading").boundingBox();
    check(h && oe && tr && h.y < oe.y && oe.y < tr.y, "order is Patient History, On Examination heading, Treatment");
    check(tr.y - oe.y < 160, `Treatment follows the collapsed heading closely (${Math.round(tr.y - oe.y)}px)`);
  }
  if (pref !== undefined) {
    const got = await readPref(page, ctx.vars.doctor.id);
    check(got === pref, `stored choice for ${ctx.vars.doctor.email} is ${pref} (got ${got})`);
  }
  if (otherPref) {
    const got = await readPref(page, otherPref.doctor.id);
    check(got === otherPref.value, `stored choice for ${otherPref.doctor.email} still ${otherPref.value} (got ${got})`);
  }
}

function savedChecks(ctx, check) {
  const { id, exam } = latestExam(ctx.vars.patient.id);
  ctx.vars.savedVisitId = id;
  check(Boolean(id), `visit row exists for patient (${id})`);
  check(exam.includes(ctx.vars.detail), "DB exam holds the detailed examination text");
  check(exam.includes(`"${ACNE}"`), "DB exam holds acne severity");
  check(exam.includes(`"${SKIN}"`), "DB exam holds Fitzpatrick skin type");
  check(/"itchScore":\s*"?6"?/.test(exam), "DB exam holds itch score 6");
}

async function waitSaved(page) {
  await page.getByText(/^Saved( \d|$)/).first().waitFor({ state: "visible", timeout: 60000 });
}

async function toggleByKey(ctx, key) {
  ctx.vars.toggled = true;
  const btn = heading(ctx.page);
  await btn.focus();
  await ctx.page.keyboard.press(key);
}

const driver = {
  setup: async ({ baseUrl, apiUrl, shared }) => {
    await fx.createFixtures({ baseUrl, apiUrl, shared });
  },
  reset: async (ctx) => {
    await fx.loginBrowser(ctx, "praneeta@clinic.test");
    const p = await newPatient(ctx, "EXAM FIRST");
    await openVisit(ctx, p, ctx.shared.doctors.praneeta);
  },
  actions: {
    clickHeading: async (ctx) => {
      ctx.vars.toggled = true;
      await heading(ctx.page).click();
    },
    pressEnterOnHeading: async (ctx) => toggleByKey(ctx, "Enter"),
    pressSpaceOnHeading: async (ctx) => toggleByKey(ctx, "Space"),
    fillExam: async (ctx) => {
      const { page } = ctx;
      ctx.vars.detail = detailText(ctx);
      await content(page).getByRole("button", { name: SKIN, exact: true }).click();
      await acneInput(page).fill(ACNE);
      await itchInput(page).fill(ITCH);
      await detailInput(page).fill(ctx.vars.detail);
    },
    saveDraft: async (ctx) => {
      await ctx.page.getByRole("button", { name: "Save Draft", exact: true }).click();
      await waitSaved(ctx.page);
    },
    reopenSavedVisit: async (ctx) => {
      const { page } = ctx;
      await page.goto(`${ctx.baseUrl}/dashboard/visits?visitId=${ctx.vars.savedVisitId}&patientId=${ctx.vars.patient.id}`, { timeout: 120000 });
      await openPrescriptionTab(page);
      await detailInput(page).waitFor({ state: "attached" });
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline && (await detailInput(page).inputValue()) !== ctx.vars.detail) await page.waitForTimeout(250);
    },
    openNextPatientVisit: async (ctx) => {
      const p = await newPatient(ctx, "EXAM NEXT");
      await openVisit(ctx, p, ctx.shared.doctors.praneeta);
    },
    reloadPage: async (ctx) => {
      await ctx.page.reload({ timeout: 120000 });
      await openPrescriptionTab(ctx.page);
    },
    switchToShravya: async (ctx) => {
      await fx.loginBrowser(ctx, "shravya@clinic.test");
      const p = await newPatient(ctx, "EXAM SHRAVYA");
      await openVisit(ctx, p, ctx.shared.doctors.shravya);
    },
  },
  checks: {
    CollapsedEmpty: async (ctx, check) => panelChecks(ctx, check, { open: false, filled: false, pref: ctx.vars.toggled ? "false" : null }),
    OpenEmpty: async (ctx, check) => panelChecks(ctx, check, { open: true, filled: false, pref: "true" }),
    OpenFilled: async (ctx, check) => panelChecks(ctx, check, { open: true, filled: true, pref: "true" }),
    CollapsedFilled: async (ctx, check) => panelChecks(ctx, check, { open: false, filled: true, pref: "false" }),
    SavedCollapsed: async (ctx, check) => {
      await panelChecks(ctx, check, { open: false, filled: true, pref: "false" });
      savedChecks(ctx, check);
    },
    SavedOpen: async (ctx, check) => {
      await panelChecks(ctx, check, { open: true, filled: true, pref: "true" });
      savedChecks(ctx, check);
    },
    ReopenedWithData: async (ctx, check) => {
      check(ctx.page.url().includes(`visitId=${ctx.vars.savedVisitId}`), "the saved visit is the one open");
      await panelChecks(ctx, check, { open: true, filled: true, pref: "false" });
    },
    NextPatientCollapsed: async (ctx, check) => panelChecks(ctx, check, { open: false, filled: false, pref: "false" }),
    NextPatientOpen: async (ctx, check) => panelChecks(ctx, check, { open: true, filled: false, pref: "true" }),
    ShravyaCollapsed: async (ctx, check) =>
      panelChecks(ctx, check, { open: false, filled: false, pref: null, otherPref: { doctor: ctx.shared.doctors.praneeta, value: "true" } }),
    ShravyaOpen: async (ctx, check) =>
      panelChecks(ctx, check, { open: true, filled: false, pref: "true", otherPref: { doctor: ctx.shared.doctors.praneeta, value: "true" } }),
  },
};

module.exports = { model, driver };
