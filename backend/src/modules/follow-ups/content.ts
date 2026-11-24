import { createHash } from 'crypto';
import { AttentionPriority, PhotoPosition } from '@prisma/client';

export const LANGUAGES = ['EN', 'TE', 'HI'] as const;
export type Text = Record<(typeof LANGUAGES)[number], string>;

export type FlagRule = { when: { gte?: number; lte?: number; equals?: string }; priority: AttentionPriority };
export type InstrumentItem = {
  key: string;
  type: 'scale' | 'single-choice' | 'multi-choice' | 'text' | 'photo';
  prompt: Text;
  required?: boolean;
  min?: number;
  max?: number;
  options?: { value: string; label: Text }[];
  position?: PhotoPosition;
  flags?: FlagRule[];
};
export type InstrumentContent = {
  title: Text;
  respondent: 'PATIENT' | 'CLINICIAN';
  licence: string;
  items: InstrumentItem[];
  scoring?: { item: string };
};
export type PlanStep = {
  key: string;
  offsetDays: number;
  windowDays: number;
  instrumentVersionId: string;
  respondent: 'PATIENT' | 'CLINICIAN';
  reminderAfterDays: number[];
  onMissed: 'attention' | 'none';
};
export type PlanContent = { name: Text; steps: PlanStep[] };

/** A plan data file names instruments by key; import pins each to its current version. */
export type PlanFile = { key: string; name: Text; steps: (Omit<PlanStep, 'instrumentVersionId'> & { instrument: string })[] };
export type InstrumentFile = InstrumentContent & { key: string };

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable((value as Record<string, unknown>)[k])]));
  }
  return value;
}

export function contentHash(content: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(content))).digest('hex');
}

function missingLanguages(text: Partial<Text> | undefined): string[] {
  return LANGUAGES.filter((l) => typeof text?.[l] !== 'string' || !text[l]!.trim());
}

/**
 * @cc [owner:nareshshah139,label:product] instrument-translations
 * An instrument version MUST NOT be published unless its title, every item prompt and every
 * option label has English, Telugu and Hindi text (PP-25).
 */
export function instrumentProblems(file: InstrumentFile): string[] {
  const problems: string[] = [];
  const need = (where: string, text: Partial<Text> | undefined) => {
    const missing = missingLanguages(text);
    if (missing.length) problems.push(`${file.key}: ${where} lacks ${missing.join(', ')}`);
  };
  need('title', file.title);
  if (!Array.isArray(file.items) || file.items.length === 0) problems.push(`${file.key}: has no items`);
  const keys = new Set<string>();
  for (const item of file.items ?? []) {
    if (keys.has(item.key)) problems.push(`${file.key}: item ${item.key} appears twice`);
    keys.add(item.key);
    need(`item ${item.key}`, item.prompt);
    for (const option of item.options ?? []) need(`item ${item.key} option ${option.value}`, option.label);
    if (item.type === 'scale' && !(Number.isInteger(item.min) && Number.isInteger(item.max) && item.min! < item.max!)) {
      problems.push(`${file.key}: scale ${item.key} needs integer min < max`);
    }
    if ((item.type === 'single-choice' || item.type === 'multi-choice') && !item.options?.length) {
      problems.push(`${file.key}: ${item.key} has no options`);
    }
    if (item.type === 'photo' && item.position && !Object.values(PhotoPosition).includes(item.position)) {
      problems.push(`${file.key}: ${item.key} names unknown photo position ${item.position}`);
    }
  }
  if (file.scoring && !keys.has(file.scoring.item)) problems.push(`${file.key}: scoring names unknown item ${file.scoring.item}`);
  return problems;
}

export function planProblems(file: PlanFile): string[] {
  const problems: string[] = [];
  const missing = missingLanguages(file.name);
  if (missing.length) problems.push(`${file.key}: name lacks ${missing.join(', ')}`);
  if (!Array.isArray(file.steps) || file.steps.length === 0) problems.push(`${file.key}: has no steps`);
  for (const s of file.steps ?? []) {
    if (!Number.isInteger(s.offsetDays) || s.offsetDays < 0) problems.push(`${file.key}: step ${s.key} offsetDays must be >= 0`);
    if (!Number.isInteger(s.windowDays) || s.windowDays < 1) problems.push(`${file.key}: step ${s.key} windowDays must be >= 1`);
    if ((s.reminderAfterDays ?? []).some((d) => !Number.isInteger(d) || d < 1 || d >= s.windowDays)) {
      problems.push(`${file.key}: step ${s.key} reminders must fall inside its window`);
    }
    if (!['attention', 'none'].includes(s.onMissed)) problems.push(`${file.key}: step ${s.key} onMissed must be attention or none`);
  }
  return problems;
}

export const instrumentContent = ({ key: _key, ...content }: InstrumentFile): InstrumentContent => content;
