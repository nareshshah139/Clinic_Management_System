import {
  buildTemplateSelectionValue,
  getSelectableWhatsAppTemplates,
  parseTemplateSelectionValue,
  parseWhatsAppSettings,
  validateWhatsAppTemplateChoice,
} from '@/lib/whatsapp-settings';

describe('whatsapp settings helpers', () => {
  it('parses settings from string metadata safely', () => {
    const settings = parseWhatsAppSettings(
      JSON.stringify({
        whatsappAutoConfirmAppointments: true,
        whatsappUseTemplate: true,
        whatsappTemplateName: 'appointment_confirm',
        whatsappTemplateLanguage: 'en_US',
        whatsappPhoneNumberId: '12345',
      }),
    );

    expect(settings).toEqual({
      autoConfirm: true,
      useTemplate: true,
      templateName: 'appointment_confirm',
      templateLanguage: 'en_US',
      phoneNumberId: '12345',
    });
  });

  it('builds unique selectable template options', () => {
    const templates = getSelectableWhatsAppTemplates([
      { name: 'appointment_confirm', language: 'en', isActive: true },
      { name: 'appointment_confirm', language: 'en', isActive: true },
      { name: 'appointment_confirm', language: 'hi', isActive: true },
      { name: 'inactive_template', language: 'en', isActive: false },
    ]);

    expect(templates.map((template) => template.label)).toEqual([
      'appointment_confirm',
      'appointment_confirm (hi)',
    ]);
  });

  it('round-trips template selection values', () => {
    const value = buildTemplateSelectionValue('appointment_confirm', 'en_US');
    expect(parseTemplateSelectionValue(value)).toEqual({
      templateName: 'appointment_confirm',
      templateLanguage: 'en_US',
    });
  });

  it('validates required template fields only when template mode is on', () => {
    expect(validateWhatsAppTemplateChoice({
      useTemplate: true,
      templateName: '',
      templateLanguage: 'en',
    })).toBe('Choose a WhatsApp template or turn template mode off.');

    expect(validateWhatsAppTemplateChoice({
      useTemplate: false,
      templateName: '',
      templateLanguage: '',
    })).toBeNull();
  });
});
