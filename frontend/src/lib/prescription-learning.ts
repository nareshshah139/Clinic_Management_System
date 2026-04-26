export type LearnedPlanSourceKind = 'patient-last-plan' | 'doctor-template' | 'doctor-pattern';

export interface LearnedPlanSuggestion {
  sourceKind: LearnedPlanSourceKind;
  sourceLabel: string;
  supportingLabel?: string;
  diagnosisText: string;
  confidence: number;
  evidenceCount: number;
  items: Array<Record<string, unknown>>;
  investigations: string[];
  followUpInstructions: string;
  reviewDays: number | null;
  comboDrugNames: string[];
  signature: string;
}

export interface LearnedMedicationSuggestion {
  sourceKind: Exclude<LearnedPlanSourceKind, 'doctor-template'>;
  sourceLabel: string;
  diagnosisText: string;
  confidence: number;
  evidenceCount: number;
  item: Record<string, unknown>;
  signature: string;
}

interface FlatPlanRecord {
  sourceKind: LearnedPlanSourceKind;
  sourceLabel: string;
  diagnosisText: string;
  diagnosisScore: number;
  confidence: number;
  evidenceCount: number;
  items: Array<Record<string, unknown>>;
  investigations: string[];
  followUpInstructions: string;
  reviewDays: number | null;
  comboDrugNames: string[];
  signature: string;
  createdAtMs: number;
}

interface FlatMedicationRecord {
  sourceKind: Exclude<LearnedPlanSourceKind, 'doctor-template'>;
  sourceLabel: string;
  diagnosisText: string;
  diagnosisScore: number;
  confidence: number;
  evidenceCount: number;
  item: Record<string, unknown>;
  signature: string;
  createdAtMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DIAGNOSIS_SCORE = 0.46;

const DIAGNOSIS_DELIMITER = /[,/;\n|]+/;
const WORD_DELIMITER = /[^a-z0-9]+/g;
const NOISE_WORDS = new Set([
  'and',
  'with',
  'without',
  'the',
  'of',
  'for',
  'from',
  'due',
  'to',
  'acute',
  'chronic',
  'mild',
  'moderate',
  'severe',
  'disease',
  'disorder',
  'unspecified',
]);

const DIAGNOSIS_ALIAS_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bpih\b/g, replacement: 'post inflammatory hyperpigmentation' },
  { pattern: /\bpost acne marks\b/g, replacement: 'post inflammatory hyperpigmentation' },
  { pattern: /\bav\b/g, replacement: 'acne vulgaris' },
  { pattern: /\bacne\b/g, replacement: 'acne vulgaris' },
  { pattern: /\bad\b/g, replacement: 'atopic dermatitis' },
  { pattern: /\bsd\b/g, replacement: 'seborrheic dermatitis' },
  { pattern: /\bseb[\s-]*derm(?:atitis)?\b/g, replacement: 'seborrheic dermatitis' },
  { pattern: /\blp\b/g, replacement: 'lichen planus' },
  { pattern: /\btinea\b/g, replacement: 'tinea corporis' },
];

function parseUnknown(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const raw = value.trim();
  if (!raw) return raw;
  if (!['[', '{', '"'].includes(raw[0])) return value;
  try {
    return JSON.parse(raw);
  } catch {
    return value;
  }
}

function asArray(value: unknown): unknown[] {
  const parsed = parseUnknown(value);
  return Array.isArray(parsed) ? parsed : [];
}

function asObject(value: unknown): Record<string, unknown> {
  const parsed = parseUnknown(value);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

function normalizeWhitespace(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value: unknown): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = normalizeWhitespace(value);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function expandDiagnosisAliases(value: string): string {
  let expanded = normalizeText(value);
  for (const { pattern, replacement } of DIAGNOSIS_ALIAS_REPLACEMENTS) {
    expanded = expanded.replace(pattern, replacement);
  }
  return expanded.replace(/\s+/g, ' ').trim();
}

function buildDiagnosisVariants(value: string): string[] {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return [];
  const withoutParens = normalized.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return uniqCaseInsensitive(
    [normalized, withoutParens]
      .filter(Boolean)
      .flatMap((entry) => {
        const expanded = expandDiagnosisAliases(entry);
        return expanded && expanded !== normalizeText(entry)
          ? [entry, expanded]
          : [entry];
      })
  );
}

function toWordSet(value: string): Set<string> {
  return new Set(
    expandDiagnosisAliases(value)
      .split(WORD_DELIMITER)
      .map((token) => token.trim())
      .filter((token) => token && !NOISE_WORDS.has(token))
  );
}

function splitDiagnosisPhrases(value: unknown): string[] {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return [];
  const phrases = normalized
    .split(DIAGNOSIS_DELIMITER)
    .map((part) => part.trim())
    .filter(Boolean);
  return uniqCaseInsensitive([normalized, ...phrases].flatMap((entry) => buildDiagnosisVariants(entry)));
}

function toDiagnosisText(value: unknown): string {
  const parsed = parseUnknown(value);
  if (Array.isArray(parsed)) {
    return uniqCaseInsensitive(
      parsed
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object') {
            const record = entry as Record<string, unknown>;
            return normalizeWhitespace(record.diagnosis || record.label || record.name || '');
          }
          return '';
        })
        .filter(Boolean)
    ).join(', ');
  }
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    return normalizeWhitespace(record.diagnosis || record.label || record.name || '');
  }
  return normalizeWhitespace(parsed);
}

export function scoreDiagnosisMatch(query: string, candidate: string): number {
  const queryPhrases = splitDiagnosisPhrases(query);
  const candidatePhrases = splitDiagnosisPhrases(candidate);
  if (!queryPhrases.length || !candidatePhrases.length) return 0;

  let best = 0;
  for (const left of queryPhrases) {
    for (const right of candidatePhrases) {
      const a = expandDiagnosisAliases(left);
      const b = expandDiagnosisAliases(right);
      if (!a || !b) continue;
      if (a === b) return 1;

      const aWords = toWordSet(a);
      const bWords = toWordSet(b);
      const intersection = [...aWords].filter((word) => bWords.has(word)).length;
      const union = new Set([...aWords, ...bWords]).size || 1;
      const jaccard = intersection / union;
      const containment = intersection / Math.max(1, Math.min(aWords.size || 1, bWords.size || 1));
      const hasSubstring = a.includes(b) || b.includes(a);
      const lengthDistance = Math.abs(a.length - b.length) / Math.max(a.length, b.length, 1);
      const lengthScore = 1 - lengthDistance;

      let score = jaccard * 0.55 + containment * 0.25 + lengthScore * 0.08;
      if (hasSubstring) score += 0.18;
      if (intersection > 0 && containment === 1) score += 0.08;
      best = Math.max(best, Math.min(1, score));
    }
  }

  return Number(best.toFixed(4));
}

function normalizeInvestigations(value: unknown): string[] {
  const parsed = parseUnknown(value);
  if (Array.isArray(parsed)) {
    return uniqCaseInsensitive(
      parsed.map((entry) => normalizeWhitespace(entry)).filter(Boolean)
    );
  }
  if (typeof parsed === 'string') {
    return uniqCaseInsensitive(
      parsed
        .split(/[,;\n]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    );
  }
  return [];
}

function extractPrescriptionDiagnosis(record: Record<string, unknown>): string {
  const direct = toDiagnosisText(record.diagnosis);
  if (direct) return direct;

  const metadata = asObject(record.metadata);
  const fromMetadata = toDiagnosisText(metadata.diagnosis);
  if (fromMetadata) return fromMetadata;

  const note = normalizeWhitespace(record.pharmacistNotes || record.notes || '');
  const match = note.match(/\bDx\s*:\s*(.+)$/i);
  return match ? match[1].trim() : '';
}

function extractFollowUpText(record: Record<string, unknown>, fallback?: string): string {
  const direct = normalizeWhitespace(
    record.followUpInstructions ||
    record.instructions ||
    record.followUp ||
    fallback ||
    ''
  );
  return direct;
}

function parseReviewDaysFromText(value: string): number | null {
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(/(\d+)\s*(day|days|d|week|weeks|w|month|months|mo)\b/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2];
  if (unit.startsWith('w')) return amount * 7;
  if (unit.startsWith('m')) return amount * 30;
  return amount;
}

function parseDateMs(value: unknown): number {
  if (!value) return 0;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferReviewDays(input: {
  createdAt?: unknown;
  validUntil?: unknown;
  followUpInstructions?: string;
  followUpText?: string;
}): number | null {
  const createdAtMs = parseDateMs(input.createdAt);
  const validUntilMs = parseDateMs(input.validUntil);
  if (createdAtMs > 0 && validUntilMs > createdAtMs) {
    const diffDays = Math.round((validUntilMs - createdAtMs) / DAY_MS);
    if (diffDays > 0 && diffDays <= 365) return diffDays;
  }

  const textual = [
    input.followUpInstructions || '',
    input.followUpText || '',
  ].map((entry) => parseReviewDaysFromText(entry)).find((entry) => entry != null);

  return textual ?? null;
}

function extractDrugName(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const record = raw as Record<string, unknown>;
  return normalizeWhitespace(record.drugName || record.name || record.medicine || '');
}

function normalizeDrugKey(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, ' ').trim();
}

function drugNamesMatch(left: unknown, right: unknown): boolean {
  const a = normalizeDrugKey(left);
  const b = normalizeDrugKey(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function normalizeItems(value: unknown): Array<Record<string, unknown>> {
  return asArray(value)
    .map((entry) => (entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && extractDrugName(entry)))
    .map((entry) => ({ ...entry }));
}

function buildSignature(items: Array<Record<string, unknown>>): string {
  const names = uniqCaseInsensitive(items.map((entry) => extractDrugName(entry)).filter(Boolean))
    .map((entry) => normalizeText(entry))
    .sort();
  return names.join('|');
}

function extractComboDrugNames(items: Array<Record<string, unknown>>): string[] {
  return uniqCaseInsensitive(items.map((entry) => extractDrugName(entry)).filter(Boolean));
}

function buildMedicationSignature(item: Record<string, unknown>): string {
  const durationRaw = item.duration;
  const duration =
    typeof durationRaw === 'number'
      ? String(durationRaw)
      : normalizeWhitespace(durationRaw);
  return [
    normalizeDrugKey(extractDrugName(item)),
    normalizeWhitespace(item.dosage),
    normalizeText(item.dosageUnit),
    normalizeText(item.frequency),
    normalizeText(item.dosePattern),
    normalizeText(item.timing),
    duration,
    normalizeText(item.durationUnit),
    normalizeText(item.instructions),
    normalizeText(item.route),
  ].join('|');
}

function mostCommonString(values: string[]): string {
  const counts = new Map<string, { value: string; count: number }>();
  for (const raw of values) {
    const value = normalizeWhitespace(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { value, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.value || '';
}

function mostCommonNumber(values: Array<number | null>): number | null {
  const counts = new Map<number, number>();
  for (const value of values) {
    if (!Number.isFinite(value) || value == null || value <= 0) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return winner ? winner[0] : null;
}

function mergeInvestigations(records: FlatPlanRecord[]): string[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const record of records) {
    for (const value of uniqCaseInsensitive(record.investigations)) {
      const key = value.toLowerCase();
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { value, count: 1 });
    }
  }

  const threshold = records.length >= 3 ? Math.ceil(records.length / 2) : 1;
  const picked = [...counts.values()]
    .filter((entry) => entry.count >= threshold)
    .sort((a, b) => b.count - a.count)
    .map((entry) => entry.value);

  return picked.length ? picked : (records[0]?.investigations || []);
}

function buildPatientRecord(
  visit: Record<string, unknown>,
  diagnosis: string,
  currentVisitId: string | null | undefined,
  doctorId: string | undefined
): FlatPlanRecord | null {
  if (normalizeWhitespace(visit.id) === normalizeWhitespace(currentVisitId || '')) return null;
  const items = normalizeItems(visit.prescriptionItems || visit.items);
  if (!items.length) return null;

  const diagnosisText = toDiagnosisText(visit.diagnosis);
  const diagnosisScore = scoreDiagnosisMatch(diagnosis, diagnosisText);
  if (diagnosisScore < MIN_DIAGNOSIS_SCORE) return null;

  const planSummary = asObject(visit.planSummary);
  const prescriptionMeta = asObject(visit.prescriptionMeta);
  const followUpInstructions = extractFollowUpText(
    {
      followUpInstructions: planSummary.followUpInstructions || prescriptionMeta.followUpInstructions,
      followUp: planSummary.followUp,
    },
    ''
  );
  const reviewDays = inferReviewDays({
    createdAt: visit.createdAt,
    validUntil: prescriptionMeta.validUntil,
    followUpInstructions,
    followUpText: normalizeWhitespace(planSummary.followUp),
  });
  const investigations = normalizeInvestigations(planSummary.investigations);
  const sameDoctor = normalizeWhitespace(visit.doctorId || asObject(visit.doctor).id) === normalizeWhitespace(doctorId || '');
  const createdAtMs = parseDateMs(visit.createdAt);
  const recentBoost = createdAtMs > 0
    ? Math.max(0, 0.16 - Math.min(0.12, ((Date.now() - createdAtMs) / DAY_MS) / 365))
    : 0;

  return {
    sourceKind: 'patient-last-plan',
    sourceLabel: sameDoctor
      ? 'Auto-filled from this patient’s last similar plan'
      : 'Auto-filled from this patient’s similar visit history',
    diagnosisText,
    diagnosisScore,
    confidence: Math.min(0.99, diagnosisScore * 0.78 + recentBoost + (sameDoctor ? 0.08 : 0) + Math.min(0.08, items.length * 0.02)),
    evidenceCount: 1,
    items,
    investigations,
    followUpInstructions,
    reviewDays,
    comboDrugNames: extractComboDrugNames(items),
    signature: buildSignature(items),
    createdAtMs,
  };
}

function buildTemplateRecord(
  template: Record<string, unknown>,
  diagnosis: string
): FlatPlanRecord | null {
  const items = normalizeItems(template.items);
  if (!items.length) return null;

  const metadata = asObject(template.metadata);
  const diagnosisText = toDiagnosisText(metadata.diagnosis || template.diagnosis);
  const diagnosisScore = scoreDiagnosisMatch(diagnosis, diagnosisText);
  if (diagnosisScore < 0.55) return null;

  const followUpInstructions = extractFollowUpText(metadata, '');
  const reviewDays = inferReviewDays({
    followUpInstructions,
    followUpText: normalizeWhitespace(metadata.reviewDate || metadata.review || metadata.followUpDays),
  });

  return {
    sourceKind: 'doctor-template',
    sourceLabel: normalizeWhitespace(template.name)
      ? `Auto-filled from saved order set: ${normalizeWhitespace(template.name)}`
      : 'Auto-filled from a saved order set',
    diagnosisText,
    diagnosisScore,
    confidence: Math.min(0.94, diagnosisScore * 0.82 + Math.min(0.1, items.length * 0.025)),
    evidenceCount: 1,
    items,
    investigations: normalizeInvestigations(metadata.investigations),
    followUpInstructions,
    reviewDays,
    comboDrugNames: extractComboDrugNames(items),
    signature: buildSignature(items),
    createdAtMs: parseDateMs(template.updatedAt || template.createdAt),
  };
}

function buildDoctorPatternRecords(
  prescriptions: unknown[],
  diagnosis: string
): FlatPlanRecord[] {
  const rawRecords = prescriptions
    .map((entry) => (entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map<FlatPlanRecord | null>((record) => {
      const items = normalizeItems(record.items);
      const diagnosisText = extractPrescriptionDiagnosis(record);
      const metadata = asObject(record.metadata);
      const diagnosisScore = scoreDiagnosisMatch(diagnosis, diagnosisText);
      if (!items.length || diagnosisScore < MIN_DIAGNOSIS_SCORE) return null;

      const followUpInstructions = extractFollowUpText(
        {
          followUpInstructions: record.followUpInstructions || metadata.followUpInstructions,
          instructions: record.instructions,
        },
        ''
      );

      return {
        sourceKind: 'doctor-pattern' as const,
        sourceLabel: '',
        diagnosisText,
        diagnosisScore,
        confidence: 0,
        evidenceCount: 1,
        items,
        investigations: normalizeInvestigations(metadata.investigations),
        followUpInstructions,
        reviewDays: inferReviewDays({
          createdAt: record.createdAt || asObject(record.visit).createdAt,
          validUntil: record.validUntil,
          followUpInstructions,
        }),
        comboDrugNames: extractComboDrugNames(items),
        signature: buildSignature(items),
        createdAtMs: parseDateMs(record.createdAt || asObject(record.visit).createdAt),
      } satisfies FlatPlanRecord;
    })
    .filter((record): record is FlatPlanRecord => Boolean(record));

  const grouped = new Map<string, FlatPlanRecord[]>();
  for (const record of rawRecords) {
    const key = record.signature || `single:${record.createdAtMs}`;
    const bucket = grouped.get(key) || [];
    bucket.push(record);
    grouped.set(key, bucket);
  }

  return [...grouped.values()]
    .map((group) => {
      const representative = [...group].sort((a, b) => {
        if (b.diagnosisScore !== a.diagnosisScore) return b.diagnosisScore - a.diagnosisScore;
        return b.createdAtMs - a.createdAtMs;
      })[0];
      const avgScore = group.reduce((sum, record) => sum + record.diagnosisScore, 0) / group.length;
      const followUpInstructions = mostCommonString(group.map((record) => record.followUpInstructions)) || representative.followUpInstructions;
      const reviewDays = mostCommonNumber(group.map((record) => record.reviewDays)) ?? representative.reviewDays;
      const evidenceCount = group.length;

      return {
        ...representative,
        sourceLabel: evidenceCount > 1
          ? `Learned from ${evidenceCount} similar prescriptions`
          : 'Auto-filled from your most recent similar prescription',
        confidence: Math.min(
          0.96,
          avgScore * 0.62 +
            Math.min(0.26, Math.max(0, evidenceCount - 1) * 0.09) +
            Math.min(0.08, representative.items.length * 0.02)
        ),
        evidenceCount,
        followUpInstructions,
        reviewDays,
        investigations: mergeInvestigations(group),
      };
    })
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.createdAtMs - a.createdAtMs;
    });
}

function buildPatientMedicationRecords(input: {
  visits: unknown[];
  diagnosis: string;
  drugName: string;
  currentVisitId?: string | null;
  doctorId?: string;
}): FlatMedicationRecord[] {
  return (input.visits || [])
    .map((entry) => (entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .flatMap((visit) => {
      if (normalizeWhitespace(visit.id) === normalizeWhitespace(input.currentVisitId || '')) return [];
      const diagnosisText = toDiagnosisText(visit.diagnosis);
      const diagnosisScore = scoreDiagnosisMatch(input.diagnosis, diagnosisText);
      if (diagnosisScore < MIN_DIAGNOSIS_SCORE) return [];

      const sameDoctor = normalizeWhitespace(visit.doctorId || asObject(visit.doctor).id) === normalizeWhitespace(input.doctorId || '');
      const createdAtMs = parseDateMs(visit.createdAt);
      const recentBoost = createdAtMs > 0
        ? Math.max(0, 0.14 - Math.min(0.1, ((Date.now() - createdAtMs) / DAY_MS) / 365))
        : 0;

      return normalizeItems(visit.prescriptionItems || visit.items)
        .filter((item) => drugNamesMatch(extractDrugName(item), input.drugName))
        .map<FlatMedicationRecord>((item) => ({
          sourceKind: 'patient-last-plan',
          sourceLabel: sameDoctor
            ? `Usual sig from this patient’s last similar ${extractDrugName(item)} plan`
            : `Usual sig from this patient’s similar ${extractDrugName(item)} history`,
          diagnosisText,
          diagnosisScore,
          confidence: Math.min(0.98, diagnosisScore * 0.8 + recentBoost + (sameDoctor ? 0.08 : 0) + 0.06),
          evidenceCount: 1,
          item,
          signature: buildMedicationSignature(item),
          createdAtMs,
        }));
    })
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.createdAtMs - a.createdAtMs;
    });
}

function buildDoctorMedicationRecords(input: {
  prescriptions: unknown[];
  diagnosis: string;
  drugName: string;
}): FlatMedicationRecord[] {
  const rawRecords = (input.prescriptions || [])
    .map((entry) => (entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .flatMap((record) => {
      const diagnosisText = extractPrescriptionDiagnosis(record);
      const diagnosisScore = scoreDiagnosisMatch(input.diagnosis, diagnosisText);
      if (diagnosisScore < MIN_DIAGNOSIS_SCORE) return [];

      const createdAtMs = parseDateMs(record.createdAt || asObject(record.visit).createdAt);
      return normalizeItems(record.items)
        .filter((item) => drugNamesMatch(extractDrugName(item), input.drugName))
        .map<FlatMedicationRecord>((item) => ({
          sourceKind: 'doctor-pattern',
          sourceLabel: '',
          diagnosisText,
          diagnosisScore,
          confidence: 0,
          evidenceCount: 1,
          item,
          signature: buildMedicationSignature(item),
          createdAtMs,
        }));
    });

  const grouped = new Map<string, FlatMedicationRecord[]>();
  for (const record of rawRecords) {
    const key = record.signature || `single:${record.createdAtMs}`;
    const bucket = grouped.get(key) || [];
    bucket.push(record);
    grouped.set(key, bucket);
  }

  return [...grouped.values()]
    .map((group) => {
      const representative = [...group].sort((a, b) => {
        if (b.diagnosisScore !== a.diagnosisScore) return b.diagnosisScore - a.diagnosisScore;
        return b.createdAtMs - a.createdAtMs;
      })[0];
      const avgScore = group.reduce((sum, record) => sum + record.diagnosisScore, 0) / group.length;
      const evidenceCount = group.length;
      return {
        ...representative,
        sourceLabel: evidenceCount > 1
          ? `Usual sig learned from ${evidenceCount} similar ${extractDrugName(representative.item)} prescriptions`
          : `Usual sig from your most recent similar ${extractDrugName(representative.item)} prescription`,
        confidence: Math.min(
          0.95,
          avgScore * 0.64 +
            Math.min(0.24, Math.max(0, evidenceCount - 1) * 0.08) +
            0.04
        ),
        evidenceCount,
      } satisfies FlatMedicationRecord;
    })
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.createdAtMs - a.createdAtMs;
    });
}

function rankCandidate(candidate: FlatPlanRecord): number {
  const sourceBias =
    candidate.sourceKind === 'patient-last-plan'
      ? 0.12
      : candidate.sourceKind === 'doctor-template'
        ? 0.04
        : 0;
  return candidate.confidence + sourceBias;
}

function buildSupportingLabel(primary: FlatPlanRecord, pattern: FlatPlanRecord | null, template: FlatPlanRecord | null): string | undefined {
  if (primary.sourceKind !== 'doctor-pattern' && pattern && pattern.evidenceCount > 1 && pattern.diagnosisScore >= 0.6) {
    return `Also aligns with ${pattern.evidenceCount} recent prescriptions for similar diagnoses.`;
  }
  if (primary.sourceKind !== 'doctor-template' && template && template.diagnosisScore >= 0.72) {
    return 'Saved order-set history also points to the same pattern.';
  }
  return undefined;
}

function rankMedicationCandidate(candidate: FlatMedicationRecord): number {
  const sourceBias = candidate.sourceKind === 'patient-last-plan' ? 0.12 : 0.03;
  return candidate.confidence + sourceBias;
}

export function buildLearnedPrescriptionPlan(input: {
  diagnosis: string;
  patientVisits?: unknown[];
  doctorPrescriptions?: unknown[];
  templates?: unknown[];
  currentVisitId?: string | null;
  doctorId?: string;
}): LearnedPlanSuggestion | null {
  const diagnosis = normalizeWhitespace(input.diagnosis);
  if (diagnosis.length < 3) return null;

  const patientCandidate = (input.patientVisits || [])
    .map((entry) => (entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((visit) => buildPatientRecord(visit, diagnosis, input.currentVisitId, input.doctorId))
    .filter((entry): entry is FlatPlanRecord => Boolean(entry))
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.createdAtMs - a.createdAtMs;
    })[0] || null;

  const templateCandidate = (input.templates || [])
    .map((entry) => (entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((template) => buildTemplateRecord(template, diagnosis))
    .filter((entry): entry is FlatPlanRecord => Boolean(entry))
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.createdAtMs - a.createdAtMs;
    })[0] || null;

  const doctorPatternCandidate = buildDoctorPatternRecords(input.doctorPrescriptions || [], diagnosis)[0] || null;

  const candidates = [patientCandidate, doctorPatternCandidate, templateCandidate]
    .filter((entry): entry is FlatPlanRecord => Boolean(entry))
    .sort((a, b) => rankCandidate(b) - rankCandidate(a));

  const primary = candidates[0];
  if (!primary || primary.confidence < 0.52) return null;

  const fallbackFields = candidates.filter((entry) => entry.signature !== primary.signature);
  const followUpInstructions =
    primary.followUpInstructions ||
    fallbackFields.map((entry) => entry.followUpInstructions).find(Boolean) ||
    '';
  const reviewDays =
    primary.reviewDays ??
    fallbackFields.map((entry) => entry.reviewDays).find((entry) => entry != null) ??
    null;
  const investigations =
    primary.investigations.length > 0
      ? primary.investigations
      : (fallbackFields.map((entry) => entry.investigations).find((entry) => entry.length > 0) || []);

  return {
    sourceKind: primary.sourceKind,
    sourceLabel: primary.sourceLabel,
    supportingLabel: buildSupportingLabel(primary, doctorPatternCandidate, templateCandidate),
    diagnosisText: primary.diagnosisText,
    confidence: Number(primary.confidence.toFixed(2)),
    evidenceCount: primary.evidenceCount,
    items: primary.items,
    investigations,
    followUpInstructions,
    reviewDays,
    comboDrugNames: primary.comboDrugNames,
    signature: [
      primary.sourceKind,
      primary.signature,
      primary.diagnosisText,
      reviewDays ?? '',
      investigations.join('|'),
      followUpInstructions,
    ].join('::'),
  };
}

export function buildLearnedMedicationSuggestion(input: {
  drugName: string;
  diagnosis: string;
  patientVisits?: unknown[];
  doctorPrescriptions?: unknown[];
  currentVisitId?: string | null;
  doctorId?: string;
}): LearnedMedicationSuggestion | null {
  const drugName = normalizeWhitespace(input.drugName);
  const diagnosis = normalizeWhitespace(input.diagnosis);
  if (drugName.length < 2 || diagnosis.length < 3) return null;

  const patientCandidate = buildPatientMedicationRecords({
    visits: input.patientVisits || [],
    diagnosis,
    drugName,
    currentVisitId: input.currentVisitId,
    doctorId: input.doctorId,
  })[0] || null;

  const doctorCandidate = buildDoctorMedicationRecords({
    prescriptions: input.doctorPrescriptions || [],
    diagnosis,
    drugName,
  })[0] || null;

  const primary = [patientCandidate, doctorCandidate]
    .filter((entry): entry is FlatMedicationRecord => Boolean(entry))
    .sort((a, b) => rankMedicationCandidate(b) - rankMedicationCandidate(a))[0];

  if (!primary || primary.confidence < 0.58) return null;

  return {
    sourceKind: primary.sourceKind,
    sourceLabel: primary.sourceLabel,
    diagnosisText: primary.diagnosisText,
    confidence: Number(primary.confidence.toFixed(2)),
    evidenceCount: primary.evidenceCount,
    item: { ...primary.item },
    signature: [
      primary.sourceKind,
      primary.signature,
      primary.diagnosisText,
    ].join('::'),
  };
}
