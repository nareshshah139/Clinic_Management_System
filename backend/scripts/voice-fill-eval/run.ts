// Scores voice fill against cases.json through the production code path.
//   audio mode: VoiceFillService.fill (OpenAI transcription, then Codex extraction)
//   text mode:  the case's script as a perfect transcript, so extraction is measured without transcription error
// Usage: npx ts-node --transpile-only scripts/voice-fill-eval/run.ts --audio <dir> | --text  [--out report.json] [--concurrency 3]
import * as fs from 'fs';
import * as path from 'path';
import { completeJsonWithCodexOAuth } from '../../src/shared/codex/codex-oauth';
import { buildVoiceFillPrompt, buildVoiceFillSchema, parseVoiceFillOutput } from '../../src/modules/voice-fill/voice-fill.logic';
import { VOICE_FILL_FORMS, type VoiceFillFormId } from '../../src/modules/voice-fill/voice-fill.registry';
import { VoiceFillService } from '../../src/modules/voice-fill/voice-fill.service';

type Matcher =
  | string | number | boolean
  | { contains: string } | { anyOf: string[] } | { approx: number; tol: number } | { includesAll: string[] }
  | Array<Record<string, Matcher>>;

interface Case {
  id: string;
  form: VoiceFillFormId;
  say: string;
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
if (!audioDir && !textMode) throw new Error('Pass --audio <dir> or --text');

const lower = (value: unknown) => String(value ?? '').trim().toLowerCase();

function matches(expected: Matcher, actual: unknown): boolean {
  if (typeof expected === 'number') return actual === expected;
  if (typeof expected === 'boolean') return actual === expected;
  if (typeof expected === 'string') return typeof actual === 'string' && lower(actual) === lower(expected);
  if (Array.isArray(expected)) return false;
  if ('contains' in expected) return typeof actual === 'string' && lower(actual).includes(lower(expected.contains));
  if ('anyOf' in expected) return typeof actual === 'string' && expected.anyOf.some((option) => lower(actual).includes(lower(option)));
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
    rows.forEach((row, i) => { if (!used.has(i)) extras.push(`${field}+${String(row.drugName)}`); });
  }
  for (const key of Object.keys(fields)) {
    if (!(key in c.expect) && !(c.allowExtra ?? []).includes(key)) extras.push(key);
  }
  return { checks, extras };
}

async function fillFromText(c: Case) {
  const form = VOICE_FILL_FORMS[c.form];
  const raw = await completeJsonWithCodexOAuth({
    prompt: buildVoiceFillPrompt(form, c.say, new Date().toISOString().slice(0, 10)),
    schema: buildVoiceFillSchema(form),
    model: process.env.VOICE_FILL_CODEX_MODEL || process.env.PHARMACY_AGENT_CODEX_MODEL || undefined,
    timeoutMs: 120000,
  });
  return { transcript: c.say, fields: parseVoiceFillOutput(form, raw) as Record<string, unknown> };
}

async function fillFromAudio(c: Case, service: VoiceFillService) {
  const bytes = fs.readFileSync(path.join(audioDir!, `${c.id}.webm`));
  const result = await service.fill(c.id, VOICE_FILL_FORMS[c.form], { bytes, extension: 'webm' });
  return { transcript: result.transcript, fields: result.fields as Record<string, unknown> };
}

async function main() {
  const cases: Case[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
  const service = new VoiceFillService();
  const results: Array<{ id: string; form: string; ms: number; transcript?: string; error?: string; checks: Check[]; extras: string[] }> = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < cases.length) {
      const c = cases[next++];
      const started = Date.now();
      try {
        const { transcript, fields } = textMode ? await fillFromText(c) : await fillFromAudio(c, service);
        results.push({ id: c.id, form: c.form, ms: Date.now() - started, transcript, ...score(c, fields) });
      } catch (error) {
        const checks = score(c, {}).checks;
        results.push({ id: c.id, form: c.form, ms: Date.now() - started, error: (error as Error).message, checks, extras: [] });
      }
      const last = results[results.length - 1];
      console.log(`${last.error ? 'ERR ' : ''}${c.id}: ${last.checks.filter((k) => k.ok).length}/${last.checks.length} extras=${last.extras.length} ${last.ms}ms`);
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
      p50ms: ms[Math.floor(ms.length / 2)],
      maxMs: ms[ms.length - 1],
    };
  };
  const forms = [...new Set(results.map((r) => r.form))];
  const report = {
    mode: textMode ? 'text' : 'audio',
    overall: summarize(results),
    byForm: Object.fromEntries(forms.map((form) => [form, summarize(results.filter((r) => r.form === form))])),
    misses: results.flatMap((r) => [
      ...r.checks.filter((k) => !k.ok).map((k) => ({ case: r.id, field: k.field, expected: k.expected, actual: k.actual })),
      ...r.extras.map((extra) => ({ case: r.id, unexpected: extra })),
      ...(r.error ? [{ case: r.id, error: r.error }] : []),
    ]),
    transcripts: Object.fromEntries(results.map((r) => [r.id, r.transcript])),
  };
  console.log(JSON.stringify({ overall: report.overall, byForm: report.byForm }, null, 2));
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
}

void main();
