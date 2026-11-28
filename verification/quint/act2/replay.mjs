// Replays every Quint trace in act2/traces through the code and compares state after each step.
// TARGET=service drives the NestJS API on Postgres; the default is the in-memory stand-in.
import fs from 'node:fs';

const target = await import(process.env.TARGET === 'service' ? './serviceAdapter.mjs' : './partnerSaleStandIn.mjs');
const dir = new URL('./traces/', import.meta.url);
const STATUS = {
  Submitted: 'SUBMITTED', StockCommitted: 'STOCK_COMMITTED', PartialStockCommitted: 'PARTIAL_STOCK_COMMITTED',
  ReconciliationRequired: 'RECONCILIATION_REQUIRED', Cancelled: 'CANCELLED',
};

// ITF encodes ints as {"#bigint"}, variants as {tag, value} and Option as Some/None.
const unwrap = (x) =>
  x?.['#bigint'] !== undefined ? Number(x['#bigint'])
  : x?.tag === 'Some' ? unwrap(x.value)
  : x?.tag === 'None' ? undefined
  : x?.tag ?? x;

const specView = (s) => ({
  status: STATUS[unwrap(s.status)], version: unwrap(s.version), committed: unwrap(s.committed),
  onHand: unwrap(s.onHand), reply: unwrap(s.reply),
});

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.itf.json'))
  .sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
async function replay() {
  let steps = 0;
  for (const file of files) {
    const { states } = JSON.parse(fs.readFileSync(new URL(file, dir)));
    const sale = await target.open(specView(states[0]));
    for (let i = 1; i < states.length; i++) {
      const action = states[i]['mbt::actionTaken'];
      const picks = Object.fromEntries(Object.entries(states[i]['mbt::nondetPicks']).map(([k, v]) => [k, unwrap(v)]));
      const reply = await sale.apply(action, picks);
      const want = specView(states[i]);
      const got = { ...(await sale.view()), reply };
      const diff = Object.keys(want).filter((k) => want[k] !== got[k]);
      if (diff.length) {
        process.exitCode = 1;
        const args = Object.entries(picks).map(([k, v]) => `${k}=${v}`).join(' ');
        return `DIVERGED ${file} step ${i}: ${action}(${args}), ${diff.map((k) => `${k}: spec ${want[k]}, code ${got[k]}`).join(', ')}`;
      }
      steps++;
    }
  }
  return `OK ${files.length} traces, ${steps} steps, code matched the spec after every step`;
}

try {
  console.log(await replay());
} finally {
  await target.close?.();
}
