import { AppointmentsService } from './appointments.service';
import { VisitType } from '@prisma/client';

describe('AppointmentsService WhatsApp flow (PP-18: automated confirmation goes through OutboundMessage)', () => {
  const patientRecord = {
    id: 'patient-1',
    name: 'Alice Patient',
    phone: '9999999999',
    email: undefined,
  };
  const doctorRecord = {
    id: 'doctor-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'doc@example.com',
  };

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
      findMany: jest.fn().mockResolvedValue([]),
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
      branch: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ name: 'Downtown Clinic', phone: '9988776655' }),
      },
      patient: { findFirst: jest.fn().mockResolvedValue(patientRecord) },
      patientPortalProfile: {
        findUnique: jest.fn().mockResolvedValue({ phoneE164: '+919999999999', preferredLanguage: 'TE' }),
      },
      outboundMessage: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
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
      doctorWorkingHours: { findMany: jest.fn().mockResolvedValue([]) },
      doctorTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) =>
        cb({
          $executeRaw: jest.fn(),
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

  const queued = (prisma: any) => {
    expect(prisma.outboundMessage.createMany).toHaveBeenCalledTimes(1);
    return prisma.outboundMessage.createMany.mock.calls[0][0].data[0];
  };

  it('queues the doctor template with components for the patient E.164 number and never calls sendWhatsApp', async () => {
    const { prisma } = makePrisma();
    const notifications = makeNotifications();
    const templates = makeTemplates();
    templates.resolveActiveTemplate.mockResolvedValue({
      name: 'appt_template',
      language: 'en',
      variables: ['patient_name', 'appointment_date'],
    });

    const svc = new AppointmentsService(
      prisma as any,
      notifications as any,
      templates as any,
    );
    await svc.create(baseDto as any, 'branch-1');

    expect(notifications.sendWhatsApp).not.toHaveBeenCalled();
    const row = queued(prisma);
    expect(row).toMatchObject({
      dedupeKey: 'appointment-confirmation:appt-1',
      purpose: 'APPOINTMENT_CONFIRMATION',
      patientId: 'patient-1',
      toE164: '+919999999999',
      subjectType: 'APPOINTMENT',
      subjectId: 'appt-1',
    });
    const payload = { template: row.params.whatsapp };
    expect(payload.template.name).toBe('appt_template');
    expect(payload.template.components?.[0]?.parameters?.[0]?.text).toBe(
      'Alice Patient',
    );
    expect(payload.template.components?.[0]?.parameters?.[1]?.text).toBe(
      '01 Jan 2099',
    );

  });

  it('supports object metadata and fills patient and clinic template variables', async () => {
    const { prisma } = makePrisma();
    const notifications = makeNotifications();
    const templates = makeTemplates();
    templates.resolveActiveTemplate.mockResolvedValue({
      name: 'appt_template',
      language: 'en',
      variables: ['patient_phone', 'clinic_name', 'whatsapp_help_number'],
    });
    prisma.user.findUnique.mockResolvedValue({
      metadata: {
        whatsappAutoConfirmAppointments: true,
        whatsappUseTemplate: true,
        whatsappTemplateName: 'appt_template',
        whatsappTemplateLanguage: 'en',
      },
    });

    const svc = new AppointmentsService(
      prisma as any,
      notifications as any,
      templates as any,
    );
    await svc.create(baseDto as any, 'branch-1');

    const payload = { template: queued(prisma).params.whatsapp };
    expect(
      payload.template.components?.[0]?.parameters?.map(
        (param: any) => param.text,
      ),
    ).toEqual(['9999999999', 'Downtown Clinic', '9988776655']);
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
    const svc = new AppointmentsService(
      prisma as any,
      notifications as any,
      templates as any,
    );
    await svc.create(baseDto as any, 'branch-1');

    expect(notifications.sendWhatsApp).not.toHaveBeenCalled();
    const payload = queued(prisma).params.whatsapp;
    expect(payload).toMatchObject({ kind: 'text' });
    expect(payload.text).toContain('Appointment confirmed with Dr. John Doe');
  });

  it('queues nothing when the patient has no usable WhatsApp number', async () => {
    const { prisma } = makePrisma();
    prisma.patientPortalProfile.findUnique.mockResolvedValue({ phoneE164: null, preferredLanguage: 'EN' });
    const notifications = makeNotifications();
    const svc = new AppointmentsService(prisma as any, notifications as any, makeTemplates() as any);
    await svc.create(baseDto as any, 'branch-1');
    expect(prisma.outboundMessage.createMany).not.toHaveBeenCalled();
    expect(notifications.sendWhatsApp).not.toHaveBeenCalled();
  });
});
