import { AppointmentsService } from './appointments.service';
import { VisitType } from '@prisma/client';

describe('AppointmentsService WhatsApp flow', () => {
  const patientRecord = { id: 'patient-1', name: 'Alice Patient', phone: '9999999999', email: undefined };
  const doctorRecord = { id: 'doctor-1', firstName: 'John', lastName: 'Doe', email: 'doc@example.com' };

  const baseDto = {
    patientId: patientRecord.id,
    doctorId: doctorRecord.id,
    date: '2099-01-01',
    slot: '10:00-10:30',
    visitType: VisitType.OPD,
    notes: undefined,
    roomId: undefined,
    source: undefined,
  };

  const makePrisma = () => {
    const txAppointment = {
      findFirst: jest.fn().mockResolvedValue({ tokenNumber: 0 }),
      create: jest.fn().mockImplementation(async ({ data }) => ({
        ...data,
        id: 'appt-1',
        patient: patientRecord,
        doctor: doctorRecord,
        room: null,
      })),
    };

    const prisma: any = {
      patient: { findFirst: jest.fn().mockResolvedValue(patientRecord) },
      user: {
        findFirst: jest.fn().mockResolvedValue(doctorRecord),
        findUnique: jest.fn().mockResolvedValue({
          metadata: JSON.stringify({
            whatsappAutoConfirmAppointments: true,
            whatsappUseTemplate: true,
            whatsappTemplateName: 'appt_template',
            whatsappTemplateLanguage: 'en',
          }),
        }),
      },
      room: { findFirst: jest.fn() },
      appointment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) =>
        cb({
          appointment: txAppointment,
        }),
      ),
    };

    return { prisma, txAppointment };
  };

  const makeNotifications = () => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
    sendWhatsApp: jest.fn().mockResolvedValue(undefined),
  });

  const makeTemplates = () => ({
    resolveActiveTemplate: jest.fn(),
  });

  it('uses WhatsApp template with components when available', async () => {
    const { prisma } = makePrisma();
    const notifications = makeNotifications();
    const templates = makeTemplates();
    templates.resolveActiveTemplate.mockResolvedValue({
      name: 'appt_template',
      language: 'en',
      variables: ['patient_name', 'appointment_date'],
    });
    const dateSpy = jest.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('2099-01-01');

    const svc = new AppointmentsService(prisma as any, notifications as any, templates as any);
    await svc.create(baseDto as any, 'branch-1');

    expect(notifications.sendWhatsApp).toHaveBeenCalledTimes(1);
    const payload = notifications.sendWhatsApp.mock.calls[0][0];
    expect(payload.toPhoneE164).toBe('+9999999999');
    expect(payload.template.name).toBe('appt_template');
    expect(payload.template.components?.[0]?.parameters?.[0]?.text).toBe('Alice Patient');
    expect(payload.template.components?.[0]?.parameters?.[1]?.text).toBe('2099-01-01');

    dateSpy.mockRestore();
  });

  it('falls back to plain text when no template is resolved', async () => {
    const { prisma } = makePrisma();
    const notifications = makeNotifications();
    const templates = makeTemplates();
    templates.resolveActiveTemplate.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      metadata: JSON.stringify({
        whatsappAutoConfirmAppointments: true,
        whatsappUseTemplate: false,
      }),
    });
    const svc = new AppointmentsService(prisma as any, notifications as any, templates as any);
    await svc.create(baseDto as any, 'branch-1');

    expect(notifications.sendWhatsApp).toHaveBeenCalledTimes(1);
    const payload = notifications.sendWhatsApp.mock.calls[0][0];
    expect(payload.text).toContain('Appointment confirmed with Dr. John Doe');
  });
});

