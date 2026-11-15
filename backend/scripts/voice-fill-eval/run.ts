// Scores voice fill against cases.json (or commands.json, or conversations/) through the production code path.
//   audio mode: VoiceFillService.fill (OpenAI transcription, then Codex extraction)
//   text mode:  the case's script as a perfect transcript, so extraction is measured without transcription error
// Usage: npx ts-node --transpile-only scripts/voice-fill-eval/run.ts --audio <dir> | --text
//          [--set cases|commands|conversations] [--suffix -noisy] [--only id,id] [--out report.json] [--concurrency 3]
// { "relativeDate": "today" | "tomorrow" | "+N" | "<weekday>" | "next <weekday>" } matches that Asia/Kolkata day at run time;
// a weekday, with or without "next", is the first such day after today.
import * as fs from 'fs';
import * as path from 'path';
import { completeJsonWithCodexOAuth } from '../../src/shared/codex/codex-oauth';
import { buildVoiceFillPrompt, buildVoiceFillSchema, clinicToday, parseVoiceFillOutput } from '../../src/modules/voice-fill/voice-fill.logic';
import { VOICE_FILL_FORMS, type VoiceFillFormId } from '../../src/modules/voice-fill/voice-fill.registry';
import { VoiceFillService } from '../../src/modules/voice-fill/voice-fill.service';

type Matcher =
  | string | number | boolean
  | { contains: string } | { anyOf: string[] } | { approx: number; tol: number } | { includesAll: string[] } | { relativeDate: string }
  | Array<Record<string, Matcher>>;

interface Case {
  id: string;
  form: VoiceFillFormId;
  say: string;
  turns?: Array<{ speaker: string; text: string }>;
  expect: Record<string, Matcher>;
  allowExtra?: string[];
}

interface Check { field: string; ok: boolean; expected: unknown; actual: unknown }

const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const audioDir = flag('--audio');
const textMode = args.includes('--text');
const outPath = flag('--out');
const concurrency = Number(flag('--concurrency') || 3);
const set = flag('--set') || 'cases';
const suffix = flag('--suffix') || '';
const only = flag('--only')?.split(',');
if (!audioDir && !textMode) throw new Error('Pass --audio <dir> or --text');

const lower = (value: unknown) => String(value ?? '').trim().toLowerCase();
// Number words are left out because transcripts write them as digits ("nine eight" becomes "98").
const NUMBER_WORDS = /\b(zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|point|double|triple)\b/gi;
const letters = (text: string) => text.replace(NUMBER_WORDS, '').replace(/[^a-z]/gi, '').length;
// Below this share of the script's letters, a transcript has lost speech rather than reworded it.
const MIN_COVERAGE = 0.75;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function relativeDay(spec: string, now = new Date()): string {
  const [weekday, today] = clinicToday(now).split(' ');
  const target = WEEKDAYS.indexOf(spec.replace(/^next /, ''));
  const offset = spec === 'today' ? 0 : spec === 'tomorrow' ? 1 : /^\+\d+$/.test(spec) ? Number(spec.slice(1))
    : target >= 0 ? ((target - WEEKDAYS.indexOf(weekday.toLowerCase()) + 6) % 7) + 1 : NaN;
  if (Number.isNaN(offset)) throw new Error(`Unknown relativeDate ${spec}`);
  const [year, month, day] = today.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

function matches(expected: Matcher, actual: unknown): boolean {
  if (typeof expected === 'number') return actual === expected;
  if (typeof expected === 'boolean') return actual === expected;
  if (typeof expected === 'string') return typeof actual === 'string' && lower(actual) === lower(expected);
  if (Array.isArray(expected)) return false;
  if ('contains' in expected) return typeof actual === 'string' && lower(actual).includes(lower(expected.contains));
  if ('anyOf' in expected) return typeof actual === 'string' && expected.anyOf.some((option) => lower(actual).includes(lower(option)));
  if ('relativeDate' in expected) return actual === relativeDay(expected.relativeDate);
  if ('approx' in expected) return typeof actual === 'number' && Math.abs(actual - expected.approx) <= expected.tol;
  return Array.isArray(actual) && expected.includesAll.every((want) => actual.some((got) => lower(got).includes(lower(want))));
}

function score(c: Case, fields: Record<string, unknown>) {
  const checks: Check[] = [];
  const extras: string[] = [];
  for (const [field, expected] of Object.entries(c.expect)) {
    if (!Array.isArray(expected)) {
      checks.push({ field, ok: matches(expected, fields[field]), expected, actual: fields[field] });
      continue;
    }
    const rows = Array.isArray(fields[field]) ? (fields[field] as Array<Record<string, unknown>>) : [];
    const used = new Set<number>();
    for (const [index, wantRow] of expected.entries()) {
      const at = rows.findIndex((row, i) => !used.has(i) && matches(wantRow.drugName, row.drugName));
      if (at >= 0) used.add(at);
      for (const [cell, want] of Object.entries(wantRow)) {
        const got = at >= 0 ? rows[at][cell] : undefined;
        checks.push({ field: `${field}[${index}].${cell}`, ok: matches(want, got), expected: want, actual: got });
      }
    }
    rows.forEach((row, i) => { if (!used.has(i)) extras.push(`${field}+${JSON.stringify(row)}`); });
  }
  for (const key of Object.keys(fields)) {
    if (!(key in c.expect) && !(c.allowExtra ?? []).includes(key)) extras.push(`${key}=${JSON.stringify(fields[key])}`);
  }
  return { checks, extras };
}

async function fillFromText(c: Case) {
  const form = VOICE_FILL_FORMS[c.form];
  const raw = await completeJsonWithCodexOAuth({
    prompt: buildVoiceFillPrompt(form, c.say, new Date()),
    schema: buildVoiceFillSchema(form),
    model: process.env.VOICE_FILL_CODEX_MODEL || process.env.PHARMACY_AGENT_CODEX_MODEL || undefined,
    timeoutMs: 120000,
  });
  return { transcript: c.say, fields: parseVoiceFillOutput(form, raw) as Record<string, unknown> };
}

async function fillFromAudio(c: Case, service: VoiceFillService) {
  const bytes = fs.readFileSync(path.join(audioDir!, `${c.id}${suffix}.webm`));
  const result = await service.fill(c.id, VOICE_FILL_FORMS[c.form], { bytes, extension: 'webm' });
  return { transcript: result.transcript, fields: result.fields as Record<string, unknown> };
}

async function main() {
  const conversationsDir = path.join(__dirname, 'conversations');
  const loaded: Case[] = set === 'conversations'
    ? fs.readdirSync(conversationsDir).filter((f) => f.endsWith('.json')).sort()
      .map((f) => JSON.parse(fs.readFileSync(path.join(conversationsDir, f), 'utf8')))
      .map((c: Case) => ({ ...c, say: (c.turns ?? []).map((t) => t.text).join(' ') }))
    : JSON.parse(fs.readFileSync(path.join(__dirname, `${set}.json`), 'utf8'));
  const cases = only ? loaded.filter((c) => only.includes(c.id)) : loaded;
  const service = new VoiceFillService();
  const results: Array<{ id: string; form: string; ms: number; transcript?: string; coverage?: number; error?: string; checks: Check[]; extras: string[] }> = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < cases.length) {
      const c = cases[next++];
      const started = Date.now();
      try {
        const { transcript, fields } = textMode ? await fillFromText(c) : await fillFromAudio(c, service);
        const coverage = Math.round((letters(transcript) / letters(c.say)) * 100) / 100;
        results.push({ id: c.id, form: c.form, ms: Date.now() - started, transcript, coverage, ...score(c, fields) });
      } catch (error) {
        const checks = score(c, {}).checks;
        results.push({ id: c.id, form: c.form, ms: Date.now() - started, error: (error as Error).message, checks, extras: [] });
      }
      const last = results[results.length - 1];
      console.log(`${last.error ? 'ERR ' : ''}${c.id}: ${last.checks.filter((k) => k.ok).length}/${last.checks.length} extras=${last.extras.length} coverage=${last.coverage ?? '-'} ${last.ms}ms`);
    }
  }));

  const summarize = (subset: typeof results) => {
    const checks = subset.flatMap((r) => r.checks);
    const ms = subset.map((r) => r.ms).sort((a, b) => a - b);
    return {
      cases: subset.length,
      perfectCases: subset.filter((r) => !r.error && r.checks.every((k) => k.ok) && r.extras.length === 0).length,
      fieldAccuracy: `${checks.filter((k) => k.ok).length}/${checks.length}`,
      unexpectedFields: subset.reduce((n, r) => n + r.extras.length, 0),
      errors: subset.filter((r) => r.error).length,
      lowCoverage: subset.filter((r) => (r.coverage ?? 1) < MIN_COVERAGE).map((r) => `${r.id}=${r.coverage}`),
      p50ms: ms[Math.floor(ms.length / 2)],
      maxMs: ms[ms.length - 1],
    };
  };
  const forms = [...new Set(results.map((r) => r.form))];
  const report = {
    mode: textMode ? 'text' : `audio${suffix}`,
    set,
    overall: summarize(results),
    byForm: Object.fromEntries(forms.map((form) => [form, summarize(results.filter((r) => r.form === form))])),
    misses: results.flatMap((r) => [
      ...r.checks.filter((k) => !k.ok).map((k) => ({ case: r.id, field: k.field, expected: k.expected, actual: k.actual })),
      ...r.extras.map((extra) => ({ case: r.id, unexpected: extra })),
      ...(r.error ? [{ case: r.id, error: r.error }] : []),
      ...((r.coverage ?? 1) < MIN_COVERAGE ? [{ case: r.id, lowCoverage: r.coverage }] : []),
    ]),
    transcripts: Object.fromEntries(results.map((r) => [r.id, r.transcript])),
  };
  console.log(JSON.stringify({ overall: report.overall, byForm: report.byForm }, null, 2));
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
}

void main();
