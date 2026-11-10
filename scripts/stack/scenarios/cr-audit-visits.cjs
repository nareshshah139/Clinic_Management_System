// Change-request audit, Visits screen: CR-08, CR-16, CR-18, CR-19, CR-20, CR-21, CR-22, CR-23.
// Real backend, real frontend, real browser. Run: STACK_DATABASE_URL=postgresql://... node scripts/stack/scenarios/cr-audit-visits.cjs
const { start, sleep } = require("./cr-audit-lib.cjs");

const MEDICINES = [
  ["Tab. Flutas 150 mg", "Once a week after food"],
  ["Tab. Teczine 5 mg", "At night"],
  ["Cap. Sotret 10 mg", "Avoid pregnancy"],
  ["Tab. Levocet 5 mg", "After food"],
  ["Fucibet cream", "Apply thin layer on elbows"],
  ["Protar-K scalp solution", "Wash off in the morning"],
  ["Zimba cream", "1 pea size amount- whole face"],
  ["Cap. Antoxid-HC", "After breakfast"],
  ["Cwin lotion", "Moisturise twice daily"],
];
const INVESTIGATIONS = ["CBC", "ESR", "CRP", "LFT", "RFT", "FBS", "HbA1c", "TSH", "Vitamin D", "Ferritin"];
const LONG_INSTRUCTION = "1 pea size amount- whole face";

async function openVisit(a, page, query) {
  await a.go(page, `/dashboard/visits?${query}`);
  await page.getByRole("tab", { name: /Prescription/ }).first().click();
  await page.waitForSelector("#section-treatment-heading");
  await sleep(1200);
}

async function settlePrint(page) {
  let previous = "";
  for (let stable = 0; stable < 3; ) {
    await sleep(700);
    const snapshot = await page.evaluate(() => {
      const root = document.querySelector("#pagedjs-container");
      const pages = root ? root.querySelectorAll(".pagedjs_page").length : 0;
      const height = root ? [...root.querySelectorAll(".pagedjs_page_content")].flatMap((el) => [...el.children]).reduce((sum, el) => sum + el.getBoundingClientRect().height, 0) : 0;
      return `${pages}:${Math.round(height)}`;
    });
    stable = snapshot === previous && !snapshot.startsWith("0:") ? stable + 1 : 0;
    previous = snapshot;
  }
}

async function setOptimized(page, enabled) {
  const box = page.locator("label", { hasText: "Space-optimized layout" }).locator("input");
  if ((await box.isChecked()) !== enabled) await box.click();
  await settlePrint(page);
}

function measurePrint(page) {
  return page.evaluate(() => {
    const root = document.querySelector("#pagedjs-container");
    const labels = ["Chief Complaints", "History", "Personal history", "Examination", "Diagnosis", "Investigations", "Procedures", "Procedure Planned", "Review Date", "Follow-up", "Follow-up Instructions"];
    const fields = {};
    for (const el of root.querySelectorAll(".pagedjs_page_content span, .pagedjs_page_content div")) {
      if (el.children.length) continue;
      const name = el.textContent.trim().replace(/:$/, "");
      if (!labels.includes(name) || fields[name]) continue;
      const value = el.nextElementSibling;
      if (!value) continue;
      const l = el.getBoundingClientRect();
      const v = value.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(value);
      const lines = [...range.getClientRects()];
      fields[name] = {
        labelTop: Math.round(l.top), labelRight: Math.round(l.right), valueTop: Math.round(v.top), valueLeft: Math.round(v.left),
        fontSize: getComputedStyle(value).fontSize, labelWeight: getComputedStyle(el).fontWeight, valueWeight: getComputedStyle(value).fontWeight,
        lineCount: new Set(lines.map((r) => Math.round(r.top))).size, minLineLeft: Math.round(Math.min(...lines.map((r) => r.left))),
        value: value.textContent.trim().slice(0, 80),
      };
    }
    const content = [...root.querySelectorAll(".pagedjs_page_content")].flatMap((el) => [...el.children]);
    const text = root.textContent;
    return {
      pages: root.querySelectorAll(".pagedjs_page").length,
      height: Math.round(content.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0)),
      rxRows: root.querySelectorAll(".rx-row").length,
      fields,
      printsTriggers: /Triggers:/.test(text),
      printsPriorTx: /Prior Tx:/.test(text),
    };
  });
}

(async () => {
  const a = await start("cr-audit-visits");
  const { stack, check, shot } = a;
  const owner = await a.tokenFor("owner");
  const doctorId = stack.users.doctor.id;
  const tag = String(Date.now()).slice(-5);
  const phone = (n) => `98${tag}${String(n).padStart(3, "0")}`;
  const first = await a.api(owner, "POST", "/patients", { name: `ABHILASH ${tag}`, phone: phone(1), gender: "F", age: 33 });
  const second = await a.api(owner, "POST", "/patients", { name: `SATYA ANIL ${tag}`, phone: phone(2), gender: "M", age: 41 });
  const { page } = await a.session("doctor");

  // ---------- CR-21: identity stays on screen ----------
  await a.go(page, `/dashboard/visits?patientId=${first.id}&doctorId=${doctorId}&autoStart=true`);
  const bar = page.getByTestId("visit-identity").first();
  await bar.waitFor();
  await page.waitForFunction(() => /Doctor:/.test(document.querySelector('[data-testid="visit-identity"]')?.textContent || ""), null, { timeout: 30000 }).catch(() => {});
  const identity = ((await bar.textContent()) || "").replace(/\s+/g, " ").trim();
  check("CR-21", "3", "Header reads the patient from the visit (no \"Patient: Unknown\")", identity.includes(`Patient: ABHILASH ${tag}`) && !/Unknown/.test(await page.locator("body").innerText()), identity);
  check("CR-21", "2", "Works on a brand-new patient's Visit #1", (await page.getByText("Visit #1").count()) > 0 && identity.includes("33") && identity.includes("Female"), identity);
  await shot(page, "cr21-1-context-open");
  await page.getByRole("button", { name: "Hide patient context" }).click();
  await sleep(500);
  const afterCollapse = ((await bar.textContent()) || "").replace(/\s+/g, " ").trim();
  const bodyCollapsed = await page.locator("main").innerText();
  check("CR-21", "1", "Name, age and sex stay visible with Patient Context collapsed", /ABHILASH/.test(afterCollapse) && /33/.test(afterCollapse) && /Female/.test(afterCollapse), afterCollapse);
  check("CR-21", "5", "Collapsing hides only the extra detail (ID, phone)", !bodyCollapsed.includes(phone(1)) && (await page.getByRole("button", { name: /Show Patient Context/ }).count()) === 1, `phone visible: ${bodyCollapsed.includes(phone(1))}`);
  await shot(page, "cr21-2-context-collapsed");
  await page.getByRole("tab", { name: /Prescription/ }).first().click();
  await page.waitForSelector("#section-treatment-heading");
  await page.locator("#section-treatment-heading").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector("#section-investigations-heading").scrollIntoView({ block: "center" }));
  await sleep(600);
  const sticky = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="visit-identity"]');
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + 40, r.top + r.height / 2);
    return { top: Math.round(r.top), inView: r.top >= 0 && r.bottom <= window.innerHeight, onTop: Boolean(top && (el.contains(top) || top.contains(el))), scrolled: Math.round(document.querySelector("main").scrollTop) };
  });
  check("CR-21", "4", "Identity line stays on screen while scrolled down to the Rx section", sticky.inView && sticky.onTop && sticky.scrolled > 300, JSON.stringify(sticky));
  await shot(page, "cr21-3-sticky-while-scrolled");

  // ---------- CR-22: On Examination collapsible ----------
  const heading = page.getByRole("button", { name: "On Examination", exact: true });
  await heading.scrollIntoViewIfNeeded();
  const closedByDefault = (await heading.getAttribute("aria-expanded")) === "false" && (await page.locator("#section-on-examination-content").isHidden());
  check("CR-22", "2", "On Examination is collapsed by default", closedByDefault, `aria-expanded=${await heading.getAttribute("aria-expanded")}`);
  await page.evaluate(() => document.querySelector("#section-histories-heading").scrollIntoView({ block: "start" }));
  await sleep(400);
  await shot(page, "cr22-1-collapsed-by-default");
  await heading.click();
  const opened = (await heading.getAttribute("aria-expanded")) === "true" && (await page.getByText("Fitzpatrick Skin Type").isVisible()) && (await page.getByText("Detailed Examination").isVisible());
  check("CR-22", "1", "Clicking the heading opens the section with all its fields", opened);
  await heading.scrollIntoViewIfNeeded();
  await shot(page, "cr22-2-opened");
  await page.locator("#section-on-examination-content textarea").last().fill("Erythematous papules over both cheeks");
  await heading.click();
  check("CR-22", "5", "Collapsing hides the fields without deleting what was typed", (await page.locator("#section-on-examination-content textarea").last().inputValue()) === "Erythematous papules over both cheeks" && (await page.locator("#section-on-examination-content").isHidden()));
  const stored = await page.evaluate((id) => localStorage.getItem(`cms.ui.onExamination.open.${id}`), doctorId);
  check("CR-22", "4", "The doctor's last choice is remembered", stored === "false", `stored preference = ${stored}`);

  // ---------- CR-18: Patient History fields ----------
  const history = page.locator("#section-histories-content");
  const labels = (await history.locator("label").allTextContents()).map((t) => t.trim());
  check("CR-18", "1", "\"Triggers\" field removed from Patient History", !labels.includes("Triggers"), `labels: ${labels.join(", ")}`);
  check("CR-18", "2", "\"Prior Treatments\" field removed from Patient History", !labels.includes("Prior Treatments"), (await history.locator('input[placeholder="Topicals/systemics tried"]').count()) ? "input with placeholder \"Topicals/systemics tried\" still renders" : "");
  check("CR-18", "3", "\"Personal history\" field is present", (await history.locator("#personal-history").count()) === 1);
  await page.evaluate(() => document.querySelector("#section-histories-heading").scrollIntoView({ block: "start" }));
  await sleep(300);
  await shot(history, "cr18-patient-history-fields");

  // ---------- CR-19: Rx table ----------
  const treatment = page.locator("#section-treatment-content");
  for (let i = 0; i < 3; i++) await treatment.getByRole("button", { name: "Add Row", exact: true }).click();
  const rxRows = treatment.locator("tbody tr");
  for (const [i, name] of ["Isotroin 20 Capsule", "Trudema gentle cleanser", "Epiduo gel"].entries()) {
    await rxRows.nth(i).getByPlaceholder("Search medicine name...").fill(name);
    await rxRows.nth(i).getByPlaceholder("e.g., Avoid alcohol").fill(i === 1 ? "Wash twice daily" : LONG_INSTRUCTION);
  }
  await page.keyboard.press("Escape");
  const widths = await treatment.evaluate((root) => {
    const row = root.querySelector("tbody tr");
    const cells = [...row.children].map((td) => Math.round(td.getBoundingClientRect().width));
    const duration = row.querySelector('input[type="number"]');
    const instruction = row.querySelector('input[placeholder="e.g., Avoid alcohol"]');
    return { cells, durationInput: Math.round(duration.getBoundingClientRect().width), instructionInput: Math.round(instruction.getBoundingClientRect().width), clipped: instruction.scrollWidth > instruction.clientWidth, scrollWidth: instruction.scrollWidth, clientWidth: instruction.clientWidth };
  });
  const durationCell = widths.cells[3];
  const instructionCell = widths.cells[4];
  check("CR-19", "1", "Duration column is narrow (no wider than the value it holds)", durationCell <= 190, `Duration column ${durationCell}px wide`);
  check("CR-19", "2", `Instructions column shows "${LONG_INSTRUCTION}" in full`, !widths.clipped && instructionCell > durationCell, `Instructions column ${instructionCell}px, text needs ${widths.scrollWidth}px of ${widths.clientWidth}px`);
  const perRowAdd = await rxRows.first().locator("td").last().getByRole("button").allTextContents();
  check("CR-19", "3", "Add Row is available after every row (insert in the middle)", perRowAdd.some((t) => /add/i.test(t)), `buttons on a row: ${perRowAdd.map((t) => t.trim()).join(", ") || "none"}`);
  const before = await rxRows.count();
  await rxRows.first().getByPlaceholder("Search medicine name...").focus();
  await treatment.getByRole("button", { name: "Add Row", exact: true }).click();
  const names = await rxRows.evaluateAll((trs) => trs.map((tr) => tr.querySelector('input[placeholder="Search medicine name..."]').value));
  const lastNamed = names.reduce((last, name, i) => (name ? i : last), -1);
  const insertedInside = names.some((name, i) => !name && i < lastNamed);
  check("CR-19", "3b", "With the first row active, Add Row inserts below it rather than at the end", insertedInside, `rows ${before} -> ${names.length}; order: ${names.map((n) => n || "(blank)").join(" | ")}`);
  await page.evaluate(() => document.querySelector("#section-treatment-heading").scrollIntoView({ block: "start" }));
  await sleep(300);
  await shot(page, "cr19-rx-table");

  // ---------- CR-20: custom investigations saved for the clinic ----------
  const inv = page.locator("#section-investigations-content");
  const custom = `Serum Zinc ${tag}`;
  await inv.locator("#custom-investigation-name").fill(custom);
  await inv.getByRole("button", { name: "Add custom investigation" }).click();
  await inv.getByLabel(custom, { exact: true }).waitFor();
  check("CR-20", "1a", "A typed custom investigation is added and ticked on this prescription", await inv.getByLabel(custom, { exact: true }).isChecked());
  await inv.scrollIntoViewIfNeeded();
  await shot(inv, "cr20-1-custom-added");
  const saved = await a.api(owner, "GET", "/clinic-investigations");
  check("CR-20", "1", "It is saved permanently on the server", JSON.stringify(saved).includes(custom), `GET /clinic-investigations returns ${Array.isArray(saved) ? saved.length : "?"} saved item(s)`);

  // second patient, fresh browser storage: the investigation must be a standing checkbox
  const { page: page2 } = await a.session("doctor");
  await openVisit(a, page2, `patientId=${second.id}&doctorId=${doctorId}&autoStart=true`);
  const inv2 = page2.locator("#section-investigations-content");
  const standing = (await inv2.getByLabel(custom, { exact: true }).count()) === 1 && !(await inv2.getByLabel(custom, { exact: true }).isChecked());
  check("CR-20", "2", "It appears as a standing, unticked checkbox on another patient's prescription", standing);
  await inv2.scrollIntoViewIfNeeded();
  await shot(inv2, "cr20-2-standing-checkbox-other-patient");
  await inv2.getByRole("button", { name: "Manage saved investigations" }).click();
  await sleep(400);
  await shot(inv2, "cr20-3-manage-saved");
  const renamed = `Serum Zinc level ${tag}`;
  await inv2.getByRole("button", { name: `Rename ${custom}` }).click();
  await inv2.getByRole("textbox", { name: `New name for ${custom}` }).fill(renamed);
  await inv2.getByRole("button", { name: `Save new name for ${custom}` }).click();
  await inv2.getByLabel(renamed, { exact: true }).waitFor();
  check("CR-20", "3a", "The clinic can rename a saved investigation", (await inv2.getByLabel(custom, { exact: true }).count()) === 0);
  await inv2.getByRole("button", { name: `Remove ${renamed}` }).click();
  await inv2.getByRole("button", { name: `Confirm removing ${renamed}` }).click();
  await sleep(800);
  check("CR-20", "3b", "The clinic can remove a saved investigation", (await inv2.getByLabel(renamed, { exact: true }).count()) === 0 && !JSON.stringify(await a.api(owner, "GET", "/clinic-investigations")).includes(renamed));

  // CR-22 point 4 across visits: still collapsed on the next patient (same browser as the first visit)
  await openVisit(a, page, `patientId=${second.id}&doctorId=${doctorId}&autoStart=true`);
  check("CR-22", "4b", "Open the next visit: On Examination is still collapsed", (await page.getByRole("button", { name: "On Examination", exact: true }).getAttribute("aria-expanded")) === "false");

  // ---------- CR-08 + CR-23: space-optimised print, 9 medicines and 10 investigations ----------
  const builtIn = (await page.locator("#section-investigations-content label").allTextContents()).map((t) => t.trim());
  const ticks = INVESTIGATIONS.filter((name) => builtIn.includes(name));
  await page.locator("#section-chief-complaints-content textarea").first().fill("Itchy scaly patches on scalp and elbows for 3 months");
  await page.getByRole("textbox", { name: "Diagnosis" }).fill("Plaque psoriasis with seborrhoeic dermatitis of scalp");
  await page.getByRole("textbox", { name: "Past history" }).fill("Hypothyroidism on treatment");
  await page.locator("#personal-history").fill("Non-smoker, vegetarian, desk job");
  const triggerInput = page.locator('#section-histories-content input[placeholder="Heat, stress, cosmetics..."]');
  const priorInput = page.locator('#section-histories-content input[placeholder="Topicals/systemics tried"]');
  if (await triggerInput.count()) await triggerInput.fill("Heat");
  if (await priorInput.count()) await priorInput.fill("Topical steroids");
  const rx = page.locator("#section-treatment-content");
  for (const [i, [name, instruction]] of MEDICINES.entries()) {
    await rx.getByRole("button", { name: "Add Row", exact: true }).click();
    const row = rx.locator("tbody tr").nth(i);
    await row.getByPlaceholder("Search medicine name...").fill(name);
    await page.keyboard.press("Escape");
    await row.locator('input[type="number"]').fill("30");
    await row.getByPlaceholder("e.g., Avoid alcohol").fill(instruction);
  }
  for (const name of ticks) await page.locator("#section-investigations-content").getByLabel(name, { exact: true }).check();
  await page.getByRole("textbox", { name: "Procedures performed" }).fill("MNF (30 mins) + Retinoin CT (6 hours) done for face; wash at 12 am");
  await page.getByRole("textbox", { name: "Procedures planned" }).fill("2nd Peel");
  await page.getByRole("textbox", { name: "Follow-up instructions" }).fill("Post care - 7 days");
  await page.getByRole("textbox", { name: "Review date" }).fill("2026-11-28");
  await page.getByRole("button", { name: "Print Preview", exact: true }).click();
  await page.waitForSelector("#pagedjs-container .pagedjs_page", { timeout: 90000 });
  await setOptimized(page, false);
  const normal = await measurePrint(page);
  await shot(page.locator("#pagedjs-container .pagedjs_page").first(), "cr23-1-normal-layout-page1");
  await setOptimized(page, true);
  const optimized = await measurePrint(page);
  await shot(page, "cr08-1-print-preview-optimized-ticked");
  await shot(page.locator("#pagedjs-container .pagedjs_page").first(), "cr08-2-optimized-page1");

  const inline = (f) => f && Math.abs(f.labelTop - f.valueTop) < 4 && f.valueLeft > f.labelRight - 1;
  for (const [point, label] of [["a", "Chief Complaints"], ["b", "History"], ["c", "Personal history"], ["d", "Examination"], ["e", "Diagnosis"], ["f", "Investigations"], ["g", "Procedures"], ["h", "Procedure Planned"], ["i", "Review Date"], ["j", "Follow-up"]]) {
    const f = optimized.fields[label];
    check("CR-08", `block-${point}`, `${label}: heading and value print on one line`, inline(f), f ? `label y=${f.labelTop}, value y=${f.valueTop}, value "${f.value}"` : "block does not print at all");
  }
  const dx = optimized.fields.Diagnosis;
  check("CR-08", "rule-1", "Label bold, value normal weight", Object.values(optimized.fields).every((f) => Number(f.labelWeight) >= 600 && Number(f.valueWeight) <= 500), dx ? `label ${dx.labelWeight}, value ${dx.valueWeight}` : "");
  const longInv = optimized.fields.Investigations;
  check("CR-08", "rule-2", "A long value wraps under the value, not under the label", longInv && (longInv.lineCount === 1 || longInv.minLineLeft >= longInv.labelRight - 1), longInv ? `${longInv.lineCount} line(s); wrapped lines start at x=${longInv.minLineLeft}, label ends at x=${longInv.labelRight}` : "");
  check("CR-23", "4", `${optimized.rxRows} medicines and ${ticks.length} investigations fit on one page with Space-optimized layout ticked`, optimized.pages === 1 && optimized.rxRows === MEDICINES.length, `optimized ${optimized.pages} page(s); normal layout ${normal.pages} page(s)`);
  check("CR-23", "1-3", "Vertical space is tighter than the normal layout", optimized.height < normal.height * 0.9, `content height ${normal.height}px normal -> ${optimized.height}px optimized`);
  check("CR-23", "5", "Text size is not reduced", Object.keys(optimized.fields).every((k) => !normal.fields[k] && !normal.fields[`${k} Instructions`] ? true : optimized.fields[k].fontSize === (normal.fields[k] || normal.fields[`${k} Instructions`]).fontSize), `value text ${dx ? dx.fontSize : "?"} in both layouts`);
  check("CR-18", "print", "Triggers / Prior Tx no longer print under History", !optimized.printsTriggers && !optimized.printsPriorTx, optimized.fields.History ? `History line prints: "${optimized.fields.History.value}"` : "");
  await setOptimized(page, false);
  const restored = await measurePrint(page);
  check("CR-08", "rule-5", "Unticking returns the normal layout unchanged", restored.height === normal.height && restored.pages === normal.pages, `height ${restored.height}px vs ${normal.height}px, pages ${restored.pages} vs ${normal.pages}`);
  check("CR-23", "6", "Normal layout keeps its roomier spacing", restored.height === normal.height);

  // ---------- CR-16: past-visit panel on the follow-up ----------
  await page.getByRole("button", { name: "Close", exact: true }).first().click().catch(() => {});
  await page.keyboard.press("Escape");
  await sleep(600);
  await page.getByRole("button", { name: "Create Prescription", exact: true }).click();
  await page.getByRole("button", { name: "Stay Here" }).click({ timeout: 30000 });
  await sleep(800);
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await sleep(2500);
  const { page: follow } = await a.session("doctor");
  await a.go(follow, `/dashboard/patients/${second.id}`);
  await follow.getByRole("tab", { name: /History/ }).first().click();
  const card = follow.locator('[data-slot="card"]').filter({ hasText: "Itchy scaly patches" }).last();
  await card.waitFor({ timeout: 60000 });
  await card.getByRole("button", { name: "Show details" }).click();
  await sleep(600);
  const compact = (await card.innerText()).replace(/\s+/g, " ");
  const shows = (t) => compact.includes(t);
  check("CR-16", "2", "Compact panel shows chief complaints", shows("Itchy scaly patches on scalp and elbows"));
  check("CR-16", "3", "Compact panel shows personal history and other history", shows("Non-smoker, vegetarian, desk job") && shows("Hypothyroidism"));
  check("CR-16", "4", "Compact panel lists medicine names", MEDICINES.every(([name]) => shows(name)), `${MEDICINES.filter(([name]) => shows(name)).length} of ${MEDICINES.length} names listed`);
  const regimenWords = ["Frequency", "Dose Pattern", "Timing", "Duration", "Dosage", "Quantity", "Route", "Generic", "Gst", "30"].filter((w) => new RegExp(`\\b${w}\\b`).test(compact.replace(/\d{2} \w{3} \d{4}/g, "")));
  check("CR-16", "5", "No frequency, dose, timing, duration, quantity, route, generic or GST in the default panel", regimenWords.length === 0, regimenWords.length ? `found: ${regimenWords.join(", ")}` : "");
  const once = MEDICINES.every(([name]) => compact.split(name).length === 2);
  check("CR-16", "6", "Each medicine appears once", once);
  const internal = ["Regimen State", "Touched", "Gst Rate", "Language", "timing duration instructions"];
  check("CR-16", "7", "Internal fields (Regimen State, Touched, Gst Rate, Language) are gone", internal.every((w) => !compact.includes(w)));
  const box = await card.boundingBox();
  check("CR-16", "check-1", "The panel fits on screen without scrolling", box.height < 900, `panel is ${Math.round(box.height)}px tall in a 900px window`);
  await card.scrollIntoViewIfNeeded();
  await shot(follow, "cr16-1-compact-panel");
  await card.getByRole("button", { name: "Full details" }).click();
  await sleep(600);
  const full = (await card.innerText()).replace(/\s+/g, " ");
  check("CR-16", "8", "The full regimen is one click away (Full details)", /Prescription/.test(full) && /30/.test(full) && /Avoid pregnancy/.test(full));
  check("CR-16", "7b", "Full details also hides the internal fields", internal.every((w) => !full.includes(w)), internal.filter((w) => full.includes(w)).join(", "));
  await shot(follow, "cr16-2-full-details", { fullPage: false });
  check("CR-16", "8b", "Full details switches back to the compact view", (await card.getByRole("button", { name: "Compact view" }).count()) === 1);

  // ---------- CR-08 rule 3: empty fields print nothing ----------
  const third = await a.api(owner, "POST", "/patients", { name: `KIRAN ${tag}`, phone: phone(3), gender: "M", age: 29 });
  const { page: bare } = await a.session("doctor");
  await openVisit(a, bare, `patientId=${third.id}&doctorId=${doctorId}&autoStart=true`);
  await bare.locator("#section-chief-complaints-content textarea").first().fill("Dry skin");
  await bare.locator("#section-treatment-content").getByRole("button", { name: "Add Row", exact: true }).click();
  await bare.locator("#section-treatment-content tbody tr").first().getByPlaceholder("Search medicine name...").fill("Cwin lotion");
  await bare.keyboard.press("Escape");
  await bare.getByRole("button", { name: "Print Preview", exact: true }).click();
  await bare.waitForSelector("#pagedjs-container .pagedjs_page", { timeout: 90000 });
  await setOptimized(bare, true);
  const blank = await bare.evaluate(() => document.querySelector("#pagedjs-container").textContent);
  const emptyHeadings = ["Follow-up", "Investigations", "Procedures", "Procedure Planned", "Review Date", "Personal history"].filter((h) => blank.includes(h));
  check("CR-08", "rule-3a", "Blank Follow-up, Investigations, Procedures, Review Date and Personal history print nothing", emptyHeadings.length === 0, emptyHeadings.join(", "));
  check("CR-08", "rule-3b", "A blank Diagnosis prints nothing (no empty heading)", !/Diagnosis/.test(blank), /Diagnosis:\s*—/.test(blank) ? "prints \"Diagnosis: —\"" : "");
  await shot(bare.locator("#pagedjs-container .pagedjs_page").first(), "cr08-3-blank-fields-page1");

  await a.finish("cr-audit-visits");
})().catch((error) => {
  console.error("CRASH", error);
  process.exit(1);
});
