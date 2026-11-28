// Replays every Quint trace in extras/voice/traces through the real voiceBarReducer and compares a projection after each step.
// The reducer is frontend/src/lib/voice-bar.ts itself, bundled in memory. MUTANT=<name> patches its source text in memory
// first (never on disk). STATS=1 also prints a tally of what the traces covered, to stderr.
import { clinicPath } from '../../clinic.mjs';
import fs from 'node:fs';
import path from 'node:path';

const esbuild = await import('esbuild').catch(() => {
  console.error('esbuild is missing. Run npm ci in verification/quint.');
  process.exit(2);
});
const SOURCE = clinicPath('frontend/src/lib/voice-bar.ts');
const traceDir = new URL('./traces/', import.meta.url);

// Each mutant removes one guard, to show the replay catches it. Each pattern must match exactly once.
const MUTANTS = {
  'no-attempt-check': [/ \|\| state\.attempt !== event\.attempt\)/, ')'], // :121
  'no-registration-check': [/(case 'applied':\s+return state\.kind === 'draft') && state\.registrationId === event\.registrationId/, '$1'], // :149
  'no-scope-reset': [/return owner !== null && owner !== event\.activeId \? idle\(VOICE_BAR_COPY\.pageChanged\) : state;/, 'return state;'], // :104
};
function mutate(source, name) {
  if (!MUTANTS[name]) throw new Error(`unknown MUTANT ${name}`);
  const [pattern, replacement] = MUTANTS[name];
  if ((source.match(new RegExp(pattern.source, 'g')) ?? []).length !== 1) throw new Error(`mutant ${name} no longer matches voice-bar.ts once`);
  return source.replace(pattern, replacement);
}

// voice-bar.ts uses only COMMAND_EXAMPLE and parseVoiceCommand from voice-command.ts, whose real module pulls in the API client.
const VOICE_COMMAND_STUB = `
  export const COMMAND_EXAMPLE = 'Book Ramesh Kumar with Dr Shravya tomorrow at 10';
  export const parseVoiceCommand = (fields) => ({ action: 'unknown', ...fields });`;
const stubVoiceCommand = {
  name: 'stub-voice-command',
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => args.path === '@/lib/voice-command'
      ? { path: args.path, namespace: 'stub' }
      : { errors: [{ text: `voice-bar.ts now imports ${args.path}; the replay stubs only @/lib/voice-command` }] });
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: VOICE_COMMAND_STUB, loader: 'js' }));
  },
};

async function loadReducer() {
  let source = fs.readFileSync(SOURCE, 'utf8');
  if (process.env.MUTANT) source = mutate(source, process.env.MUTANT);
  const { outputFiles } = await esbuild.build({
    stdin: { contents: source, loader: 'ts', sourcefile: 'voice-bar.ts', resolveDir: path.dirname(SOURCE) },
    bundle: true, write: false, format: 'esm', platform: 'node', plugins: [stubVoiceCommand], logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
}
const { voiceBarReducer, voiceBarRegistrationOf, VOICE_BAR_IDLE, VOICE_BAR_COPY: COPY } = await loadReducer();

// ITF encodes ints as {"#bigint"}, variants as {tag, value}, Option as Some/None and a fieldless variant as an empty tuple.
const unwrap = (x) =>
  x?.['#bigint'] !== undefined ? Number(x['#bigint'])
  : x?.tag === 'Some' ? unwrap(x.value)
  : x?.tag === 'None' ? undefined
  : x?.tag !== undefined ? (x.value?.['#tup'] ? x.tag : { tag: x.tag, value: unwrap(x.value) })
  : x;

const regId = (n) => `voice-bar-form-${n}`;
const regNum = (id) => (id === null ? null : Number(id.match(/(\d+)$/)[1]));
const targetOf = (t) => (t === 'Command' ? { kind: 'command' } : { kind: 'form', registrationId: regId(t.value) });
const LINE = { id: 'diagnosis', label: 'Diagnosis', value: 'Eczema', fields: { diagnosis: 'Eczema' } };

// The spec's actions as the events the call sites dispatch. A send takes its attempt from the counter (VoiceBar.tsx:245-247).
const EVENTS = {
  listen: ({ t }) => ({ type: 'listen', target: targetOf(t), startedAt: 0 }),
  send: ({ t }, attempt) => ({ type: 'send', target: targetOf(t), retry: { kind: 'text', text: 'eczema' }, attempt }),
  heard: ({ a, empty, noLines }) => ({ type: 'heard', attempt: a, transcript: empty ? '  ' : 'Eczema', fields: {}, lines: noLines ? [] : [LINE] }),
  requestFailed: ({ a }) => ({ type: 'request-failed', attempt: a, message: 'Offline' }),
  applied: ({ r }) => ({ type: 'applied', registrationId: regId(r), labels: ['Diagnosis'], undo: null }),
  registration: ({ activeId }) => ({ type: 'registration', activeId: activeId === 0 ? null : regId(activeId) }),
  dismiss: () => ({ type: 'dismiss' }),
  discardRecording: () => ({ type: 'discard-recording' }),
  dictationFailed: () => ({ type: 'dictation-failed', message: 'Microphone is blocked.' }),
};

// The projection both sides are compared on. A field a kind does not carry is null.
const NOTES = new Map([[null, 'NoNote'], [COPY.pageChanged, 'PageChanged'], [COPY.recordingDiscarded, 'Discarded'],
  [COPY.nothingHeard, 'NothingHeard'], [COPY.nothingUsable, 'NothingUsable']]);
const TARGETED = ['listening', 'working', 'failed'];
const lower = (s) => s[0].toLowerCase() + s.slice(1);
function specView(s) {
  const bar = Object.fromEntries(Object.entries(s.bar).map(([k, v]) => [k, unwrap(v)]));
  const kind = lower(bar.kind);
  const target = TARGETED.includes(kind) ? (bar.target === 'Command' ? 'command' : bar.target.value) : null;
  const reg = kind === 'draft' || kind === 'applied' ? bar.reg : null;
  return {
    kind, target, reg, counter: unwrap(s.env.counter),
    attempt: kind === 'working' || kind === 'confirming' ? bar.attempt : null,
    note: kind === 'idle' || kind === 'failed' ? bar.note : null,
    owner: typeof target === 'number' ? target : reg,
  };
}
function codeView(state, counter) {
  return {
    kind: state.kind, counter,
    target: state.target ? (state.target.kind === 'form' ? regNum(state.target.registrationId) : 'command') : null,
    reg: state.registrationId ? regNum(state.registrationId) : null,
    attempt: state.kind === 'working' ? state.attempt : state.kind === 'confirming' ? state.heard.id : null,
    note: state.kind === 'idle' ? NOTES.get(state.notice) : state.kind === 'failed' ? NOTES.get(state.message) ?? 'Reported' : null,
    owner: regNum(voiceBarRegistrationOf(state)),
  };
}

const files = fs.existsSync(traceDir) ? fs.readdirSync(traceDir).filter((f) => f.endsWith('.itf.json'))
  .sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2))) : [];
if (!files.length) throw new Error('no traces in extras/voice/traces. Run: npm run voice:traces');

const tally = {};
const bump = (k) => { tally[k] = (tally[k] ?? 0) + 1; };
function replay() {
  let steps = 0;
  for (const file of files) {
    const { states } = JSON.parse(fs.readFileSync(new URL(file, traceDir)));
    let state = VOICE_BAR_IDLE;
    let counter = 0;
    let reachedApplied = false;
    const compare = (i, label) => {
      const want = specView(states[i]), got = codeView(state, counter);
      const diff = Object.keys(want).filter((k) => want[k] !== got[k]);
      if (!diff.length) return null;
      process.exitCode = 1;
      return `DIVERGED ${file} step ${i}: ${label}, ${diff.map((k) => `${k}: spec ${want[k]}, code ${got[k]}`).join(', ')}`;
    };
    const first = compare(0, 'init()');
    if (first) return first;
    for (let i = 1; i < states.length; i++) {
      const action = states[i]['mbt::actionTaken'];
      if (!EVENTS[action]) throw new Error(`${file} step ${i}: no event for action ${action}`);
      const picks = Object.fromEntries(Object.entries(states[i]['mbt::nondetPicks']).map(([k, v]) => [k, unwrap(v)]).filter(([, v]) => v !== undefined));
      if (action === 'send') counter += 1;
      if (action === 'heard' && picks.a < counter) bump('heard of an older attempt');
      state = voiceBarReducer(state, EVENTS[action](picks, counter));
      bump(action);
      reachedApplied ||= state.kind === 'applied';
      const args = Object.entries(picks).map(([k, v]) => `${k}=${typeof v === 'object' ? `${v.tag}(${v.value})` : v}`).join(' ');
      const diverged = compare(i, `${action}(${args})`);
      if (diverged) return diverged;
      steps++;
    }
    if (reachedApplied) bump('traces that reach applied');
  }
  return `OK ${files.length} traces, ${steps} steps, code matched the spec after every step`;
}

console.log(replay());
if (process.env.STATS) console.error(JSON.stringify(tally));
