import { WhatsAppTemplatesService } from './whatsapp-templates.service';

describe('WhatsAppTemplatesService', () => {
  const mockNotifications = { sendWhatsApp: jest.fn() };

  const makePrisma = () => {
    const prisma: any = {
      whatsAppTemplate: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    return prisma;
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects content placeholders not declared in variables', async () => {
    const prisma = makePrisma();
    const svc = new WhatsAppTemplatesService(prisma as any, mockNotifications as any);

    await expect(
      svc.create('branch-1', null, {
        name: 'appt',
        touchpoint: 'appointment_confirmation',
        contentText: 'Hi {{patient_name}}',
        contentHtml: '<p>Hello {{patient_name}}</p>',
        variables: ['doctor_name'], // missing patient_name
      }),
    ).rejects.toThrow('Placeholder "{{patient_name}}" is not declared in variables');
  });

  it('sends test message with body components mapped to variable order', async () => {
    const prisma = makePrisma();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1',
      branchId: 'branch-1',
      ownerId: null,
      name: 'appt_template',
      language: 'en',
      contentText: 'Hi {{patient_name}}',
      contentHtml: null,
      variables: JSON.stringify(['patient_name', 'appointment_date']),
      isActive: true,
    });
    const svc = new WhatsAppTemplatesService(prisma as any, mockNotifications as any);

    await svc.sendTest({
      templateId: 'tpl-1',
      branchId: 'branch-1',
      requesterId: 'admin-1',
      isAdminOrOwner: true,
      toPhoneE164: '+18005550199',
      variables: {
        patient_name: 'Alice',
        appointment_date: '2099-01-01',
      },
    });

    expect(mockNotifications.sendWhatsApp).toHaveBeenCalledTimes(1);
    const payload = mockNotifications.sendWhatsApp.mock.calls[0][0];
    expect(payload.template.components?.[0]?.parameters?.[0]?.text).toBe('Alice');
    expect(payload.template.components?.[0]?.parameters?.[1]?.text).toBe('2099-01-01');
  });
});

