"use strict";

const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const DB_URL = process.env.VERIFY_DB_URL || "postgresql://postgres@127.0.0.1:5433/verify_visits";
const PASSWORD = "password123";

function sql(query) {
  return execFileSync("psql", [DB_URL, "-At", "-F", "\t", "-c", query], { encoding: "utf8" }).trim();
}

const tokenCache = new Map();
const cacheFile = process.env.VERIFY_TOKEN_CACHE;

function loadCache() {
  if (!cacheFile || tokenCache.size) return;
  try {
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(cacheFile, "utf8")))) {
      const exp = JSON.parse(Buffer.from(v.token.split(".")[1], "base64url").toString()).exp * 1000;
      if (exp > Date.now() + 3600000) tokenCache.set(k, v);
    }
  } catch {}
}

async function apiLogin(baseUrl, identifier) {
  loadCache();
  if (tokenCache.has(identifier)) return tokenCache.get(identifier);
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password: PASSWORD }),
  });
  if (!res.ok) throw Error(`login ${identifier} failed ${res.status}`);
  const body = await res.json();
  const entry = { token: body.access_token, user: body.user };
  tokenCache.set(identifier, entry);
  if (cacheFile) fs.writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(tokenCache)));
  return entry;
}

async function api(apiUrl, token, method, path, body) {
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const phone = () => `9${String(Date.now()).slice(-6)}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;

function todayIst(plusDays = 0) {
  return new Date(Date.now() + 330 * 60000 + plusDays * 86400000).toISOString().slice(0, 10);
}

async function createFixtures({ baseUrl, apiUrl, shared }) {
  const tag = String(Date.now()).slice(-5);
  const admin = await apiLogin(baseUrl, "admin@clinic.test");
  const praneeta = await apiLogin(baseUrl, "praneeta@clinic.test");
  const shravya = await apiLogin(baseUrl, "shravya@clinic.test");
  const mk = (name, extra) => api(apiUrl, admin.token, "POST", "/patients", { name, phone: phone(), ...extra });

  const fresh = await mk(`ABHILASH ${tag}`, { gender: "F", age: 33 });
  const appt = await mk(`MEERA APPT ${tag}`, { gender: "F", age: 41 });
  const dobOnly = await mk(`RAVI DOB ${tag}`, { gender: "M", dob: "1985-03-15" });
  sql(`update patients set age = null where id = '${dobOnly.id}'`);
  const other = await mk(`SITA OTHER ${tag}`, { gender: "F", age: 52 });
  const third = await mk(`KIRAN THIRD ${tag}`, { gender: "M", age: 29 });

  let appointment = null;
  for (let day = 0; !appointment && day < 60; day++) {
    appointment = await api(apiUrl, admin.token, "POST", "/appointments", {
      patientId: appt.id,
      doctorId: praneeta.user.id,
      date: todayIst(day),
      slot: "16:00-16:30",
      visitType: "OPD",
    }).catch((e) => (/409|in the past/i.test(e.message) ? null : Promise.reject(e)));
  }

  const resumeVisit = await api(apiUrl, shravya.token, "POST", "/visits", {
    patientId: "patient-seed-1",
    doctorId: shravya.user.id,
    complaints: [{ complaint: "Itching on forearms" }],
  });

  const list = await api(apiUrl, admin.token, "GET", "/patients?page=1&limit=1");
  const firstRowId = (list.data || list)[0].id;

  Object.assign(shared, {
    tag,
    doctors: {
      praneeta: { id: praneeta.user.id, email: "praneeta@clinic.test", name: "Dr. Praneeta Jain" },
      shravya: { id: shravya.user.id, email: "shravya@clinic.test", name: "Dr. Shravya Dermatologist" },
    },
    patients: {
      fresh: { id: fresh.id, name: fresh.name, age: "33", sex: "Female" },
      appt: { id: appt.id, name: appt.name, age: "41", sex: "Female" },
      dobOnly: { id: dobOnly.id, name: dobOnly.name, age: "41", sex: "Male" },
      other: { id: other.id, name: other.name, age: "52", sex: "Female" },
      third: { id: third.id, name: third.name, age: "29", sex: "Male" },
      seed: { id: "patient-seed-1", name: "John Doe", age: "36", sex: "Male" },
    },
    appointment: { id: appointment.id },
    resumeVisit: { id: resumeVisit.id },
    firstRowId,
    adminToken: admin.token,
    apiUrl,
  });
  return shared;
}

async function createPatient(shared, name, extra) {
  const p = await api(shared.apiUrl, shared.adminToken, "POST", "/patients", { name, phone: phone(), ...extra });
  return p;
}

async function firstPatientRowId(shared) {
  const list = await api(shared.apiUrl, shared.adminToken, "GET", "/patients?page=1&limit=1");
  return (list.data || list)[0].id;
}

async function loginBrowser(ctx, email) {
  const { token } = await apiLogin(ctx.baseUrl, email);
  await ctx.context.clearCookies();
  await ctx.context.addCookies([{ name: "auth_token", value: token, url: ctx.baseUrl, httpOnly: true, sameSite: "Lax" }]);
}

const identityBar = (page) => page.getByTestId("visit-identity");

async function identityText(page) {
  const bar = identityBar(page);
  await bar.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="visit-identity"]');
      return el && /Doctor:/.test(el.textContent || "");
    },
    null,
    { timeout: 30000 },
  ).catch(() => {});
  return ((await bar.textContent()) || "").replace(/\s+/g, " ").trim();
}

async function barInViewport(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="visit-identity"]');
    if (!el) return { ok: false, reason: "no bar" };
    const r = el.getBoundingClientRect();
    const label = (el.querySelector("span") || el).getBoundingClientRect();
    const main = (document.querySelector("main") || document.body).getBoundingClientRect();
    const vertical = r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0;
    const horizontal = label.left >= main.left && label.right <= Math.min(main.right, window.innerWidth);
    const topEl = document.elementFromPoint(Math.min(label.left + 4, window.innerWidth - 1), r.top + r.height / 2);
    const onTop = Boolean(topEl && (el.contains(topEl) || topEl.contains(el) || el.parentElement.contains(topEl)));
    return { ok: vertical && horizontal && onTop, top: Math.round(r.top), labelLeft: Math.round(label.left), mainLeft: Math.round(main.left), onTop };
  });
}

async function mainScrollTop(page) {
  return page.evaluate(() => (document.querySelector("main") || document.scrollingElement).scrollTop);
}

module.exports = { sql, api, createPatient, firstPatientRowId, createFixtures, loginBrowser, identityBar, identityText, barInViewport, mainScrollTop, todayIst };
