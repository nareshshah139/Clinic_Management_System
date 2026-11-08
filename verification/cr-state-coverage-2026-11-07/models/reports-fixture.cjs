"use strict";
// Shared fixture for the CR-33c / CR-33d verification models.
// Everything is created through the real HTTP API; the only SQL is (a) linking drugs to their stock
// batches, (b) setting one batch's cost to 0 mid-run to make an uncosted sale, (c) backdating invoice
// dates (the API stamps "now"), (d) creating a PHARMACIST login. All of it lives here so the run is reproducible.
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");

const DB = process.env.VERIFY_DB || "postgresql://postgres@127.0.0.1:5433/verify_reports";
const PASSWORD = "password123";

function sql(query) {
  return execFileSync("psql", [DB, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();
}
const sqlJson = (query) => JSON.parse(sql(`select coalesce(json_agg(t), '[]'::json) from (${query}) t`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(apiUrl, identifier) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${apiUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, password: PASSWORD }) });
    if (res.status === 429) { await sleep(61000); continue; }
    if (!res.ok) throw new Error(`login ${identifier} -> ${res.status}`);
    return (await res.json()).access_token;
  }
  throw new Error(`login ${identifier} rate limited`);
}

function makeApi(apiUrl, token) {
  return async (method, path, body) => {
    const res = await fetch(`${apiUrl}${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    if (!res.ok) { const e = new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 800)}`); e.status = res.status; e.body = json; throw e; }
    return json;
  };
}

const purchaseLine = (productName, packSize, packUnitType, hsnCode, batchNumber, qty, free, mrp, rate, gst, igst = false) => {
  const taxableAmount = Math.round(qty * rate * 100) / 100;
  const gstAmount = Math.round(taxableAmount * gst) / 100;
  return {
    productName, packSize, packUnitType, hsnCode, batchNumber, expiryMonth: 6, expiryYear: 2028, quantityPurchased: qty, freeQuantity: free, mrp, discountPercent: 0,
    purchaseRate: rate, taxableAmount, cgstPercent: igst ? 0 : gst / 2, sgstPercent: igst ? 0 : gst / 2, igstPercent: igst ? gst : 0, gstAmount,
    lineTotal: Math.round((taxableAmount + gstAmount) * 100) / 100,
  };
};

// IST wall-clock -> UTC timestamp literal for the timestamp(3) without time zone columns
const at = (day, time) => `('${day}T${time}:00+05:30'::timestamptz at time zone 'UTC')`;

async function seed({ apiUrl, shared }) {
  const existing = Number(sql(`select count(*) from pharmacy_invoices`));
  // Second model in the same run (or a re-run): the data is already there, only log in. Reset for a clean seed: stop the API, dropdb verify_reports, createdb -T clinic_verify verify_reports, start the API.
  if (existing > 0) return load({ apiUrl, shared });

  shared.tokens = { admin: await login(apiUrl, "admin@clinic.test") };
  const api = makeApi(apiUrl, shared.tokens.admin);

  // PHARMACIST login (not in the seed): bcrypt of password123 copied from the seeded admin row
  sql(`insert into users (id,"firstName","lastName",email,password,role,status,"branchId","isActive","createdAt","updatedAt")
       select 'verify-pharmacist','Verify','Pharmacist','pharmacist@clinic.test',password,'PHARMACIST','ACTIVE',"branchId",true,now(),now() from users where email='admin@clinic.test'
       on conflict (email) do nothing`);
  shared.tokens.reception = await login(apiUrl, "reception@clinic.test");
  shared.tokens.doctor = await login(apiUrl, "praneeta@clinic.test");
  shared.tokens.pharmacist = await login(apiUrl, "pharmacist@clinic.test");

  // Drugs (product master) via the API, then linked to their existing stock batches
  const items = {
    adapalene: { name: "Adapalene 0.1% Gel 15g", category: "Acne" },
    sunscreen: { name: "Broad Spectrum Sunscreen SPF 50 50ml", category: "Sun Care" },
    glutathione: { name: "Glutathione 600 mg Injection (Vial)", category: "Aesthetic" },
    doxycycline: { name: "Doxycycline 100 mg Tablets (Strip of 10)", category: "Acne" },
    cetirizine: { name: "Cetirizine 10 mg Tablets (Strip of 10)", category: "Allergy" },
  };
  for (const [key, it] of Object.entries(items)) {
    const [row] = sqlJson(`select id,"gstRate","costPrice","sellingPrice","packSize","packUnit",mrp,"currentStock",manufacturer from inventory_items where name='${it.name.replace(/'/g, "''")}'`);
    Object.assign(it, { inventoryId: row.id, gst: row.gstRate, cost: row.costPrice, price: row.sellingPrice, stockBefore: row.currentStock, mrp: row.mrp });
    const drug = await api("POST", "/drugs", {
      name: it.name, price: row.sellingPrice, manufacturerName: row.manufacturer || "Fixture Labs", packSizeLabel: `${row.packSize} ${row.packUnit}`, category: it.category,
      composition1: it.name.split(" ")[0], dosageForm: "Dose", strength: "1 unit",
    });
    it.drugId = drug.id;
    sql(`insert into "_DrugToInventoryItem" ("A","B") values ('${drug.id}','${row.id}') on conflict do nothing`);
  }
  shared.items = items;
  // Product master for the IGST purchase bill's line (stock batch is created by the purchase commit)
  await api("POST", "/drugs", { name: "Minoxidil 5% Solution 60ml", price: 560, manufacturerName: "Fixture Labs", packSizeLabel: "60 ml", category: "Hair", composition1: "Minoxidil", dosageForm: "Solution", strength: "5%" });

  const line = (it, quantity) => ({ drugId: it.drugId, inventoryItemId: it.inventoryId, quantity, unitPrice: it.price, taxPercent: it.gst, itemType: "DRUG" });
  const plan = [
    { key: "b1", day: "2026-11-03", time: "10:15", confirm: true, items: [line(items.adapalene, 2), line(items.sunscreen, 1)] },
    { key: "b2", day: "2026-11-03", time: "17:40", confirm: true, items: [line(items.glutathione, 1)] },
    { key: "b3", day: "2026-11-04", time: "09:30", confirm: true, items: [line(items.doxycycline, 3)] },
    { key: "b4", day: "2026-11-04", time: "11:05", confirm: false, items: [line(items.cetirizine, 1)] }, // DRAFT: its number becomes the gap
    { key: "b5", day: "2026-11-04", time: "18:20", confirm: true, items: [line(items.adapalene, 1), line(items.sunscreen, 1)] },
    { key: "b6", day: "2026-11-06", time: "12:00", confirm: true, items: [line(items.doxycycline, 2), line(items.cetirizine, 5)], zeroCostBefore: items.doxycycline },
    { key: "b7", day: "2026-11-07", time: "10:45", confirm: true, items: [line(items.sunscreen, 1)] },
  ];
  shared.bills = {};
  for (const bill of plan) {
    if (bill.zeroCostBefore) sql(`update inventory_items set "costPrice"=0 where id='${bill.zeroCostBefore.inventoryId}'`); // item with no recorded cost from here on
    const inv = await api("POST", "/pharmacy/invoices", { patientId: "patient-seed-1", paymentMethod: "UPI", billingName: "John Doe", billingPhone: "9000001000", items: bill.items });
    if (bill.confirm) await api("PATCH", `/pharmacy/invoices/${inv.id}/status`, { status: "CONFIRMED" });
    sql(`update pharmacy_invoices set "invoiceDate"=${at(bill.day, bill.time)} where id='${inv.id}'`);
    shared.bills[bill.key] = { id: inv.id, number: inv.invoiceNumber, day: bill.day, confirmed: bill.confirm };
  }

  // Customer return of the sunscreen sold on 7 Nov (b7), through the inventory workflow
  const b7 = shared.bills.b7;
  const [sale] = sqlJson(`select id from stock_transactions where reference='INV-${b7.number}' and "itemId"='${items.sunscreen.inventoryId}' and type='SALE' limit 1`);
  if (sale) {
    const wf = makeApi(apiUrl, shared.tokens.admin);
    const doc = await wf("POST", "/inventory/workspace/documents", {
      kind: "SALES_RETURN", reference: "SR-VERIFY-01", requestKey: crypto.randomUUID(),
      payload: { date: "2026-11-07", reason: "Patient switched product", returnType: "OTHER", refundMode: "CASH", lines: [{ id: crypto.randomUUID(), inventoryId: items.sunscreen.inventoryId, sourceLineId: sale.id, quantity: 1, disposition: "RESTOCK" }] },
    });
    await wf("POST", `/inventory/workspace/documents/${doc.id}/transition`, { version: doc.version, action: "POST" });
    shared.returnPosted = true;
  }

  // One committed purchase invoice (credit bill, 12% + 18%) and one IGST cash bill
  const bills = [
    { distributorName: "Apex Pharma Distributors", distributorGstin: "29ABCDE1234F1Z5", distributorDlNo: "KA-BLR-20B-1122", invoiceNumber: "APX/2611/0457", invoiceDate: "2026-11-02", billType: "CREDIT", dueDate: "2026-12-02",
      items: [purchaseLine("Adapalene 0.1% Gel 15g", "15", "g", "30049099", "ADP2611", 20, 0, 125, 85, 12), purchaseLine("Broad Spectrum Sunscreen SPF 50 50ml", "50", "ml", "33049990", "SUN2611", 10, 0, 590, 470, 18)] },
    { distributorName: "Deccan Medisales", distributorGstin: "27ZZZZZ9999Z1Z1", distributorDlNo: "MH-PUN-21-778", invoiceNumber: "DM-88231", invoiceDate: "2026-11-04", billType: "CASH",
      items: [purchaseLine("Minoxidil 5% Solution 60ml", "60", "ml", "30049099", "MNX2611", 6, 1, 520, 410, 18, true)] },
  ];
  shared.purchases = [];
  for (const bill of bills) {
    const taxableAmount = bill.items.reduce((s, l) => s + l.taxableAmount, 0);
    const totalGst = bill.items.reduce((s, l) => s + l.gstAmount, 0);
    const half = (k) => Math.round(bill.items.reduce((s, l) => s + (l.taxableAmount * l[k]) / 100, 0) * 100) / 100;
    const body = { ...bill, grossAmount: taxableAmount, taxableAmount, totalCgst: half("cgstPercent"), totalSgst: half("sgstPercent"), totalIgst: half("igstPercent"), totalGst, netPayable: Math.round((taxableAmount + totalGst) * 100) / 100, doctorNameOrRegNo: "Dr Praneeta" };
    const draft = await api("POST", "/pharmacy/purchase-invoices/drafts", body);
    const id = draft.id ?? draft.invoice?.id;
    await api("PATCH", `/pharmacy/purchase-invoices/${id}/review`, { goodsReceivedDate: bill.invoiceDate });
    const done = await api("POST", `/pharmacy/purchase-invoices/${id}/commit-stock`);
    shared.purchases.push({ id, number: bill.invoiceNumber, status: done.status ?? done.invoice?.status });
  }
}

// Reuse an already seeded DB (same fixture): only log in and read ids back
async function load({ apiUrl, shared }) {
  shared.tokens = {};
  for (const [k, id] of [["admin", "admin@clinic.test"], ["reception", "reception@clinic.test"], ["doctor", "praneeta@clinic.test"], ["pharmacist", "pharmacist@clinic.test"]]) shared.tokens[k] = await login(apiUrl, id);
  shared.bills = {};
  for (const r of sqlJson(`select id,"invoiceNumber" n,status from pharmacy_invoices order by "invoiceNumber"`)) shared.bills["b" + Number(r.n.slice(-3))] = { id: r.id, number: r.n, confirmed: r.status === "CONFIRMED" };
}

module.exports = { seed, load, sql, sqlJson, login, makeApi, PASSWORD };
