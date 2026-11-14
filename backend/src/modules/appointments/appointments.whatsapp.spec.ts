import { AppointmentsService } from './appointments.service';
import { VisitType } from '@prisma/client';

describe('AppointmentsService WhatsApp flow', () => {
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

  it('uses WhatsApp template with components when available', async () => {
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

    expect(notifications.sendWhatsApp).toHaveBeenCalledTimes(1);
    const payload = notifications.sendWhatsApp.mock.calls[0][0];
    expect(payload.toPhoneE164).toBe('+9999999999');
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

    const payload = notifications.sendWhatsApp.mock.calls[0][0];
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

    expect(notifications.sendWhatsApp).toHaveBeenCalledTimes(1);
    const payload = notifications.sendWhatsApp.mock.calls[0][0];
    expect(payload.text).toContain('Appointment confirmed with Dr. John Doe');
  });
});

describe('AppointmentsService confirmation email', () => {
  const patientWithEmail = { id: 'patient-1', name: 'Alice Patient', phone: '9999999999', email: 'alice@example.com' };
  const doctorRecord = { id: 'doctor-1', firstName: 'John', lastName: 'Doe', email: 'doc@example.com' };
  const dto = {
    patientId: patientWithEmail.id,
    doctorId: doctorRecord.id,
    date: '2099-01-01',
    slot: '10:00-10:30',
    visitType: VisitType.OPD,
  };

  const setup = (metadata: unknown, configured = true) => {
    const txAppointment = {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ tokenNumber: 0 }),
      create: jest.fn().mockImplementation(async ({ data }) => ({
        ...data,
        id: 'appt-1',
        patient: patientWithEmail,
        doctor: doctorRecord,
        room: null,
      })),
    };
    const prisma: any = {
      branch: { findUnique: jest.fn().mockResolvedValue({ name: 'Downtown Clinic', phone: '9988776655' }) },
      patient: { findFirst: jest.fn().mockResolvedValue(patientWithEmail) },
      user: {
        findFirst: jest.fn().mockResolvedValue(doctorRecord),
        findUnique: jest.fn().mockResolvedValue({ metadata }),
      },
      room: { findFirst: jest.fn() },
      doctorWorkingHours: { findMany: jest.fn().mockResolvedValue([]) },
      doctorTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb({ $executeRaw: jest.fn(), appointment: txAppointment })),
    };
    const notifications = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
      sendWhatsApp: jest.fn().mockResolvedValue(undefined),
      emailStatus: jest.fn().mockReturnValue({ configured, from: configured ? 'clinic@example.com' : null }),
    };
    return { svc: new AppointmentsService(prisma, notifications as any, undefined), notifications };
  };

  it('emails the patient when the doctor has not set the preference', async () => {
    const { svc, notifications } = setup(JSON.stringify({}));
    await svc.create(dto as any, 'branch-1');
    expect(notifications.sendEmail).toHaveBeenCalledTimes(1);
    const mail = notifications.sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('alice@example.com');
    expect(mail.subject).toBe('Appointment Confirmation');
    expect(mail.text).toContain('Appointment confirmed with Dr. John Doe');
  });

  it('emails the patient when the doctor has no metadata at all', async () => {
    const { svc, notifications } = setup(null);
    await svc.create(dto as any, 'branch-1');
    expect(notifications.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('skips the email when the doctor opted out', async () => {
    const { svc, notifications } = setup(JSON.stringify({ emailAutoConfirmAppointments: false }));
    await svc.create(dto as any, 'branch-1');
    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  it('skips the email when SMTP is not configured', async () => {
    const { svc, notifications } = setup({}, false);
    await svc.create(dto as any, 'branch-1');
    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  it('escapes HTML in the email body', async () => {
    const { svc, notifications } = setup({});
    const original = (svc as any).buildAppointmentSummary;
    (svc as any).buildAppointmentSummary = (...args: unknown[]) => `${original.apply(svc, args)} <b>&"x"</b>`;
    await svc.create(dto as any, 'branch-1');
    const mail = notifications.sendEmail.mock.calls[0][0];
    expect(mail.html).toContain('&#60;b&#62;&#38;&#34;x&#34;&#60;/b&#62;');
  });

  it('still creates the appointment when the email send fails', async () => {
    const { svc, notifications } = setup({});
    notifications.sendEmail.mockRejectedValue(new Error('smtp down'));
    const created = await svc.create(dto as any, 'branch-1');
    expect(created.id).toBe('appt-1');
  });
});
