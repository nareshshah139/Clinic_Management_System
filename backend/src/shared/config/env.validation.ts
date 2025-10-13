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

  return config;
}

