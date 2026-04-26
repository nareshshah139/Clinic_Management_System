export interface ParsedWhatsAppSettings {
  autoConfirm: boolean;
  useTemplate: boolean;
  templateName: string;
  templateLanguage: string;
  phoneNumberId: string;
}

export interface WhatsAppTemplateOption {
  value: string;
  name: string;
  language: string;
  label: string;
}

export function parseMetadataObject(metadata: unknown): Record<string, any> {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, any>;
  }

  if (typeof metadata === 'string' && metadata.trim()) {
    try {
      const parsed = JSON.parse(metadata);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    } catch {}
  }

  return {};
}

export function parseWhatsAppSettings(metadata: unknown): ParsedWhatsAppSettings {
  const parsed = parseMetadataObject(metadata);

  return {
    autoConfirm: Boolean(parsed.whatsappAutoConfirmAppointments),
    useTemplate: Boolean(parsed.whatsappUseTemplate),
    templateName: typeof parsed.whatsappTemplateName === 'string' ? parsed.whatsappTemplateName.trim() : '',
    templateLanguage:
      typeof parsed.whatsappTemplateLanguage === 'string' && parsed.whatsappTemplateLanguage.trim()
        ? parsed.whatsappTemplateLanguage.trim()
        : 'en',
    phoneNumberId: typeof parsed.whatsappPhoneNumberId === 'string' ? parsed.whatsappPhoneNumberId.trim() : '',
  };
}

export function buildTemplateSelectionValue(name?: string | null, language?: string | null): string {
  const safeName = typeof name === 'string' ? name.trim() : '';
  if (!safeName) return '';

  const safeLanguage = typeof language === 'string' && language.trim() ? language.trim() : 'en';
  return `${safeName}::${safeLanguage}`;
}

export function parseTemplateSelectionValue(value: string): { templateName: string; templateLanguage: string } {
  const [rawName, rawLanguage] = value.split('::');
  return {
    templateName: (rawName || '').trim(),
    templateLanguage: (rawLanguage || 'en').trim() || 'en',
  };
}

export function getSelectableWhatsAppTemplates(rawTemplates: unknown): WhatsAppTemplateOption[] {
  if (!Array.isArray(rawTemplates)) return [];

  const seen = new Set<string>();
  const options: WhatsAppTemplateOption[] = [];

  rawTemplates.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const template = entry as Record<string, any>;
    const name = typeof template.name === 'string' ? template.name.trim() : '';
    if (!name || template.isActive === false) return;

    const language =
      typeof template.language === 'string' && template.language.trim()
        ? template.language.trim()
        : 'en';
    const value = buildTemplateSelectionValue(name, language);
    if (!value || seen.has(value)) return;

    seen.add(value);
    options.push({
      value,
      name,
      language,
      label: language === 'en' ? name : `${name} (${language})`,
    });
  });

  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function validateWhatsAppTemplateChoice(input: {
  useTemplate: boolean;
  templateName: string;
  templateLanguage: string;
}): string | null {
  if (!input.useTemplate) return null;

  if (!input.templateName.trim()) {
    return 'Choose a WhatsApp template or turn template mode off.';
  }

  if (!/^[a-z]{2}(?:[_-][A-Za-z]{2,5})?$/.test(input.templateLanguage.trim())) {
    return 'Use a valid WhatsApp language code, such as en, en_US, or hi.';
  }

  return null;
}
