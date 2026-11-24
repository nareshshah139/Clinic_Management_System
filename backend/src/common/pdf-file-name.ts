const MAX_BASE_LENGTH = 120;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const INVISIBLE_FORMAT_CHARS = /(?![\u200c\u200d])\p{Cf}/gu;
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

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

function dayPart(date: string | Date | null | undefined): string {
  if (date == null || date === '') return '';
  if (typeof date === 'string' && CALENDAR_DAY.test(date.trim())) return date.trim();
  const instant = date instanceof Date ? date : new Date(date);
  return Number.isFinite(instant.getTime()) ? clinicDayFormat.format(instant) : '';
}

export function pdfFileName(title: string, patientName?: string | null, date?: string | Date | null): string {
  const safeTitle = sanitizePart(title);
  let name = sanitizePart(patientName ?? '');
  if (!HAS_LETTER_OR_DIGIT.test(name)) name = '';
  const day = dayPart(date);
  const fixedLength = [safeTitle, day].filter(Boolean).join(' - ').length + (name ? 3 : 0);
  if (name) name = sanitizePart(Array.from(name).slice(0, Math.max(0, MAX_BASE_LENGTH - fixedLength)).join(''));
  return `${[safeTitle, name, day].filter(Boolean).join(' - ')}.pdf`;
}
