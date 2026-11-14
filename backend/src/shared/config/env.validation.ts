import { Logger } from '@nestjs/common';

const logger = new Logger('ConfigValidation');

const REQUIRED_VARS = ['DATABASE_URL', 'JWT_SECRET'];

export function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED_VARS.filter((key) => {
    const value = config[key];
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    logger.error(message);
    throw new Error(message);
  }

  if (!config['JWT_EXPIRES_IN']) {
    logger.warn('JWT_EXPIRES_IN is not set. Falling back to default 1d expiry.');
    config['JWT_EXPIRES_IN'] = '1d';
  }

  if (!config['OPENAI_API_KEY']) {
    logger.warn('OPENAI_API_KEY is not set. AI endpoints (/visits/transcribe, /whatsapp/templates/generate) will be disabled.');
  }

  if (!config['OPENAI_TRANSCRIBE_MODEL']) {
    // Default model for audio transcription
    config['OPENAI_TRANSCRIBE_MODEL'] = 'gpt-4o-transcribe';
  }

  if (!config['OPENAI_TEMPLATE_MODEL']) {
    // Default model for WhatsApp template generation
    config['OPENAI_TEMPLATE_MODEL'] = 'gpt-5-mini';
  }

  // Google Calendar (optional)
  const hasGoogle = config['GCAL_CLIENT_ID'] && config['GCAL_CLIENT_SECRET'] && config['GCAL_REDIRECT_URI'];
  if (!hasGoogle) {
    logger.warn('Google Calendar is not configured. Set GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, and GCAL_REDIRECT_URI to enable calendar sync.');
  } else {
    const redirectUri = String(config['GCAL_REDIRECT_URI']);
    if (redirectUri.includes('localhost')) {
      logger.warn(`GCAL_REDIRECT_URI is set to a localhost URL (${redirectUri}). This will not work in production — update it to match your deployed frontend URL.`);
    }
    logger.log(`Google Calendar configured. Redirect URI: ${redirectUri}`);
  }

  // WhatsApp Cloud (optional): each clinic links its own number in Clinic profile; these are the server-wide fallback.
  const hasWhatsAppToken = !!config['WHATSAPP_TOKEN'];
  const hasWhatsAppPhoneId = !!config['WHATSAPP_PHONE_NUMBER_ID'];
  if (!hasWhatsAppToken || !hasWhatsAppPhoneId) {
    logger.warn(
      'No server-wide WhatsApp number (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID). Clinics without a linked number in Clinic profile cannot send WhatsApp.',
    );
  }
  if (config['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] && !config['META_APP_SECRET']) {
    logger.warn('META_APP_SECRET is not set, so WhatsApp delivery webhooks are accepted without a signature check.');
  }

  return config;
}

