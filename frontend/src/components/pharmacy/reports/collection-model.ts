import type { CollectionMode, CollectionStatus, DailyCollection, ModeLine } from "./report-types";

export type CountDraft = Partial<Record<CollectionMode, string>>;

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Accepts what people type for money: "18250", "18,250.50", "₹ 1,82,500". Empty is "not entered"; anything else unreadable is NaN. */
export function parseAmount(text: string | undefined): number | null {
  const cleaned = (text ?? "").replace(/[₹,\s]/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return Number.NaN;
  return round(Number(cleaned));
}

/** Starts from the latest saved count, so a recount only changes what differs. */
export function initialDraft(collection: DailyCollection): CountDraft {
  const draft: CountDraft = {};
  for (const line of collection.modes) {
    const value = collection.count?.counted[line.mode];
    draft[line.mode] = value === undefined || value === null ? "" : String(value);
  }
  return draft;
}

export type PreviewLine = { mode: CollectionMode; counted: number | null; difference: number | null; invalid: boolean };

/** The difference the count would show, worked out as it is typed; the server recomputes it on save. */
export function previewCount(modes: ModeLine[], draft: CountDraft) {
  const lines: PreviewLine[] = modes.map((line) => {
    const counted = parseAmount(draft[line.mode]);
    const invalid = counted !== null && Number.isNaN(counted);
    return { mode: line.mode, counted: invalid ? null : counted, difference: counted === null || invalid ? null : round(counted - line.expected), invalid };
  });
  const entered = lines.filter((line) => line.counted !== null);
  const anyInvalid = lines.some((line) => line.invalid);
  // A mode left blank counts as nothing in hand, as the server treats it, but only once something has been entered.
  const counted = entered.length ? round(lines.reduce((sum, line) => sum + (line.counted ?? 0), 0)) : null;
  const expected = round(modes.reduce((sum, line) => sum + line.expected, 0));
  return { lines, entered: entered.length, anyInvalid, counted, difference: counted === null ? null : round(counted - expected) };
}

export function countPayload(draft: CountDraft) {
  const counted: Record<string, number> = {};
  for (const [mode, text] of Object.entries(draft)) {
    const value = parseAmount(text);
    if (value !== null && !Number.isNaN(value)) counted[mode] = value;
  }
  return counted;
}

export function draftChanged(collection: DailyCollection, draft: CountDraft, note: string): boolean {
  const saved = initialDraft(collection);
  const same = collection.modes.every((line) => parseAmount(saved[line.mode]) === parseAmount(draft[line.mode]));
  return !same || note.trim() !== (collection.count?.note ?? "");
}

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function statusMessage(status: CollectionStatus, difference: number | null): { tone: "good" | "bad" | "warning"; text: string } {
  if (status === "NOT_COUNTED") return { tone: "warning", text: "Pharmacy not counted yet. Count the pharmacy cash drawer and check its UPI and card settlements, then enter them below." };
  if (status === "BALANCED") return { tone: "good", text: "Pharmacy balanced: what was counted matches what the system expected." };
  const amount = rupees.format(Math.abs(difference ?? 0));
  return status === "SHORT"
    ? { tone: "bad", text: `Pharmacy short by ${amount}. Check the drawer, pending UPI settlements and any refunds paid in cash.` }
    : { tone: "warning", text: `Pharmacy over by ${amount}. Check for a payment taken without a bill, or a bill not yet confirmed.` };
}
