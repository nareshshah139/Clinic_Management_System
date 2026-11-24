// 200 bytes leaves headroom under the common 255-byte limit for a browser's " (1)" suffix and Windows/macOS path limits.
const MAX_FILE_BYTES = 200;
const EXTENSION = '.pdf';
const SEPARATOR = ' - ';
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const INVISIBLE_FORMAT_CHARS = /(?![\u200c\u200d])\p{Cf}/gu;
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

const clinicDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function sanitizePart(value: string): string {
  return value
    .replace(INVISIBLE_FORMAT_CHARS, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim();
}

function byteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) as number;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function fitBytes(value: string, maxBytes: number): string {
  const units = segmenter ? Array.from(segmenter.segment(value), (part) => part.segment) : Array.from(value);
  let kept = '';
  for (const unit of units) {
    if (byteLength(kept + unit) > maxBytes) break;
    kept += unit;
  }
  return sanitizePart(kept);
}

function dayPart(date: string | Date | null | undefined): string {
  if (date == null || date === '') return '';
  if (typeof date === 'string' && CALENDAR_DAY.test(date.trim())) return date.trim();
  const instant = date instanceof Date ? date : new Date(date);
  return Number.isFinite(instant.getTime()) ? clinicDayFormat.format(instant) : '';
}

export function pdfFileName(title: string, patientName?: string | null, date?: string | Date | null): string {
  let safeTitle = sanitizePart(title);
  let name = sanitizePart(patientName ?? '');
  if (!HAS_LETTER_OR_DIGIT.test(name)) name = '';
  const day = dayPart(date);
  const budget = MAX_FILE_BYTES - byteLength(EXTENSION);
  const dayCost = day ? byteLength(SEPARATOR + day) : 0;
  const fixedBytes = byteLength([safeTitle, day].filter(Boolean).join(SEPARATOR));
  if (fixedBytes > budget) {
    safeTitle = fitBytes(safeTitle, budget - dayCost);
    name = '';
  } else if (name) {
    name = fitBytes(name, budget - fixedBytes - byteLength(SEPARATOR));
  }
  return `${[safeTitle, name, day].filter(Boolean).join(SEPARATOR)}${EXTENSION}`;
}
