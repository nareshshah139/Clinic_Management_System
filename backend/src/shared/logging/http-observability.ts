import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { getMetadataStorage, ValidationError } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS = new Set([
  'GET',
  'HEAD',
  'POST',
  'PATCH',
  'PUT',
  'DELETE',
  'OPTIONS',
]);
type Level = 'info' | 'warn' | 'error';
type Failure =
  | 'invalid_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'timeout'
  | 'rate_limited'
  | 'payload_too_large'
  | 'server_error'
  | 'request_rejected';
const PARSER_ERROR_STATUSES = {
  'entity.too.large': 413,
  'entity.parse.failed': 400,
  'entity.verify.failed': 403,
  'encoding.unsupported': 415,
  'charset.unsupported': 415,
  'parameters.too.many': 413,
  'request.aborted': 400,
  'request.size.invalid': 400,
  'stream.encoding.set': 500,
  'stream.not.readable': 500,
} as const;
interface ParserDiagnostic {
  parserErrorType?: keyof typeof PARSER_ERROR_STATUSES;
  bodyLimitBytes?: number;
  bodyDeclaredBytes?: number;
  bodyReceivedBytes?: number;
}
interface RequestDiagnostic extends ParserDiagnostic {
  requestId: string;
  errorCode?: Failure;
  databaseCode?: string;
  validation?: Array<{ field: string; rules: string[] }>;
  routeCandidate?: string;
}
const diagnostics = new WeakMap<Request, RequestDiagnostic>();
const validationDiagnostics = new WeakMap<
  object,
  NonNullable<RequestDiagnostic['validation']>
>();
export type LogSink = (line: string) => void;

/**
 * @cc [owner:nareshshah139,label:security] parser-diagnostic-allowlist
 * Parser metadata MUST contain only an allowlisted type with its matching status and
 * nonnegative safe integer byte counts. Unknown types and invalid counts are omitted.
 * Counts describe the parser stream, which may be decompressed, rather than wire bytes.
 */
function parserDiagnostic(
  exception: unknown,
  status: number,
): ParserDiagnostic {
  try {
    if (!(exception instanceof Error)) return {};
    const properties = Object.getOwnPropertyDescriptors(exception);
    const type = properties.type?.value;
    if (
      typeof type !== 'string' ||
      !Object.prototype.hasOwnProperty.call(PARSER_ERROR_STATUSES, type) ||
      PARSER_ERROR_STATUSES[type as keyof typeof PARSER_ERROR_STATUSES] !==
        status
    )
      return {};
    const result: ParserDiagnostic = {
      parserErrorType: type as keyof typeof PARSER_ERROR_STATUSES,
    };
    const byteFields = {
      limit: 'bodyLimitBytes',
      length: 'bodyDeclaredBytes',
      received: 'bodyReceivedBytes',
    } as const;
    for (const [source, target] of Object.entries(byteFields)) {
      const value = properties[source]?.value;
      if (
        typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= 0
      )
        result[target] = value;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * @cc [owner:nareshshah139,label:security] pre-routing-template-candidate
 * Pre-routing attribution MUST emit only a server-registered root route template whose
 * method and pure Express matcher accept the request. It is a candidate, not proof of
 * handler execution. Unsupported route shapes, mounted routers and matcher errors
 * MUST yield no candidate; routing state, captured parameters and URLs MUST NOT be retained.
 */
function registeredRouteCandidate(
  app: INestApplication,
  req: Request,
): string | undefined {
  try {
    if (!METHODS.has(req.method)) return;
    const stack: unknown = app.getHttpAdapter().getInstance()?.router?.stack;
    if (!Array.isArray(stack)) return;
    for (const layer of stack) {
      if (!layer || typeof layer !== 'object') return;
      if (!layer.route) {
        if (Array.isArray(layer.handle?.stack)) return;
        continue;
      }
      const route = layer.route;
      if (!route.methods || typeof route.methods !== 'object') return;
      const method = req.method.toLowerCase();
      const accepted =
        route.methods._all === true ||
        route.methods[method] === true ||
        (method === 'head' &&
          !route.methods.head &&
          route.methods.get === true);
      if (!accepted) continue;
      if (
        typeof route.path !== 'string' ||
        !route.path.startsWith('/') ||
        !Array.isArray(layer.matchers) ||
        layer.matchers.length !== 1 ||
        typeof layer.matchers[0] !== 'function'
      )
        return;
      if (layer.matchers[0](req.path)) return route.path;
    }
  } catch {
    return;
  }
}

/**
 * @cc [owner:nareshshah139,label:security] validation-log-metadata
 * Validation diagnostics MUST include only fields declared in DTO validator metadata and
 * validator rule names, capped at 20 fields and eight nesting levels. Rejected values and
 * validator messages MUST NOT enter logs; normal client validation messages remain unchanged.
 */
export function diagnosticValidationPipe(): ValidationPipe {
  const defaultFactory = new ValidationPipe().createExceptionFactory();
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    exceptionFactory: (errors) => {
      const exception = defaultFactory(errors) as object;
      const fields: NonNullable<RequestDiagnostic['validation']> = [];
      const walk = (items: ValidationError[], prefix = '', depth = 0) => {
        if (depth >= 8) return;
        for (const error of items) {
          if (fields.length >= 20) break;
          const declared =
            error.target &&
            getMetadataStorage()
              .getTargetValidationMetadatas(
                error.target.constructor,
                '',
                false,
                false,
              )
              .some((metadata) => metadata.propertyName === error.property);
          const arrayIndex =
            Array.isArray(error.target) && /^\d+$/.test(error.property);
          if (!declared && !arrayIndex) continue;
          const field = arrayIndex
            ? `${prefix}[]`
            : `${prefix ? prefix + '.' : ''}${error.property}`;
          const rules = Object.keys(error.constraints || {}).filter((rule) =>
            /^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(rule),
          );
          if (rules.length) fields.push({ field, rules: rules.slice(0, 10) });
          walk(error.children || [], field, depth + 1);
        }
      };
      walk(errors);
      validationDiagnostics.set(exception, fields);
      return exception;
    },
  });
}

/**
 * @cc [owner:nareshshah139,label:security] fixed-http-failure-category
 * Map HTTP status to a fixed failure category, using server_error for unlisted 5xx statuses
 * and request_rejected for other unlisted statuses; never derive categories from error text.
 */
export function failureCode(status: number): Failure {
  if (status === 400 || status === 422) return 'invalid_request';
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status === 413) return 'payload_too_large';
  return status >= 500 ? 'server_error' : 'request_rejected';
}

function writeEvent(
  sink: LogSink,
  event: Record<string, unknown>,
  level: Level,
) {
  const configured = process.env.HTTP_LOG_LEVEL || 'info';
  if (configured === 'error' && level !== 'error') return;
  if (configured === 'warn' && level === 'info') return;
  try {
    sink(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'clinic-backend',
        version: 1,
        level,
        ...event,
      }) + '\n',
    );
  } catch {
    // Diagnostic sinks must never turn a successful patient save into a failure.
  }
}

/**
 * @cc [owner:nareshshah139,label:security] request-log-privacy
 * Request diagnostics MUST contain only a UUID reference, method, registered route template
 * and attribution source, status, duration, attempt, declared validation fields/rules,
 * fixed error/parser codes and bounded parser byte counts; never bodies, URL parameters, headers,
 * credentials, patient identifiers, exception messages or stacks. Sink errors MUST NOT affect requests.
 */
/**
 * @cc [owner:nareshshah139,label:observability] request-outcome
 * Every request receives an X-Request-Id before routing. Completion and premature close
 * produce at most one terminal event; aborted responses MUST NOT be reported as successful saves.
 */
export function requestDiagnostics(
  sink: LogSink = (line) => {
    process.stdout.write(line);
  },
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const candidate = req.headers['x-request-id'];
    const requestId =
      typeof candidate === 'string' && UUID.test(candidate)
        ? candidate
        : randomUUID();
    const diagnostic: RequestDiagnostic = { requestId };
    diagnostics.set(req, diagnostic);
    res.setHeader('X-Request-Id', requestId);
    const start = performance.now();
    const method = METHODS.has(req.method) ? req.method : 'OTHER';
    const rawAttempt = Number(req.headers['x-request-attempt']);
    const attempt =
      Number.isInteger(rawAttempt) && rawAttempt >= 1 && rawAttempt <= 3
        ? rawAttempt
        : 1;
    let ended = false;
    const finish = (aborted: boolean) => {
      if (ended) return;
      ended = true;
      const durationMs = Math.round(performance.now() - start);
      const status = aborted ? null : res.statusCode;
      const level: Level =
        status !== null && status >= 500
          ? 'error'
          : aborted || (status !== null && status >= 400) || durationMs >= 2000
            ? 'warn'
            : 'info';
      writeEvent(
        sink,
        {
          event: aborted ? 'http.request_aborted' : 'http.request_completed',
          requestId,
          method,
          // Express assigns this from application route declarations, not the incoming URL.
          route:
            typeof req.route?.path === 'string'
              ? req.route.path
              : diagnostic.routeCandidate || 'unmatched',
          ...(typeof req.route?.path !== 'string' && diagnostic.routeCandidate
            ? { routeSource: 'registered_template' }
            : {}),
          status,
          durationMs,
          attempt,
          outcome: aborted
            ? 'unknown'
            : status! >= 400
              ? 'failed'
              : 'succeeded',
          ...(diagnostic.errorCode || (status !== null && status >= 400)
            ? {
                errorCode: diagnostic.errorCode || failureCode(status!),
              }
            : {}),
          ...(diagnostic.databaseCode
            ? { databaseCode: diagnostic.databaseCode }
            : {}),
          ...(diagnostic.validation?.length
            ? { validation: diagnostic.validation }
            : {}),
          ...(diagnostic.parserErrorType
            ? {
                parserErrorType: diagnostic.parserErrorType,
                bodyLimitBytes: diagnostic.bodyLimitBytes,
                bodyDeclaredBytes: diagnostic.bodyDeclaredBytes,
                bodyReceivedBytes: diagnostic.bodyReceivedBytes,
              }
            : {}),
        },
        level,
      );
    };
    res.once('finish', () => finish(false));
    res.once('close', () => finish(!res.writableFinished));
    next();
  };
}

/**
 * @cc [owner:nareshshah139,label:security] safe-error-response
 * HTTP exception status and public response fields MUST be preserved with a request reference.
 * Parser error statuses are preserved with a generic message and allowlisted metadata.
 * Oversized body-parser errors MUST return payload_too_large and a fixed actionable message;
 * no limit is raised and rejected requests MUST NOT reach handlers. Other unexpected exceptions return
 * a generic 500. Raw database messages and stacks MUST NOT be logged
 * or returned. Only syntactically valid Prisma error codes may enter the diagnostic record.
 */
@Catch()
export class DiagnosticExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly routeCandidate?: (req: Request) => string | undefined,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const diagnostic: RequestDiagnostic = diagnostics.get(req) || {
      requestId: randomUUID(),
    };
    diagnostics.set(req, diagnostic);
    // Express body-parser errors use status/statusCode rather than HttpException.
    const parserStatus =
      (exception as { statusCode?: unknown; status?: unknown })?.statusCode ??
      (exception as { status?: unknown })?.status;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : exception instanceof Error &&
            typeof parserStatus === 'number' &&
            Number.isInteger(parserStatus) &&
            parserStatus >= 400 &&
            parserStatus <= 599
          ? parserStatus
          : 500;
    diagnostic.errorCode = failureCode(status);
    Object.assign(diagnostic, parserDiagnostic(exception, status));
    if (typeof req.route?.path !== 'string')
      diagnostic.routeCandidate = this.routeCandidate?.(req);
    const code = (exception as { code?: unknown })?.code;
    if (typeof code === 'string' && /^P\d{4}$/.test(code))
      diagnostic.databaseCode = code;
    if (exception && typeof exception === 'object')
      diagnostic.validation = validationDiagnostics.get(exception);
    if (res.headersSent) return;
    res.setHeader('X-Request-Id', diagnostic.requestId);
    const original =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode: status,
            message:
              status === 413
                ? 'Request body is too large. Reduce the request size and try again.'
                : status >= 500
                  ? 'Internal server error'
                  : 'Request rejected',
          };
    res.status(status).json({
      ...(typeof original === 'string'
        ? { statusCode: status, message: original }
        : original),
      requestId: diagnostic.requestId,
      errorCode: diagnostic.errorCode,
    });
  }
}

/**
 * @cc [owner:nareshshah139,label:observability] early-http-diagnostics
 * Install diagnostics before routing and body parsing so validation and guard rejections
 * receive the same request reference and terminal logging as successful handlers.
 */
export function installHttpObservability(
  app: INestApplication,
  sink?: LogSink,
) {
  app.use(requestDiagnostics(sink));
  app.useGlobalFilters(
    new DiagnosticExceptionFilter((req) => registeredRouteCandidate(app, req)),
  );
}
