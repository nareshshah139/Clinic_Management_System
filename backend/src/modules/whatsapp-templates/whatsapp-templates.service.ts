import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  RequestTimeoutException,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

interface CreateTemplateDto {
  name: string;
  touchpoint: string;
  language?: string;
  contentHtml?: string;
  contentText: string;
  variables?: string[];
}

interface UpdateTemplateDto extends Partial<CreateTemplateDto> {
  isActive?: boolean;
}

@Injectable()
export class WhatsAppTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(branchId: string, ownerId: string | null, dto: CreateTemplateDto) {
    this.validateVariables(dto.variables, dto.contentText, dto.contentHtml);
    const tpl = await this.prisma.whatsAppTemplate.create({
      data: {
        branchId,
        ownerId: ownerId || null,
        name: dto.name,
        touchpoint: dto.touchpoint,
        language: dto.language || null,
        contentHtml: dto.contentHtml || null,
        contentText: dto.contentText,
        variables: dto.variables ? JSON.stringify(dto.variables) : null,
      },
    });
    return this.hydrate(tpl);
  }

  async findAll(branchId: string, ownerId?: string | null, touchpoint?: string) {
    const where: any = { branchId };
    if (touchpoint) where.touchpoint = touchpoint;
    // Admins can see all; doctors see their own plus branch-level (ownerId null)
    if (ownerId) {
      where.OR = [{ ownerId }, { ownerId: null }];
    }
    const list = await this.prisma.whatsAppTemplate.findMany({ where, orderBy: { updatedAt: 'desc' } });
    return list.map((r) => this.hydrate(r));
  }

  async findOne(branchId: string, id: string) {
    const tpl = await this.prisma.whatsAppTemplate.findFirst({ where: { id, branchId } });
    if (!tpl) throw new NotFoundException('Template not found');
    return this.hydrate(tpl);
  }

  async update(branchId: string, id: string, requesterId: string, isAdminOrOwner: boolean, dto: UpdateTemplateDto) {
    // Enforce ownership unless admin
    const existing = await this.prisma.whatsAppTemplate.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundException('Template not found');
    if (!isAdminOrOwner && existing.ownerId && existing.ownerId !== requesterId) {
      throw new ForbiddenException('Not allowed to edit this template');
    }

    const hydrated = this.hydrate(existing);
    const nextVariables = dto.variables ?? hydrated.variables;
    const nextContentText = dto.contentText ?? hydrated.contentText;
    const nextContentHtml = dto.contentHtml ?? hydrated.contentHtml;
    this.validateVariables(nextVariables, nextContentText, nextContentHtml);

    const updated = await this.prisma.whatsAppTemplate.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        touchpoint: dto.touchpoint ?? undefined,
        language: dto.language ?? undefined,
        contentHtml: dto.contentHtml ?? undefined,
        contentText: dto.contentText ?? undefined,
        variables: dto.variables ? JSON.stringify(dto.variables) : undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
    return this.hydrate(updated);
  }

  async remove(branchId: string, id: string, requesterId: string, isAdminOrOwner: boolean) {
    const existing = await this.prisma.whatsAppTemplate.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundException('Template not found');
    if (!isAdminOrOwner && existing.ownerId && existing.ownerId !== requesterId) {
      throw new ForbiddenException('Not allowed to delete this template');
    }
    await this.prisma.whatsAppTemplate.delete({ where: { id } });
    return { success: true };
  }

  async generate(body: {
    touchpoint: string;
    language?: string;
    variables?: string[];
    hints?: string;
    tone?: 'formal' | 'friendly' | 'concise' | 'detailed';
  }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('AI generation is not configured');
    }
    const model = process.env.OPENAI_TEMPLATE_MODEL || 'gpt-5-mini';
    const timeoutMs = Number(process.env.OPENAI_HTTP_TIMEOUT_MS || 15000);

    const variables = Array.isArray(body.variables) ? body.variables : [];
    const tone = body.tone || 'friendly';
    const language = body.language || 'en';

    const system =
      'You are a senior content designer for a healthcare software company. '
      + 'Write compliant, professional WhatsApp message templates used by doctors and clinic staff inside a clinic management system. '
      + 'Optimize for clarity, brevity, trust, and high deliverability.\n\n'
      + 'Audience: Patients (general public). Reading level: simple, friendly, respectful. '
      + 'Tone: warm, expert, non-alarmist.\n\n'
      + 'Regulatory & Safety: Do not include diagnostic details, sensitive health data, or full test results. '
      + 'Avoid promises/cures; use neutral phrasing ("may help", "as advised by your doctor"). '
      + 'Include clear opt-out instructions when applicable (e.g., "Reply STOP to opt out."). '
      + 'Respect local timing and consent norms.\n\n'
      + 'Brand & Style: Use plain language. Short sentences. No emojis. '
      + 'Include clinic name, contact, and a short signature line. '
      + 'Keep under ~600 characters. '
      + 'Personalize with variables using double curly braces like {{patient_name}}.\n\n'
      + 'Allowed variables (use only if provided): '
      + '{{patient_name}}, {{doctor_name}}, {{clinic_name}}, {{specialty}}, '
      + '{{appointment_date}}, {{appointment_time}}, {{appointment_mode}}, {{location_map_url}}, '
      + '{{payment_link}}, {{invoice_id}}, {{amount_due}}, {{due_date}}, '
      + '{{report_name}}, {{report_link}}, {{followup_date}}, {{followup_time}}, '
      + '{{reschedule_link}}, {{cancel_link}}, {{feedback_link}}, {{phone}}, '
      + '{{whatsapp_help_number}}, {{teleconsult_link}}, {{queue_token}}, '
      + '{{otp}}, {{policy_link}}, {{unsubscribe_text}}.\n\n'
      + 'Return STRICT JSON with keys contentHtml, contentText, variables (array). '
      + 'Do not include backticks or extra commentary. Keep HTML very simple (basic tags only). '
      + 'contentText must be the plain-text fallback (no HTML).';

    const user = {
      touchpoint: body.touchpoint,
      language,
      tone,
      variables,
      hints: body.hints || '',
      style: {
        emojis: false,
        maxChars: 900,
      },
    } as any;

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(user) },
    ];

    // Use higher creativity: set temperature to 1 for template generation
    const temperature = 1;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let resp: Response;
    try {
      resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature,
          response_format: { type: 'json_object' },
          messages,
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new RequestTimeoutException('Template generation timed out. Please try again.');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI error: ${resp.status} ${errText}`);
    }
    const data = (await resp.json()) as any;
    const content = data?.choices?.[0]?.message?.content || '';
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('Failed to parse generation response');
    }

    const contentHtml = typeof parsed?.contentHtml === 'string' ? parsed.contentHtml : '';
    const contentText = typeof parsed?.contentText === 'string' ? parsed.contentText : '';
    const outVars = Array.isArray(parsed?.variables) ? parsed.variables.filter((v: any) => typeof v === 'string') : variables;

    return { contentHtml, contentText, variables: outVars };
  }

  async sendTest(params: {
    templateId: string;
    branchId: string;
    requesterId: string;
    isAdminOrOwner: boolean;
    toPhoneE164: string;
    variables?: Record<string, string>;
  }) {
    const { templateId, branchId, requesterId, isAdminOrOwner, toPhoneE164, variables } = params;
    const tpl = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, branchId },
    });
    if (!tpl) throw new NotFoundException('Template not found');
    if (!isAdminOrOwner && tpl.ownerId && tpl.ownerId !== requesterId) {
      throw new ForbiddenException('Not allowed to send test for this template');
    }
    const hydrated = this.hydrate(tpl);
    const components = this.buildTemplateComponents(hydrated.variables, variables || {});
    await this.notifications.sendWhatsApp({
      toPhoneE164,
      template: {
        name: hydrated.name,
        language: hydrated.language || 'en',
        components,
      },
    });
    return { success: true };
  }

  async resolveActiveTemplate(params: {
    branchId: string;
    touchpoint: string;
    language?: string;
    ownerId?: string | null;
    name?: string;
  }) {
    const { branchId, touchpoint, language, ownerId, name } = params;
    const where: any = { branchId, touchpoint, isActive: true };
    if (ownerId) {
      where.OR = [{ ownerId }, { ownerId: null }];
    }
    const templates = await this.prisma.whatsAppTemplate.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
    });
    if (!templates.length) return null;

    const prefer = (list: any[]) => {
      if (!list.length) return undefined;
      if (name && language) {
        const withNameLang = list.find((tpl) => tpl.name === name && tpl.language === language);
        if (withNameLang) return withNameLang;
      }
      if (name) {
        const withName = list.find((tpl) => tpl.name === name);
        if (withName) return withName;
      }
      if (language) {
        const withLang = list.find((tpl) => tpl.language === language);
        if (withLang) return withLang;
      }
      if (language) {
        const withoutLang = list.find((tpl) => !tpl.language);
        if (withoutLang) return withoutLang;
      }
      return list[0];
    };

    const ownerTemplates = ownerId ? templates.filter((tpl) => tpl.ownerId === ownerId) : [];
    const branchTemplates = templates.filter((tpl) => tpl.ownerId === null);

    const chosen =
      prefer(ownerTemplates) ||
      prefer(branchTemplates) ||
      templates[0];

    return chosen ? this.hydrate(chosen) : null;
  }

  private buildTemplateComponents(variableKeys: string[], values: Record<string, string>) {
    if (!Array.isArray(variableKeys) || variableKeys.length === 0) return undefined;
    const parameters = variableKeys.map((key) => ({
      type: 'text' as const,
      text: values[key] ?? '',
    }));
    return [{ type: 'body' as const, parameters }];
  }

  private validateVariables(vars: string[] | undefined, contentText?: string | null, contentHtml?: string | null) {
    if (!vars && !contentText && !contentHtml) return;
    const list = Array.isArray(vars)
      ? Array.from(new Set(vars.filter((v) => typeof v === 'string' && v.trim() !== '').map((v) => v.trim())))
      : [];

    const placeholders = new Set<string>();
    const capture = (source?: string | null) => {
      if (!source) return;
      const regex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(source)) !== null) {
        placeholders.add(match[1]);
      }
    };
    capture(contentText || undefined);
    capture(contentHtml || undefined);

    if (placeholders.size > 0 && list.length === 0) {
      throw new BadRequestException(
        `Template content contains placeholders ${Array.from(placeholders).join(', ')} but no variables were provided`,
      );
    }

    for (const p of placeholders) {
      if (!list.includes(p)) {
        throw new BadRequestException(
          `Placeholder "{{${p}}}" is not declared in variables. Declare it in variables or remove from content.`,
        );
      }
    }
  }

  private hydrate(row: any) {
    let parsedVars: string[] = [];
    if (row && typeof row.variables === 'string' && row.variables.trim() !== '') {
      try {
        const arr = JSON.parse(row.variables);
        parsedVars = Array.isArray(arr) ? arr.filter((v: any) => typeof v === 'string') : [];
      } catch {
        parsedVars = [];
      }
    }
    return {
      ...row,
      variables: parsedVars,
    };
  }
}


