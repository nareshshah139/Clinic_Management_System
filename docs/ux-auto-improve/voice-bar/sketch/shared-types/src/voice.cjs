/**
 * @cc [owner:nareshshah139,label:product] voice-wire-single-source
 * Voice intents, visit-note section keys, text limits and voice routes MUST be declared only in
 * this file; the frontend and backend MUST import them rather than restate them.
 */
const VOICE_INTENTS = Object.freeze(['visit-note', 'book-appointment', 'stock-count']);

const VISIT_NOTE_SECTIONS = Object.freeze(['chiefComplaints', 'examination', 'pastHistory', 'medicationHistory']);

const VOICE_TEXT_LIMITS = Object.freeze({
  'visit-note': 8000,
  'book-appointment': 500,
  'stock-count': 500,
});

const VOICE_ROUTES = Object.freeze({
  'visit-note': 'voice/visit-note',
  'book-appointment': 'voice/appointment',
  'stock-count': 'voice/stock-count',
});

const VOICE_STATUS_ROUTE = 'voice/status';

module.exports = { VOICE_INTENTS, VISIT_NOTE_SECTIONS, VOICE_TEXT_LIMITS, VOICE_ROUTES, VOICE_STATUS_ROUTE };
