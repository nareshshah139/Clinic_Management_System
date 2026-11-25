import { WhatsAppPayload } from './whatsapp-sender';
import { deriveTaskToken } from '../follow-ups/task-link';

const LANG: Record<string, string> = { EN: 'en', TE: 'te', HI: 'hi' };

/** Body parameters for each approved WhatsApp template, in template order. No template names a person. */
const BODY: Record<string, string[]> = {
  number_confirmation: ['clinic', 'code'],
  opt_out_confirmation: ['clinic'],
  patient_message_ack: ['clinic', 'hours', 'emergency'],
  check_in_opened: ['clinic'],
  check_in_reminder: ['clinic'],
  review_reminder: ['clinic', 'date', 'time', 'doctor'],
  portal_sign_in_code: ['code'],
  // Its button is a static URL to /p, approved with the template; it carries no token.
  portal_reply_notice: ['clinic'],
};

/**
 * @cc [owner:nareshshah139,label:privacy] care-message-content
 * Check-in and review-reminder messages MUST carry no diagnosis, medicine name or score (PP-41).
 * A check-in message carries its task-link token only as the URL-button parameter, derived from
 * the link id when the message is rendered.
 */
const URL_BUTTON_TEMPLATES = new Set(['check_in_opened', 'check_in_reminder']);

export function renderTemplate(templateKey: string, params: Record<string, any>): WhatsAppPayload {
  if (params.whatsapp && typeof params.whatsapp === 'object') return params.whatsapp as WhatsAppPayload;
  const keys = BODY[templateKey];
  if (!keys) throw new Error(`Unknown WhatsApp template ${templateKey}`);
  const components: unknown[] = [
    { type: 'body', parameters: keys.map((k) => ({ type: 'text', text: String(params[k] ?? '') })) },
  ];
  if (URL_BUTTON_TEMPLATES.has(templateKey)) {
    if (!params.linkId) throw new Error(`${templateKey} needs a task link`);
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: deriveTaskToken(String(params.linkId)) }] });
  }
  if (templateKey === 'portal_sign_in_code') {
    // WhatsApp authentication templates repeat the code as the copy-code button parameter.
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(params.code ?? '') }] });
  }
  if (params.payload) {
    components.push({ type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: String(params.payload) }] });
  }
  return { kind: 'template', name: templateKey, language: LANG[String(params.language ?? 'EN')] ?? 'en', components };
}
