import { WhatsAppPayload } from './whatsapp-sender';

const LANG: Record<string, string> = { EN: 'en', TE: 'te', HI: 'hi' };

/** Body parameters for each approved WhatsApp template, in template order. No template names a person. */
const BODY: Record<string, string[]> = {
  number_confirmation: ['clinic', 'code'],
  opt_out_confirmation: ['clinic'],
  patient_message_ack: ['clinic', 'hours', 'emergency'],
};

export function renderTemplate(templateKey: string, params: Record<string, any>): WhatsAppPayload {
  if (params.whatsapp && typeof params.whatsapp === 'object') return params.whatsapp as WhatsAppPayload;
  const keys = BODY[templateKey];
  if (!keys) throw new Error(`Unknown WhatsApp template ${templateKey}`);
  const components: unknown[] = [
    { type: 'body', parameters: keys.map((k) => ({ type: 'text', text: String(params[k] ?? '') })) },
  ];
  if (params.payload) {
    components.push({ type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: String(params.payload) }] });
  }
  return { kind: 'template', name: templateKey, language: LANG[String(params.language ?? 'EN')] ?? 'en', components };
}
