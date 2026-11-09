"use strict";
// Expected report values computed independently from the base tables (not from the report APIs).
const { sqlJson, sql } = require("./reports-fixture.cjs");
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const lit = (s) => String(s).replace(/'/g, "''");

function daysBetween(start, end) {
  const out = [];
  for (let d = new Date(start + "T00:00:00Z"); d <= new Date(end + "T00:00:00Z"); d = new Date(d.getTime() + 864e5)) out.push(d.toISOString().slice(0, 10));
  return out;
}
const istToday = () => sql(`select (now() at time zone 'Asia/Kolkata')::date`);
const istMonthStart = () => istToday().slice(0, 8) + "01";

const empty = () => ({ base: 0, sgst: 0, cgst: 0, igst: 0 });
const add = (a, b) => { a.base += b.base; a.sgst += b.sgst; a.cgst += b.cgst; a.igst += b.igst; };

function dayWise(start, end, type) {
  const days = new Map(daysBetween(start, end).map((d) => [d, { date: d, slabs: {}, numbers: [], returns: 0, total: empty(), amount: 0 }]));
  const put = (day, rate, v) => {
    const row = days.get(day); if (!row) return;
    add((row.slabs[rate] ||= empty()), v); add(row.total, v);
    row.amount += v.base + v.sgst + v.cgst + v.igst;
  };
  let billCount = 0, allNumbers = [];
  if (type === "SALES") {
    allNumbers = sqlJson(`select "invoiceNumber" n, status from pharmacy_invoices`);
    const rows = sqlJson(`select to_char(("invoiceDate" at time zone 'UTC' at time zone 'Asia/Kolkata')::date,'YYYY-MM-DD') as day, i."invoiceNumber" n, ii."taxPercent" rate, ii."totalAmount"-ii."taxAmount" base, ii."taxAmount" tax
      from pharmacy_invoices i join pharmacy_invoice_items ii on ii."invoiceId"=i.id where i.status='CONFIRMED'`);
    for (const r of rows) {
      const row = days.get(r.day); if (!row) continue;
      if (!row.numbers.includes(r.n)) { row.numbers.push(r.n); billCount++; }
      put(r.day, r.rate, { base: r.base, sgst: r.tax / 2, cgst: r.tax / 2, igst: 0 });
    }
    const docs = sqlJson(`select payload->>'date' as day, l->>'gstRate' rate, l->>'taxable' taxable, l->>'tax' tax from inventory_workflow_documents d, jsonb_array_elements(d.payload::jsonb->'lines') l
      where d.kind='SALES_RETURN' and d.status='POSTED'`.replace("payload->>'date'", "d.payload::jsonb->>'date'"));
    for (const d of docs) { if (days.has(d.day)) days.get(d.day).returns++; put(d.day, Number(d.rate), { base: -d.taxable, sgst: -d.tax / 2, cgst: -d.tax / 2, igst: 0 }); }
  } else {
    const rows = sqlJson(`select to_char(i."invoiceDate",'YYYY-MM-DD') as day, i."invoiceNumber" n, (it."cgstPercent"+it."sgstPercent"+it."igstPercent") rate, it."taxableAmount" base,
      it."taxableAmount"*it."sgstPercent"/100 sgst, it."taxableAmount"*it."cgstPercent"/100 cgst, it."taxableAmount"*it."igstPercent"/100 igst
      from pharmacy_purchase_invoices i join pharmacy_purchase_invoice_items it on it."purchaseInvoiceId"=i.id where i.status='STOCK_COMMITTED'`);
    for (const r of rows) {
      const row = days.get(r.day); if (!row) continue;
      if (!row.numbers.includes(r.n)) { row.numbers.push(r.n); billCount++; }
      put(r.day, r.rate, r);
    }
  }
  const list = [...days.values()].map((d) => {
    const nums = d.numbers.map((n) => Number(n.match(/(\d+)$/)[1])).sort((a, b) => a - b);
    const missing = type === "SALES" && nums.length ? allNumbers.filter((x) => { const k = Number(x.n.match(/(\d+)$/)[1]); return k > nums[0] && k < nums[nums.length - 1] && !d.numbers.includes(x.n); }) : [];
    return { ...d, nums, missing, noBills: d.numbers.length === 0 && d.returns === 0, amount: r2(d.amount) };
  });
  const totals = { total: empty(), slabs: {}, amount: 0, billCount };
  for (const d of list) { add(totals.total, d.total); totals.amount += d.amount; for (const [rate, v] of Object.entries(d.slabs)) add((totals.slabs[rate] ||= empty()), v); }
  totals.amount = r2(totals.amount);
  return { days: list, totals };
}

// Margin: one entry per item name. Sale lines from SALE stock transactions of CONFIRMED invoices, returns from POSTED SALES_RETURN documents.
function margin(start, end, search = "") {
  const inRange = (d) => d >= start && d <= end;
  const lines = [];
  const sales = sqlJson(`select to_char((i."invoiceDate" at time zone 'UTC' at time zone 'Asia/Kolkata')::date,'YYYY-MM-DD') as day, it.name, it."gstRate" gst, t.quantity q,
      (t.notes::json->>'costPerStockUnit')::float cost, (t.notes::json->'saleTerms'->>'taxablePerUnit')::float taxable, (t.notes::json->'saleTerms'->>'taxPerUnit')::float tax
      from stock_transactions t join pharmacy_invoices i on t.reference='INV-'||i."invoiceNumber" join inventory_items it on it.id=t."itemId" where t.type='SALE' and i.status='CONFIRMED'`);
  for (const s of sales) lines.push({ day: s.day, name: s.name, gst: s.gst, q: s.q, cost: s.cost, taxable: s.q * s.taxable, tax: s.q * s.tax });
  const rets = sqlJson(`select d.payload::jsonb->>'date' as day, it.name, it."gstRate" gst, (l->>'quantity')::int q, (l->>'taxable')::float taxable, (l->>'tax')::float tax,
      (select (t2.notes::json->>'costPerStockUnit')::float from stock_transactions t2 where t2.id=l->>'sourceLineId') cost
      from inventory_workflow_documents d, jsonb_array_elements(d.payload::jsonb->'lines') l join inventory_items it on it.id=l->>'inventoryId' where d.kind='SALES_RETURN' and d.status='POSTED'`);
  for (const s of rets) lines.push({ day: s.day, name: s.name, gst: s.gst, q: -s.q, cost: s.cost, taxable: -s.taxable, tax: -s.tax });
  const byName = new Map();
  for (const l of lines.filter((l) => inRange(l.day))) {
    const e = byName.get(l.name) || { name: l.name, qty: 0, sales: 0, purchase: 0, netGst: 0, profit: 0, knownTaxable: 0, unknownLines: 0, unknownSales: 0 };
    byName.set(l.name, e);
    e.qty += l.q; e.sales += l.taxable + l.tax;
    if (l.cost > 0) {
      const c = l.q * l.cost, g = c * l.gst / 100;
      e.purchase += c + g; e.netGst += l.tax - g; e.profit += l.taxable - c; e.knownTaxable += l.taxable;
    } else { e.unknownLines++; e.unknownSales += l.taxable + l.tax; }
  }
  const rows = [];
  for (const e of byName.values()) {
    const batches = sqlJson(`select category, manufacturer, "packSize", "packUnit", mrp, "currentStock", id, "createdAt" from inventory_items where name='${lit(e.name)}' order by "createdAt" desc`);
    const drug = sqlJson(`select category, "manufacturerName" m from drugs where name='${lit(e.name)}' limit 1`)[0] || {};
    const n = batches[0];
    const row = {
      ...e, category: n.category || drug.category || "", manufacturer: n.manufacturer || drug.m || "", unit: `${n.packSize} ${n.packUnit}`, mrp: n.mrp,
      stock: batches.reduce((s, b) => s + b.currentStock, 0), itemIds: batches.map((b) => b.id),
      pct: e.knownTaxable ? e.profit / e.knownTaxable * 100 : null,
    };
    for (const k of ["sales", "purchase", "netGst", "profit"]) row[k] = r2(row[k]);
    if (row.pct != null) row.pct = r2(row.pct);
    rows.push(row);
  }
  const q = search.trim().toLowerCase();
  const shown = rows.filter((r) => !q || [r.name, r.category, r.manufacturer].some((x) => (x || "").toLowerCase().includes(q)));
  shown.sort((a, b) => (b.pct ?? -1e9) - (a.pct ?? -1e9) || a.name.localeCompare(b.name));
  const t = { sales: 0, purchase: 0, netGst: 0, profit: 0, known: 0, unknownLines: 0, unknownSales: 0 };
  for (const r of shown) { t.sales += r.sales; t.purchase += r.purchase; t.netGst += r.netGst; t.profit += r.profit; t.known += r.knownTaxable; t.unknownLines += r.unknownLines; t.unknownSales += r.unknownSales; }
  const totals = { sales: r2(t.sales), purchase: r2(t.purchase), netGst: r2(t.netGst), profit: r2(t.profit), pct: t.known ? r2(t.profit / t.known * 100) : null, unknownLines: t.unknownLines, unknownSales: r2(t.unknownSales) };
  return { rows: shown, totals };
}

module.exports = { dayWise, margin, daysBetween, istToday, istMonthStart, r2 };
