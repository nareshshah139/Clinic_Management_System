import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async create(branchId: string, ownerId: string | null, dto: CreateTemplateDto) {
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
      throw new Error('OPENAI_API_KEY is not configured');
    }
    const model = process.env.OPENAI_TEMPLATE_MODEL || 'gpt-5-mini';

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

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
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
    });

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


