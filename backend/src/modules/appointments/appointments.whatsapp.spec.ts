import { AppointmentsService } from './appointments.service';
import { VisitType } from '@prisma/client';
import { WhatsAppGraphClient } from '../whatsapp/graph-client';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

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
      whatsAppConnection: { findUnique: jest.fn().mockResolvedValue(null) },
      whatsAppMessage: { create: jest.fn().mockResolvedValue({}) },
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
  });

  const realEnv = { ...process.env };
  afterEach(() => {
    process.env = realEnv;
  });

  /** The appointment's WhatsApp message as the Graph API receives it from the server-wide number. */
  const sendAndCapture = async (prisma: any, templates: any) => {
    process.env = { ...realEnv, WHATSAPP_TOKEN: 'env-token', WHATSAPP_PHONE_NUMBER_ID: 'env-phone', WHATSAPP_GRAPH_BASE_URL: 'http://graph.test' };
    let delivered!: (body: any) => void;
    const message = new Promise<any>((resolve) => (delivered = resolve));
    (global as any).fetch = jest.fn(async (url: string, init: { body: string }) => {
      delivered({ url, ...JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.APPT' }] }) };
    });
    const whatsapp = new WhatsAppService(prisma, new WhatsAppGraphClient());
    const svc = new AppointmentsService(prisma as any, makeNotifications() as any, templates as any, undefined, whatsapp);
    await svc.create(baseDto as any, 'branch-1');
    return message;
  };

  const makeTemplates = () => ({
    resolveActiveTemplate: jest.fn(),
  });

  it('uses WhatsApp template with components when available', async () => {
    const { prisma } = makePrisma();
    const templates = makeTemplates();
    templates.resolveActiveTemplate.mockResolvedValue({
      name: 'appt_template',
      language: 'en',
      variables: ['patient_name', 'appointment_date'],
    });

    expect(await sendAndCapture(prisma, templates)).toEqual({
      url: 'http://graph.test/v21.0/env-phone/messages',
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '919999999999',
      type: 'template',
      template: {
        name: 'appt_template',
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Alice Patient' }, { type: 'text', text: '01 Jan 2099' }] }],
      },
    });
  });

  it('supports object metadata and fills patient and clinic template variables', async () => {
    const { prisma } = makePrisma();
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

    const message = await sendAndCapture(prisma, templates);
    expect(message.template.components[0].parameters.map((param: any) => param.text)).toEqual(['9999999999', 'Downtown Clinic', '9988776655']);
  });

  it('falls back to plain text when no template is resolved', async () => {
    const { prisma } = makePrisma();
    const templates = makeTemplates();
    templates.resolveActiveTemplate.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      metadata: JSON.stringify({
        whatsappAutoConfirmAppointments: true,
        whatsappUseTemplate: false,
      }),
    });
    const message = await sendAndCapture(prisma, templates);
    expect([message.type, message.to, message.text.body.split('\n')[0]]).toEqual(['text', '919999999999', expect.stringContaining('Appointment confirmed with Dr. John Doe')]);
  });
});
