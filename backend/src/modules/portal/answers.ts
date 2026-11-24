import { AttentionPriority } from '@prisma/client';
import { InstrumentContent, InstrumentItem } from '../follow-ups/content';

export type Answer = number | string | string[];
export type Answers = Record<string, Answer>;
export type Evaluated = { score: number | null; flag: AttentionPriority | null };

const RANK: Record<AttentionPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2 };
export const MAX_TEXT = 2000;

/** Problems with `answers` against the pinned instrument; empty when they can be saved. */
export function answerProblems(content: InstrumentContent, answers: Answers, photoKeys: readonly string[]): string[] {
  const problems: string[] = [];
  const items = new Map(content.items.map((i) => [i.key, i]));
  for (const key of Object.keys(answers)) {
    const item = items.get(key);
    if (!item || item.type === 'photo') problems.push(`${key} is not a question here`);
  }
  for (const key of photoKeys) if (items.get(key)?.type !== 'photo') problems.push(`${key} does not take a photo`);
  for (const item of content.items) {
    if (item.type === 'photo') {
      if (item.required && !photoKeys.includes(item.key)) problems.push(`${item.key} needs a photo`);
      continue;
    }
    const value = answers[item.key];
    if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) {
      if (item.required) problems.push(`${item.key} needs an answer`);
      continue;
    }
    if (!valid(item, value)) problems.push(`${item.key} has an answer this question does not allow`);
  }
  return problems;
}

function valid(item: InstrumentItem, value: Answer): boolean {
  const values = new Set((item.options ?? []).map((o) => o.value));
  switch (item.type) {
    case 'scale':
      return typeof value === 'number' && Number.isInteger(value) && value >= item.min! && value <= item.max!;
    case 'single-choice':
      return typeof value === 'string' && values.has(value);
    case 'multi-choice':
      return Array.isArray(value) && value.every((v) => typeof v === 'string' && values.has(v)) && new Set(value).size === value.length;
    case 'text':
      return typeof value === 'string' && value.length <= MAX_TEXT;
    default:
      return false;
  }
}

/**
 * @cc [owner:nareshshah139,label:product] server-side-score
 * A response's score and flag MUST be computed on the server from the instrument version the
 * check-in pinned, never taken from the request (PP-42, ResponsePinsVersion).
 */
export function evaluate(content: InstrumentContent, answers: Answers): Evaluated {
  const scored = content.scoring ? answers[content.scoring.item] : undefined;
  let flag: AttentionPriority | null = null;
  for (const item of content.items) {
    const value = answers[item.key];
    if (value === undefined) continue;
    for (const rule of item.flags ?? []) {
      if (!matches(rule.when, value)) continue;
      if (!flag || RANK[rule.priority] < RANK[flag]) flag = rule.priority;
    }
  }
  return { score: typeof scored === 'number' ? scored : null, flag };
}

function matches(when: { gte?: number; lte?: number; equals?: string }, value: Answer): boolean {
  if (when.equals !== undefined) return Array.isArray(value) ? value.includes(when.equals) : value === when.equals;
  if (typeof value !== 'number') return false;
  return (when.gte === undefined || value >= when.gte) && (when.lte === undefined || value <= when.lte);
}

/** Plain text of a submission for the inbox, keyed by question. */
export function asMessage(answers: Answers, photos: number): string {
  const lines = Object.entries(answers).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v).slice(0, MAX_TEXT)}`);
  if (photos) lines.push(`photos: ${photos}`);
  return ['Submitted again after this check-in was already answered:', ...lines].join('\n');
}
