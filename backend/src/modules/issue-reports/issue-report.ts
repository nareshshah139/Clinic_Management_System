import { BadRequestException } from '@nestjs/common';

export type IssueKind = 'bug' | 'idea' | 'question';
export type ImageExtension = 'png' | 'jpg' | 'webp';

export interface Screenshot {
  bytes: Buffer;
  extension: ImageExtension;
}

export interface RequestDiagnostic {
  timestamp: string;
  requestId: string;
  resource: string;
  method: string;
  status: number;
  code: string;
  durationMs: number;
}

export interface ClientError {
  at: string;
  message: string;
  stack?: string;
}

export interface IssueReportContext {
  page: string;
  appVersion?: string;
  userAgent: string;
  viewport: string;
  timezone: string;
  occurredAt: string;
  recentRequests: RequestDiagnostic[];
  recentErrors: ClientError[];
}

export interface IssueReport {
  kind: IssueKind;
  title: string;
  description: string;
  context?: IssueReportContext;
  screenshots: Screenshot[];
}

export interface Reporter {
  id: string;
  role: string;
  branchId: string;
}

export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const MAX_SCREENSHOTS = 5;
const MAX_CONTEXT_BYTES = 20 * 1024;
const TITLE_MIN = 3;
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 5000;
const MAX_RECENT_REQUESTS = 10;
const MAX_RECENT_ERRORS = 5;

const KINDS: readonly IssueKind[] = ['bug', 'idea', 'question'];

const IMAGE_SIGNATURES: ReadonlyArray<{ extension: ImageExtension; matches: (b: Buffer) => boolean }> = [
  { extension: 'png', matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { extension: 'jpg', matches: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  {
    extension: 'webp',
    matches: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

const fail = (message: string): never => {
  throw new BadRequestException(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireString = (source: Record<string, unknown>, key: string, label: string): string => {
  const value = source[key];
  return typeof value === 'string' ? value : fail(`${label} is missing or isn't text.`);
};

const requireNumber = (source: Record<string, unknown>, key: string, label: string): number => {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fail(`${label} isn't a number.`);
};

const isValidTimezone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

const parseRequest = (raw: unknown): RequestDiagnostic => {
  const row = isRecord(raw) ? raw : fail('Technical details contain a malformed recent request.');
  const label = 'A recent request in the technical details';
  return {
    timestamp: requireString(row, 'timestamp', label),
    requestId: requireString(row, 'requestId', label),
    resource: requireString(row, 'resource', label),
    method: requireString(row, 'method', label),
    status: requireNumber(row, 'status', label),
    code: requireString(row, 'code', label),
    durationMs: requireNumber(row, 'durationMs', label),
  };
};

const parseClientError = (raw: unknown): ClientError => {
  const row = isRecord(raw) ? raw : fail('Technical details contain a malformed recent error.');
  const label = 'A recent error in the technical details';
  const stack = row.stack;
  if (stack !== undefined && typeof stack !== 'string') fail(`${label} has a stack that isn't text.`);
  return {
    at: requireString(row, 'at', label),
    message: requireString(row, 'message', label),
    ...(typeof stack === 'string' ? { stack } : {}),
  };
};

const parseList = <T>(raw: unknown, label: string, max: number, parseItem: (item: unknown) => T): T[] =>
  Array.isArray(raw) ? raw.slice(0, max).map(parseItem) : fail(`${label} should be a list.`);

const parseContext = (raw: string): IssueReportContext => {
  if (Buffer.byteLength(raw) > MAX_CONTEXT_BYTES) fail('Technical details are too large (20 KB at most).');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("Technical details aren't valid JSON.");
  }
  const source = isRecord(json) ? json : fail('Technical details should be an object.');
  const label = 'Technical details';
  const timezone = requireString(source, 'timezone', `${label}: timezone`);
  if (!isValidTimezone(timezone)) fail(`Technical details: "${timezone}" isn't a known timezone.`);
  const occurredAt = requireString(source, 'occurredAt', `${label}: occurredAt`);
  if (Number.isNaN(Date.parse(occurredAt))) fail("Technical details: occurredAt isn't a valid date.");
  const appVersion = source.appVersion;
  if (appVersion !== undefined && typeof appVersion !== 'string') fail("Technical details: appVersion isn't text.");
  return {
    page: requireString(source, 'page', `${label}: page`),
    ...(typeof appVersion === 'string' ? { appVersion } : {}),
    userAgent: requireString(source, 'userAgent', `${label}: userAgent`),
    viewport: requireString(source, 'viewport', `${label}: viewport`),
    timezone,
    occurredAt,
    recentRequests: parseList(source.recentRequests, `${label}: recentRequests`, MAX_RECENT_REQUESTS, parseRequest),
    recentErrors: parseList(source.recentErrors, `${label}: recentErrors`, MAX_RECENT_ERRORS, parseClientError),
  };
};

export const detectImageExtension = (bytes: Buffer): ImageExtension | undefined =>
  IMAGE_SIGNATURES.find((signature) => signature.matches(bytes))?.extension;

const parseScreenshot = (file: Express.Multer.File, index: number): Screenshot => {
  const name = `Screenshot ${index + 1}`;
  if (file.size === 0) fail(`${name} is empty.`);
  if (file.size > MAX_SCREENSHOT_BYTES) fail(`${name} is larger than 5 MB.`);
  const extension = detectImageExtension(file.buffer);
  if (!extension) fail(`${name} isn't a PNG, JPEG or WebP image.`);
  return { bytes: file.buffer, extension: extension as ImageExtension };
};

export function parseIssueReport(
  fields: Record<string, unknown>,
  files: readonly Express.Multer.File[],
): IssueReport {
  const kind = KINDS.find((candidate) => candidate === fields.kind) ?? fail('Pick bug, idea or question as the kind.');
  const rawTitle = typeof fields.title === 'string' ? fields.title.trim() : '';
  if (rawTitle.length < TITLE_MIN || rawTitle.length > TITLE_MAX) {
    fail(`The title needs ${TITLE_MIN} to ${TITLE_MAX} characters.`);
  }
  const rawDescription = fields.description ?? '';
  if (typeof rawDescription !== 'string') fail("The description isn't text.");
  const description = (rawDescription as string).trim();
  if (description.length > DESCRIPTION_MAX) fail(`The description can be at most ${DESCRIPTION_MAX} characters.`);
  if (files.length > MAX_SCREENSHOTS) fail(`Attach at most ${MAX_SCREENSHOTS} screenshots.`);
  const context =
    fields.context === undefined || fields.context === ''
      ? undefined
      : parseContext(typeof fields.context === 'string' ? fields.context : fail("Technical details aren't text."));
  return {
    kind: kind as IssueKind,
    title: rawTitle,
    description,
    ...(context ? { context } : {}),
    screenshots: files.map(parseScreenshot),
  };
}
