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
    logger.warn('OPENAI_API_KEY is not set. /visits/transcribe endpoint will be disabled.');
  }

  return config;
}

