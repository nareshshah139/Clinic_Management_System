// Replays every Quint trace in extras/ocr/traces through the code and compares state after each step.
// TARGET=service drives the NestJS API on Postgres; the default is the in-memory stand-in.
// The spec's rev counts distinct updatedAt values the code has shown, so a write the spec does not expect is a divergence too.
import fs from 'node:fs';

const target = await import(process.env.TARGET === 'service' ? './serviceAdapter.mjs' : './purchaseBillStandIn.mjs');
const dir = new URL('./traces/', import.meta.url);
const STATUS = {
  Draft: 'DRAFT', OcrReviewRequired: 'OCR_REVIEW_REQUIRED', ReconciliationFailed: 'RECONCILIATION_FAILED',
  Reviewed: 'REVIEWED', StockCommitted: 'STOCK_COMMITTED', Cancelled: 'CANCELLED',
};
const SHOWN = { edit: ['flags'], review: ['seen', 'send'], reopen: ['seen'], reject: ['seen'] };

// ITF encodes ints as {"#bigint"}, variants as {tag, value} and Option as Some/None.
const unwrap = (x) =>
  x?.['#bigint'] !== undefined ? Number(x['#bigint'])
  : x?.tag === 'Some' ? unwrap(x.value)
  : x?.tag === 'None' ? undefined
  : x?.tag ?? x;

const specView = (s) => {
  const b = s.bill;
  return {
    status: STATUS[unwrap(b.status)], committed: unwrap(b.committed), ocr: unwrap(b.ocr), issues: unwrap(b.issues),
    posts: unwrap(b.posts), rev: unwrap(b.rev), reply: unwrap(s.reply),
  };
};
// What a save leaves on the bill, as the spec's withFlags numbers it.
const contentOf = (k) => ({ ocr: k === 4 || k === 7, issues: k === 5 || k === 7, lowConf: k === 6 || k === 7 });

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.itf.json'))
  .sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
const diverged = (file, i, what, want, got) => {
  const diff = Object.keys(want).filter((k) => want[k] !== got[k]);
  if (!diff.length) return null;
  process.exitCode = 1;
  return `DIVERGED ${file} step ${i}: ${what}, ${diff.map((k) => `${k}: spec ${want[k]}, code ${got[k]}`).join(', ')}`;
};

async function replay() {
  let steps = 0;
  for (const file of files) {
    const { states } = JSON.parse(fs.readFileSync(new URL(file, dir)));
    const b0 = states[0].bill;
    const bill = await target.open({ ocr: unwrap(b0.ocr), issues: unwrap(b0.issues), lowConf: unwrap(b0.lowConf) });
    const stamps = [(await bill.view()).updatedAt];  // stamps[r] is the updatedAt the code showed at spec rev r
    const view = async (reply) => {
      const v = await bill.view();
      if (v.updatedAt !== stamps.at(-1)) stamps.push(v.updatedAt);
      return { status: v.status, committed: v.committed, ocr: v.ocr, issues: v.issues, posts: v.posts, rev: stamps.length - 1, reply };
    };
    const start = specView(states[0]);
    const first = await view(start.reply);
    const bad0 = diverged(file, 0, `init(ocr=${first.ocr} issues=${first.issues})`, start, first);
    if (bad0) return bad0;
    for (let i = 1; i < states.length; i++) {
      const action = states[i]['mbt::actionTaken'];
      const picks = Object.fromEntries(Object.entries(states[i]['mbt::nondetPicks']).map(([k, v]) => [k, unwrap(v)]));
      // A review may omit the revision. A reopen or a reject always carries the one on the screen.
      const expected = action === 'review' ? (picks.send ? stamps[picks.seen] : undefined)
        : action === 'reopen' || action === 'reject' ? stamps[picks.seen] : undefined;
      const reply = await bill.apply(action, { expected, content: contentOf(picks.flags) });
      const got = await view(reply);
      const args = (SHOWN[action] ?? []).map((k) => `${k}=${picks[k]}`).join(' ');
      const bad = diverged(file, i, `${action}(${args})`, specView(states[i]), got);
      if (bad) return bad;
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
