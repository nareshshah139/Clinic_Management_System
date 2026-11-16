/**
 * @cc [owner:nareshshah139,label:product] voice-wire-single-source
 * Voice intents, visit-note section keys, text limits and voice routes MUST be declared only in
 * `voice.cjs` and typed only here; the frontend and backend MUST import them rather than restate them.
 */
export declare const VOICE_INTENTS: readonly ['visit-note', 'book-appointment', 'stock-count'];
export type VoiceIntent = (typeof VOICE_INTENTS)[number];

export declare const VISIT_NOTE_SECTIONS: readonly ['chiefComplaints', 'examination', 'pastHistory', 'medicationHistory'];
export type VisitSectionKey = (typeof VISIT_NOTE_SECTIONS)[number];

/** Maximum characters of one utterance, per intent. Checked by the bar before sending and by the server. */
export declare const VOICE_TEXT_LIMITS: Readonly<Record<VoiceIntent, number>>;

/** Parse route per intent, relative to the API root (the frontend prefixes /api). */
export declare const VOICE_ROUTES: Readonly<{
  'visit-note': 'voice/visit-note';
  'book-appointment': 'voice/appointment';
  'stock-count': 'voice/stock-count';
}>;

/** GET. Free; answers for spoken and typed input alike. */
export declare const VOICE_STATUS_ROUTE: 'voice/status';

export interface VoiceStatus {
  configured: boolean;
}

/** Request body of every parse route. A typed utterance and a transcript are identical here. */
export interface ParseRequest {
  text: string;
}

/** A string the server checked is a substring of `heard`, ignoring case and whitespace. */
export type SpokenText = string;

/** No field of any response is an id. Every value is spoken text, a small number or an enum. */
export interface ParsedVisitNote {
  heard: string;
  /** The server cuts `heard` into sentences; the model only labels them. `text` is a verbatim slice of `heard`. */
  items: Array<{ text: string; section: VisitSectionKey | 'unsorted' }>;
}

export type SpokenDateKind = 'TODAY' | 'TOMORROW' | 'DAY_AFTER' | 'WEEKDAY' | 'CALENDAR';
export type SpokenWeekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface ParsedAppointment {
  heard: string;
  fields: {
    patientName: SpokenText | null;
    doctorName: SpokenText | null;
    dateKind: SpokenDateKind | null;
    weekday: SpokenWeekday | null;
    /** 1 to 31 */
    day: number | null;
    /** 1 to 12 */
    month: number | null;
    /** 2020 to 2100 */
    year: number | null;
    /** 0 to 23 */
    hour: number | null;
    /** 0 to 59 */
    minute: number | null;
    meridiem: 'AM' | 'PM' | null;
  };
}

export interface ParsedStockCount {
  heard: string;
  fields: {
    productName: SpokenText | null;
    batchNumber: SpokenText | null;
    /** Whole number, 0 to 1,000,000 */
    quantity: number | null;
    unitWord: SpokenText | null;
  };
}

/** Response type per intent. Both sides index this, so they cannot disagree. */
export interface ParsedByIntent {
  'visit-note': ParsedVisitNote;
  'book-appointment': ParsedAppointment;
  'stock-count': ParsedStockCount;
}
