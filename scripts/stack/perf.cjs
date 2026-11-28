const assert = require("node:assert/strict");
const { setTimeout: pause } = require("node:timers/promises");
const { bootStack } = require("./boot.cjs");
const { DAY, seed } = require("./perf-seed.cjs");

const concurrency = 4;
const warmup = 24;
const requests = 160;
const repeats = 3;
const percentile = (sorted, p) => sorted[Math.ceil(sorted.length * p) - 1];
const median = (samples) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
const ms = (value) => Number(value.toFixed(2));

async function login(stack, who) {
  const { email, password } = stack.users[who];
  const res = await fetch(stack.api + "/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: email, password }),
  });
  assert.equal(res.status, 201, `login as ${who}`);
  return (await res.json()).access_token;
}

async function measure(stack, token, pathFor, checkout, run, count, phase) {
  const times = [];
  const failures = [];
  let conflicts = 0;
  await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
    for (let i = worker; i < count; i += concurrency) {
      const path = pathFor(i);
      const start = performance.now();
      const res = await fetch(stack.api + path, {
        method: checkout ? "POST" : "GET",
        headers: { authorization: `Bearer ${token}`, ...(checkout && { "content-type": "application/json" }) },
        body: checkout ? JSON.stringify({
          requestKey: `perf-${run}-${phase}-${i}`,
          patientId: `main-p-${1 + i}`,
          paymentMethod: "UPI", billingName: "Synthetic patient", billingPhone: "9199000000",
          items: [1 + i, 501 + i].map((id) => ({
            itemType: "DRUG", drugId: `main-d-${id}`, quantity: 1, unitPrice: 50,
          })),
        }) : undefined,
        signal: AbortSignal.timeout(30000),
      });
      const payload = await res.text();
      times.push(performance.now() - start);
      if (checkout && res.status === 409) conflicts++;
      else if (res.status !== (checkout ? 201 : 200)) failures.push({ path, status: res.status, payload });
      // Avoid benchmarking the global ten-requests/60ms HTTP limiter.
      await pause(30);
    }
  }));
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 3)));
  times.sort((a, b) => a - b);
  return { latency: [0.5, 0.95, 0.99].map((p) => percentile(times, p)), conflicts };
}

async function main() {
  const only = process.argv[2];
  const stack = await bootStack({ label: "endpoint-perf" });
  try {
    await seed(stack);
    const [owner, reception, pharmacist] = await Promise.all(
      ["owner", "reception", "pharmacist"].map((who) => login(stack, who)),
    );
    const endpoints = [
      ["visits-list", owner, () => "/visits?page=1&limit=20"],
      ["visits-detail", owner, (i) => `/visits/main-v-${220 + i % 64}`],
      ["appointments-day", reception, () => `/appointments?date=${DAY}&limit=100`],
      ["appointments-doctor-queue", reception, () => `/appointments/doctor/${stack.users.doctor.id}/schedule?date=${DAY}`],
      ["patients-search", owner, (i) => `/patients?limit=10&search=${["Shah", "Pat", "Iyer", "Asha"][i % 4]}`],
      ["clinic-invoices-list", reception, () => "/billing/invoices?page=1&limit=20"],
      ["clinic-bill-register", reception, () => `/billing/register?from=2026-10-22&to=${DAY}&limit=50`],
      ["pharmacy-invoices-list", pharmacist, () => "/pharmacy/invoices?page=1&limit=20"],
      ["pharmacy-sales-register", pharmacist, () => `/pharmacy/sales-register?register=sales&from=2026-10-22&to=${DAY}&limit=50`],
      ["inventory-list", pharmacist, () => "/inventory/workspace/stock?limit=30"],
      ["inventory-search", pharmacist, (i) => `/inventory/workspace/stock?limit=30&search=${["Para", "Ceti", "Clot", "Sun"][i % 4]}`],
      ["pharmacy-checkout", pharmacist, () => "/pharmacy/invoices/checkout", true],
    ].filter(([name]) => !only || only === name);
    assert(endpoints.length, `unknown endpoint: ${only}`);
    const ranking = [];
    console.log(`concurrency=${concurrency}, warmups=${warmup}, requests=${requests}, repeats=${repeats}; milliseconds`);
    for (const [name, token, path, checkout] of endpoints) {
      const runs = [];
      for (let run = 0; run < repeats; run++) {
        const warm = await measure(stack, token, path, checkout, run, warmup, "warmup");
        const { latency, conflicts } = await measure(stack, token, path, checkout, run, requests, "sample");
        console.log(JSON.stringify({ name, run: run + 1, p50: ms(latency[0]), p95: ms(latency[1]), p99: ms(latency[2]), conflicts, warmupConflicts: warm.conflicts }));
        runs.push(latency);
      }
      const [p50, p95, p99] = [0, 1, 2].map((index) => median(runs.map((run) => run[index])));
      ranking.push({ name, p50: ms(p50), p95: ms(p95), p99: ms(p99) });
    }
    console.table(ranking.sort((a, b) => b.p95 - a.p95 || b.p99 - a.p99));
  } finally {
    await stack.stop();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
