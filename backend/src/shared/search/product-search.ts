import { BadRequestException } from '@nestjs/common';

export type ProductSearchMode = 'all' | 'name' | 'ingredient';
export type ProductSearchKind =
  | 'code'
  | 'exact'
  | 'alias'
  | 'prefix'
  | 'phrase'
  | 'words'
  | 'fuzzy';
export type ProductSearchMatch = {
  score: number;
  quality: number;
  kind: ProductSearchKind;
  matchedText: string;
  corrections: string[];
};
export type SearchableProduct = {
  names: string[];
  aliases?: string[];
  ingredients?: string[];
  manufacturer?: string | null;
  category?: string | null;
  details?: (string | null | undefined)[];
  codes?: (string | null | undefined)[];
  strength?: string | null;
};

const synonyms: Record<string, string> = {
  tab: 'tablet',
  tabs: 'tablet',
  tablets: 'tablet',
  cap: 'capsule',
  caps: 'capsule',
  capsules: 'capsule',
  gm: 'g',
  gms: 'g',
  gram: 'g',
  grams: 'g',
  mcg: 'mcg',
  ug: 'mcg',
};
const protectedWords = new Set([
  'tablet',
  'capsule',
  'cream',
  'ointment',
  'gel',
  'lotion',
  'solution',
  'syrup',
  'suspension',
  'injection',
  'drops',
  'mg',
  'mcg',
  'g',
  'ml',
  'iu',
]);
export function normalizeProductSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(\d)([a-z%])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^\p{L}\p{N}.%+]+/gu, ' ')
    .replace(/\.(?!\d)|(?<!\d)\./g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => synonyms[t] || t)
    .join(' ');
}
export function checkedProductQuery(value: unknown): string {
  const query = String(value ?? '').trim();
  if (
    query.length > 200 ||
    normalizeProductSearch(query).split(' ').length > 24
  )
    throw new BadRequestException(
      'Search must contain at most 200 characters and 24 words.',
    );
  return query;
}

/**
 * @cc [owner:nareshshah139,label:calculation] product-search-bounded-typos
 * Adjacent transpositions MUST count as one typo, with unit insertion, deletion and substitution
 * costs. The caller MUST apply domain restrictions before using distance as a match.
 */
export function productEditDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i),
    older = previous;
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        current[j] = Math.min(current[j], older[j - 2] + 1);
    }
    older = previous;
    previous = current;
  }
  return previous[b.length];
}

const numeric = (token: string) => /\d/.test(token);
const strengths = (value: string) =>
  [
    ...normalizeProductSearch(value).matchAll(
      /\b(\d+(?:\.\d+)?)\s+(mg|mcg|iu|%)(?=\s|$)/g,
    ),
  ].map((m) => `${Number(m[1])} ${m[2]}`);
export function productStrengthConflict(
  query: string,
  product: SearchableProduct,
): boolean {
  const wanted = strengths(query);
  const actual = strengths(
    [product.strength, ...product.names].filter(Boolean).join(' '),
  );
  if (wanted.length && actual.length)
    return wanted.some((s) => !actual.includes(s));
  const tokens = normalizeProductSearch(query).split(' '),
    numbers = tokens.filter((t) => /^\d+(\.\d+)?$/.test(t)).map(Number);
  // A bare dose such as "Folitrax 5" must not be satisfied by a 5-tablet pack of 10 mg.
  if (
    !wanted.length &&
    actual.length &&
    numbers.length &&
    !tokens.some((t) =>
      ['g', 'ml', 'pack', 'strip', 'box', 'bottle', 'tube'].includes(t),
    )
  ) {
    return numbers.some(
      (n) => !actual.some((s) => Number(s.split(' ')[0]) === n),
    );
  }
  return false;
}

/**
 * @cc [owner:nareshshah139,label:product] search-pack-not-equivalence
 * Known mass, volume and count packs MUST remain distinct. Loose units MUST NOT compare equal
 * to their source pack. Missing or ambiguous pack text MUST return no comparison key.
 */
export function searchPackKey(value: string): string | null {
  const text = normalizeProductSearch(value);
  if (text.includes('source pack') || text.includes('loose'))
    return `loose:${text}`;
  const volume = text.match(/\b(\d+(?:\.\d+)?) (ml|g)\b/);
  if (volume)
    return text.match(/\d+(?:\.\d+)?/g)?.length === 1
      ? `${Number(volume[1])}:${volume[2]}`
      : null;
  const count = text.replace(/^1 x /, '').match(/\d+(?:\.\d+)?/g);
  return count?.length === 1 &&
    Number(count[0]) > 0 &&
    !/\b(mg|mcg|iu|%)\b/.test(text)
    ? `${Number(count[0])}:count`
    : null;
}

/**
 * @cc [owner:nareshshah139,label:product] ocr-search-annotation-only
 * Only the literal parenthesized DPC annotation MAY be omitted from an OCR suggestion query.
 * The original line MUST remain unchanged and the omission MUST be exposed to the reviewer.
 * Unknown parenthetical text, release modifiers and strengths MUST remain in the query.
 */
export function ocrProductSearchQuery(original: string): {
  query: string;
  notes: string[];
} {
  const query = original.replace(/\s*\(\s*DPC\s*\)/gi, '').trim();
  return {
    query,
    notes:
      query !== original.trim()
        ? ['Search omitted supplier annotation (DPC); verify the original line']
        : [],
  };
}

/**
 * @cc [owner:nareshshah139,label:product] product-search-shared-ranking
 * Exact codes and names MUST outrank aliases, prefixes, word matches and typo suggestions.
 * Every query token MUST be accounted for; numbers MUST match entire tokens outside literal code
 * lookups. Code fragments MAY match literally but MUST rank below name matches. Explicit strength
 * conflicts MUST be excluded from name/ingredient matching. Names/aliases/ingredients use one scorer across Inventory, Drug
 * Search and OCR suggestions; a score MUST NOT authorize identity changes or stock posting.
 * Numeric tokens, forms and words shorter than four letters MUST NOT receive typo substitutions.
 */
export function matchProductSearch(
  rawQuery: string,
  product: SearchableProduct,
  mode: ProductSearchMode = 'all',
): ProductSearchMatch | null {
  const query = normalizeProductSearch(rawQuery);
  if (!query) return null;
  const codes = (product.codes || []).filter((s): s is string => !!s);
  if (
    mode === 'all' &&
    codes.some((s) => s.toLowerCase() === rawQuery.trim().toLowerCase())
  )
    return {
      score: 10000,
      quality: 1,
      kind: 'code',
      matchedText: rawQuery,
      corrections: [],
    };
  const codeFragment =
    mode === 'all' &&
    codes.find((s) => s.toLowerCase().includes(rawQuery.trim().toLowerCase()));
  const codeMatch: ProductSearchMatch | null = codeFragment
    ? {
        score: 2500,
        quality: 0.8,
        kind: 'code',
        matchedText: codeFragment,
        corrections: [],
      }
    : null;
  if (productStrengthConflict(query, product)) return codeMatch;
  const fields: {
    text: string;
    normalized: string;
    weight: number;
    alias: boolean;
    fuzzy: boolean;
  }[] = [];
  const add = (
    values: (string | null | undefined)[],
    weight: number,
    alias = false,
    fuzzy = true,
  ) => {
    for (const text of values)
      if (text?.trim())
        fields.push({
          text,
          normalized: normalizeProductSearch(text),
          weight,
          alias,
          fuzzy,
        });
  };
  if (mode !== 'ingredient') {
    add(product.names, 90);
    add(product.aliases || [], 80, true);
  }
  if (mode !== 'name') {
    add(product.ingredients || [], mode === 'ingredient' ? 90 : 50);
    if (mode === 'all') {
      add([product.manufacturer], 30);
      add([product.category], 10, false, false);
    }
  }
  // Pack and stock metadata can qualify a name lookup, but never drive fuzzy spelling correction.
  if (mode !== 'ingredient') {
    add(product.details || [], 5, false, false);
    if (mode === 'all') add(codes, 0, false, false);
  }
  const queryTokens = query.split(' ');
  const fieldsWithTokens = fields.map((f) => ({
    ...f,
    tokens: f.normalized.split(' '),
  }));
  const allTokens = fieldsWithTokens.flatMap((f) => f.tokens);
  if (
    queryTokens.some(
      (t) => (numeric(t) || protectedWords.has(t)) && !allTokens.includes(t),
    )
  )
    return codeMatch;

  let best: ProductSearchMatch | null = null;
  for (const field of fields) {
    let kind: ProductSearchKind | undefined,
      base = 0,
      quality = 0;
    if (field.normalized === query) {
      kind = field.alias ? 'alias' : 'exact';
      base = field.alias ? 8500 : 9000;
      quality = 1;
    } else if (field.normalized.startsWith(query)) {
      kind = 'prefix';
      base = 8000;
      quality = 0.94;
    } else if (field.normalized.includes(query)) {
      kind = 'phrase';
      base = 7000;
      quality = 0.88;
    }
    if (kind) {
      // Secondary fields retain Drug Search's name-first behavior.
      const score = base + field.weight * 5 - (field.weight < 80 ? 3000 : 0);
      if (!best || score > best.score)
        best = {
          score,
          quality,
          kind,
          matchedText: field.text,
          corrections: [],
        };
    }
  }
  if (best) return best;

  const corrections: string[] = [];
  let weakest = 1,
    weight = 0;
  for (const token of queryTokens) {
    const direct = fieldsWithTokens.filter((f) =>
      f.tokens.some((t) =>
        numeric(token) || protectedWords.has(token)
          ? t === token
          : t.includes(token),
      ),
    );
    if (direct.length) {
      weight += Math.max(...direct.map((f) => f.weight));
      continue;
    }
    if (
      numeric(token) ||
      /[+%]/.test(token) ||
      token.length < 4 ||
      token.length > 64 ||
      protectedWords.has(token)
    )
      return codeMatch;
    const maxEdits = token.length >= 7 ? 2 : 1;
    let closest:
      | { token: string; distance: number; weight: number }
      | undefined;
    for (const field of fieldsWithTokens.filter((f) => f.fuzzy)) {
      // Joining adjacent name words also finds "maxrcih" in "Max Rich Yu".
      const candidates = [
        ...field.tokens,
        ...field.tokens.slice(0, -1).map((t, i) => t + field.tokens[i + 1]),
      ];
      for (const target of candidates) {
        if (
          numeric(target) ||
          target.length < 4 ||
          protectedWords.has(target) ||
          Math.abs(target.length - token.length) > maxEdits
        )
          continue;
        const distance = productEditDistance(token, target);
        if (
          distance <= maxEdits &&
          (!closest ||
            distance < closest.distance ||
            (distance === closest.distance && field.weight > closest.weight))
        )
          closest = { token: target, distance, weight: field.weight };
      }
    }
    if (!closest) return codeMatch;
    corrections.push(`${token} → ${closest.token}`);
    weakest = Math.min(
      weakest,
      1 - closest.distance / Math.max(token.length, closest.token.length),
    );
    weight += closest.weight;
  }
  const fuzzy = corrections.length > 0;
  return {
    score: fuzzy
      ? 4000 + Math.round(weakest * 1000) + weight / queryTokens.length / 10
      : 6000 + weight / queryTokens.length,
    quality: fuzzy ? weakest * 0.9 : 0.9,
    kind: fuzzy ? 'fuzzy' : 'words',
    matchedText: product.names[0] || fields[0]?.text || '',
    corrections,
  };
}
