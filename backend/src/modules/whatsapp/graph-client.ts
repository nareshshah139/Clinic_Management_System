import { Injectable, Logger } from '@nestjs/common';
import { parseSendHealth } from './send-health';
import type {
  DocumentTemplate,
  PhoneNumberProfile,
  TemplateMessage,
  WhatsAppSender,
} from './whatsapp.types';

export const GRAPH_API_VERSION = 'v21.0';

export type GraphFailure = { ok: false; code?: number; reason: string };
export type GraphResult<T> = { ok: true; value: T } | GraphFailure;

/** Meta error codes a clinic can act on, in the clinic's words. Anything else keeps Meta's own message. */
const META_REASONS: Record<number, string> = {
  190: 'The WhatsApp access token is invalid or has expired. Create a new permanent token in Meta Business Manager and link WhatsApp again.',
  131047:
    'This patient has not messaged the clinic in the last 24 hours, so WhatsApp needs an approved template. Choose a prescription template in Clinic profile.',
  131026: 'This number is not on WhatsApp or cannot receive messages.',
  131030:
    "This number is not in the allowed list of the Meta test number. Add it under WhatsApp > API Setup in Meta, or link the clinic's live number.",
  132001:
    'The chosen template does not exist in that language. Pick the template again in Clinic profile.',
  131031:
    'Meta has locked this WhatsApp Business Account, so it cannot send messages. Resolve the account issues in Meta Business Suite; Clinic profile lists what Meta reports.',
  141006:
    'The WhatsApp Business Account has a payment method problem, which blocks messages the clinic starts. Add a valid payment method in Meta Business Suite.',
  141010:
    'The business behind this WhatsApp number has not passed Meta business verification. Complete the verification in Meta Business Suite.',
  131000:
    'The WhatsApp business profile is incomplete. Add the legal name, country and website in Meta Business Suite.',
};

export const metaReasonFor = (code: number | null): string | undefined =>
  code === null ? undefined : META_REASONS[code];

type MetaError = {
  code?: unknown;
  message?: unknown;
  error_data?: { details?: unknown };
};

export function metaFailure(httpStatus: number, body: unknown): GraphFailure {
  const error = (body as { error?: MetaError } | null)?.error;
  const code = typeof error?.code === 'number' ? error.code : undefined;
  const message =
    typeof error?.message === 'string' ? error.message : undefined;
  const details =
    typeof error?.error_data?.details === 'string'
      ? error.error_data.details
      : undefined;
  if (code !== undefined && META_REASONS[code])
    return { ok: false, code, reason: META_REASONS[code] };
  if (code === 100)
    return {
      ok: false,
      code,
      reason: `Meta rejected a value in the request: ${details || message || 'invalid parameter'}.`,
    };
  return {
    ok: false,
    code,
    reason: message || `WhatsApp returned HTTP ${httpStatus}.`,
  };
}

type RawTemplate = {
  name?: unknown;
  language?: unknown;
  status?: unknown;
  components?: { type?: unknown; format?: unknown; text?: unknown }[];
};

function documentTemplate(raw: RawTemplate): DocumentTemplate | null {
  const components = Array.isArray(raw.components) ? raw.components : [];
  const header = components.find((c) => c.type === 'HEADER');
  if (raw.status !== 'APPROVED' || header?.format !== 'DOCUMENT') return null;
  if (typeof raw.name !== 'string' || typeof raw.language !== 'string')
    return null;
  const body = components.find((c) => c.type === 'BODY');
  const placeholders =
    typeof body?.text === 'string'
      ? (body.text.match(/\{\{\s*\d+\s*\}\}/g) ?? [])
      : [];
  return {
    name: raw.name,
    language: raw.language,
    bodyParams: new Set(placeholders.map((p) => p.replace(/\D/g, ''))).size,
  };
}

/**
 * @cc [owner:nareshshah139,label:security] whatsapp-graph-boundary
 * This client MUST be the only code that calls the WhatsApp Cloud API. Every call MUST resolve to
 * a value or a failure carrying a reason a clinic can act on; it MUST NOT throw for HTTP or network
 * errors. 5xx, 429 and network errors MUST be retried once; other failures MUST NOT be retried.
 */
@Injectable()
export class WhatsAppGraphClient {
  private readonly logger = new Logger(WhatsAppGraphClient.name);

  private get base() {
    return `${(process.env.WHATSAPP_GRAPH_BASE_URL || 'https://graph.facebook.com').replace(/\/+$/, '')}/${GRAPH_API_VERSION}`;
  }

  getPhoneNumber(
    token: string,
    phoneNumberId: string,
  ): Promise<GraphResult<PhoneNumberProfile>> {
    const fields =
      'display_phone_number,verified_name,quality_rating,health_status';
    return this.call(
      `/${encodeURIComponent(phoneNumberId)}?fields=${fields}`,
      token,
      { method: 'GET' },
      (json) => ({
        displayPhoneNumber: String(json.display_phone_number ?? ''),
        verifiedName: String(json.verified_name ?? ''),
        qualityRating:
          typeof json.quality_rating === 'string' ? json.quality_rating : null,
        health: parseSendHealth(json.health_status),
      }),
    );
  }

  listDocumentTemplates(
    token: string,
    businessAccountId: string,
  ): Promise<GraphResult<DocumentTemplate[]>> {
    const path = `/${encodeURIComponent(businessAccountId)}/message_templates?fields=name,language,status,components&limit=250`;
    return this.call(path, token, { method: 'GET' }, (json) =>
      (Array.isArray(json.data) ? (json.data as RawTemplate[]) : [])
        .map(documentTemplate)
        .filter((t): t is DocumentTemplate => t !== null),
    );
  }

  uploadPdf(
    sender: WhatsAppSender,
    pdf: Buffer,
    fileName: string,
  ): Promise<GraphResult<string>> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'application/pdf');
    form.append(
      'file',
      new Blob([Uint8Array.from(pdf)], { type: 'application/pdf' }),
      fileName,
    );
    return this.call(
      `/${encodeURIComponent(sender.phoneNumberId)}/media`,
      sender.token,
      { method: 'POST', body: form },
      (json) => (typeof json.id === 'string' ? json.id : null),
    );
  }

  sendDocument(
    sender: WhatsAppSender,
    to: string,
    document: { mediaId: string; fileName: string; caption?: string },
  ) {
    return this.message(sender, to, {
      type: 'document',
      document: {
        id: document.mediaId,
        filename: document.fileName,
        ...(document.caption ? { caption: document.caption } : {}),
      },
    });
  }

  sendTemplateWithDocument(
    sender: WhatsAppSender,
    to: string,
    template: {
      name: string;
      language: string;
      mediaId: string;
      fileName: string;
      bodyParams: string[];
    },
  ) {
    return this.sendTemplate(sender, to, {
      name: template.name,
      language: template.language,
      components: [
        {
          type: 'header',
          parameters: [
            {
              type: 'document',
              document: { id: template.mediaId, filename: template.fileName },
            },
          ],
        },
        ...(template.bodyParams.length
          ? [
              {
                type: 'body' as const,
                parameters: template.bodyParams.map((text) => ({
                  type: 'text' as const,
                  text,
                })),
              },
            ]
          : []),
      ],
    });
  }

  sendText(sender: WhatsAppSender, to: string, text: string) {
    return this.message(sender, to, { type: 'text', text: { body: text } });
  }

  sendTemplate(sender: WhatsAppSender, to: string, template: TemplateMessage) {
    return this.message(sender, to, {
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        components: template.components ?? [],
      },
    });
  }

  private message(
    sender: WhatsAppSender,
    to: string,
    content: Record<string, unknown>,
  ): Promise<GraphResult<string>> {
    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      ...content,
    });
    return this.call(
      `/${encodeURIComponent(sender.phoneNumberId)}/messages`,
      sender.token,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      (json) => {
        const id = (json.messages as { id?: unknown }[] | undefined)?.[0]?.id;
        return typeof id === 'string' ? id : null;
      },
    );
  }

  private async call<T>(
    path: string,
    token: string,
    init: {
      method: string;
      headers?: Record<string, string>;
      body?: string | FormData;
    },
    parse: (json: Record<string, unknown>) => T | null,
  ): Promise<GraphResult<T>> {
    const request = {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    };
    for (let attempt = 1; ; attempt++) {
      const last = attempt >= 2;
      let res: Response;
      try {
        res = await fetch(`${this.base}${path}`, request);
      } catch (error) {
        this.logger.warn(
          `WhatsApp ${init.method} ${path.split('?')[0]} network error, attempt ${attempt}`,
        );
        if (last)
          return {
            ok: false,
            reason: `Could not reach WhatsApp: ${(error as Error)?.message ?? 'network error'}.`,
          };
        continue;
      }
      const json = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (res.ok) {
        const value = json ? parse(json) : null;
        return value === null
          ? {
              ok: false,
              reason: 'WhatsApp answered without the expected result.',
            }
          : { ok: true, value };
      }
      if (!last && (res.status >= 500 || res.status === 429)) continue;
      const failure = metaFailure(res.status, json);
      this.logger.warn(
        `WhatsApp ${init.method} ${path.split('?')[0]} failed: HTTP ${res.status} code ${failure.code ?? 'none'}`,
      );
      return failure;
    }
  }
}
