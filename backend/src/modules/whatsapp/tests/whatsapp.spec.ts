import { createHmac } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { WhatsAppGraphClient } from '../graph-client';
import { parseStatusUpdates } from '../message-status';
import { normalizeWhatsAppNumber } from '../phone-number';
import { openToken, sealToken, whatsappTokenKey } from '../token-cipher';
import { WhatsAppConnectionService } from '../whatsapp-connection.service';
import { WhatsAppController } from '../whatsapp.controller';
import { acceptedOrThrow, WhatsAppService } from '../whatsapp.service';

type Row = Record<string, any>;

function pick(row: Row | undefined, select: Row | undefined, db: FakeDb) {
  if (!row) return null;
  if (!select) return { ...row };
  const out: Row = {};
  for (const [key, spec] of Object.entries(select)) {
    if (key === 'linkedBy') {
      const user = db.users.find((u) => u.id === row.linkedById);
      out.linkedBy = user ? pick(user, (spec as Row).select, db) : null;
    } else out[key] = row[key];
  }
  return out;
}

class FakeDb {
  users: Row[] = [
    {
      id: 'admin-1',
      branchId: 'branch-1',
      firstName: 'Meera',
      lastName: 'Kulkarni',
      metadata: null,
    },
    {
      id: 'doctor-1',
      branchId: 'branch-1',
      firstName: 'Priya',
      lastName: 'Menon',
      metadata: JSON.stringify({
        whatsappAccessToken: 'doctor-token',
        whatsappPhoneNumberId: 'doctor-phone',
      }),
    },
    {
      id: 'doctor-2',
      branchId: 'branch-1',
      firstName: 'Anil',
      lastName: 'Rao',
      metadata: JSON.stringify({ whatsappPhoneNumberId: 'only-phone' }),
    },
  ];
  branches: Row[] = [
    {
      id: 'branch-1',
      name: 'Lakshmi Family Clinic',
      address: '12 MG Road, Pune 411001',
      phone: '+91 20 2555 0101',
    },
  ];
  connections: Row[] = [];
  messages: Row[] = [];

  user = {
    findFirst: async ({ where, select }: Row) =>
      pick(
        this.users.find(
          (u) => u.id === where.id && u.branchId === where.branchId,
        ),
        select,
        this,
      ),
    findUnique: async ({ where, select }: Row) =>
      pick(
        this.users.find((u) => u.id === where.id),
        select,
        this,
      ),
  };
  branch = {
    findUnique: async ({ where, select }: Row) =>
      pick(
        this.branches.find((b) => b.id === where.id),
        select,
        this,
      ),
  };
  whatsAppConnection = {
    findUnique: async ({ where, select }: Row) =>
      pick(
        this.connections.find((c) => c.branchId === where.branchId),
        select,
        this,
      ),
    upsert: async ({ where, create, update }: Row) => {
      const existing = this.connections.find(
        (c) => c.branchId === where.branchId,
      );
      if (existing) Object.assign(existing, update);
      else
        this.connections.push({
          prescriptionTemplateName: null,
          prescriptionTemplateLanguage: null,
          prescriptionTemplateBodyParams: 0,
          ...create,
        });
    },
    update: async ({ where, data }: Row) =>
      Object.assign(
        this.connections.find((c) => c.branchId === where.branchId)!,
        data,
      ),
    deleteMany: async ({ where }: Row) => {
      this.connections = this.connections.filter(
        (c) => c.branchId !== where.branchId,
      );
    },
  };
  whatsAppMessage = {
    create: async ({ data }: Row) => {
      const row = {
        id: `msg-${this.messages.length + 1}`,
        status: 'ACCEPTED',
        errorCode: null,
        errorTitle: null,
        ...data,
      };
      this.messages.push(row);
      return row;
    },
    updateMany: async ({ where, data }: Row) => {
      const hits = this.messages.filter(
        (m) => m.wamid === where.wamid && where.status.in.includes(m.status),
      );
      hits.forEach((m) => Object.assign(m, data));
      return { count: hits.length };
    },
    findMany: async () => this.messages,
  };
}

type Call = {
  method: string;
  url: string;
  auth: string;
  json?: any;
  form?: FormData;
};

function fakeGraph(
  responses: Record<
    string,
    (call: Call) => { status: number; body: unknown }
  > = {},
) {
  const calls: Call[] = [];
  const routes: Record<
    string,
    (call: Call) => { status: number; body: unknown }
  > = {
    'GET /v21.0/clinic-phone': () => ({
      status: 200,
      body: {
        display_phone_number: '+91 20 2555 0199',
        verified_name: 'Lakshmi Family Clinic',
        quality_rating: 'GREEN',
        id: 'clinic-phone',
      },
    }),
    'POST /v21.0/clinic-phone/media': () => ({
      status: 200,
      body: { id: 'media-77' },
    }),
    'POST /v21.0/clinic-phone/messages': () => ({
      status: 200,
      body: { messaging_product: 'whatsapp', messages: [{ id: 'wamid.HBg1' }] },
    }),
    'POST /v21.0/doctor-phone/messages': () => ({
      status: 200,
      body: { messages: [{ id: 'wamid.DOC' }] },
    }),
    'POST /v21.0/env-phone/messages': () => ({
      status: 200,
      body: { messages: [{ id: 'wamid.ENV' }] },
    }),
    'GET /v21.0/waba-9/message_templates': () => ({
      status: 200,
      body: {
        data: [
          {
            name: 'prescription_ready',
            language: 'en',
            status: 'APPROVED',
            components: [
              { type: 'HEADER', format: 'DOCUMENT' },
              {
                type: 'BODY',
                text: 'Hi {{1}}, Dr {{2}} sent your prescription. {{1}}',
              },
            ],
          },
          {
            name: 'prescription_ready',
            language: 'hi',
            status: 'PENDING',
            components: [{ type: 'HEADER', format: 'DOCUMENT' }],
          },
          {
            name: 'appointment_reminder',
            language: 'en',
            status: 'APPROVED',
            components: [
              { type: 'HEADER', format: 'TEXT' },
              { type: 'BODY', text: '{{1}}' },
            ],
          },
          {
            name: 'long_rx',
            language: 'en_US',
            status: 'APPROVED',
            components: [
              { type: 'HEADER', format: 'DOCUMENT' },
              { type: 'BODY', text: '{{1}} {{2}} {{3}} {{4}}' },
            ],
          },
        ],
      },
    }),
    ...responses,
  };
  const fetchMock = jest.fn(
    async (
      input: string,
      init: { method: string; headers: Record<string, string>; body?: any },
    ) => {
      const url = new URL(input);
      const call: Call = {
        method: init.method,
        url: input,
        auth: init.headers.Authorization,
      };
      if (typeof init.body === 'string') call.json = JSON.parse(init.body);
      else if (init.body) call.form = init.body;
      calls.push(call);
      const route = routes[`${init.method} ${url.pathname}`];
      const { status, body } = route
        ? route(call)
        : { status: 404, body: { error: { message: 'No route', code: 803 } } };
      return { ok: status < 400, status, json: async () => body } as Response;
    },
  );
  return { calls, fetchMock };
}

const KEY_ENV = { JWT_SECRET: 'jwt-secret-for-tests' };

function setup(responses?: Parameters<typeof fakeGraph>[0]) {
  const db = new FakeDb();
  const graph = fakeGraph(responses);
  (global as any).fetch = graph.fetchMock;
  const client = new WhatsAppGraphClient();
  const whatsapp = new WhatsAppService(db as any, client);
  const connections = new WhatsAppConnectionService(
    db as any,
    client,
    whatsapp,
  );
  return {
    db,
    calls: graph.calls,
    whatsapp,
    connections,
    controller: new WhatsAppController(connections, whatsapp),
  };
}

async function linkClinic(
  s: ReturnType<typeof setup>,
  template?: { name: string; language: string },
) {
  await s.connections.link(
    { id: 'admin-1', branchId: 'branch-1' },
    {
      accessToken: 'clinic-token',
      phoneNumberId: 'clinic-phone',
      businessAccountId: 'waba-9',
    },
  );
  if (template)
    await s.connections.setPrescriptionTemplate('branch-1', template);
  s.calls.length = 0;
}

const pdf = Buffer.from('%PDF-1.4 sample');

describe('WhatsApp', () => {
  const realEnv = { ...process.env };
  beforeEach(() => {
    process.env = {
      ...realEnv,
      ...KEY_ENV,
      WHATSAPP_GRAPH_BASE_URL: 'http://graph.test',
    };
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TOKEN_KEY;
    delete process.env.META_APP_SECRET;
  });
  afterAll(() => {
    process.env = realEnv;
  });

  it('normalises Indian and international numbers and refuses anything else', () => {
    const table = [
      '+91 97048 02443',
      '9704802443',
      '919704802443',
      '+91-970-480-2443',
      '(+44) 20 7946 0958',
      '12345',
      '+91 97048 0244x',
      '1234567890123456',
      '',
    ];
    expect(table.map(normalizeWhatsAppNumber)).toEqual([
      '919704802443',
      '919704802443',
      '919704802443',
      '919704802443',
      '442079460958',
      null,
      null,
      null,
      null,
    ]);
  });

  it('seals a token with an explicit key or one derived from JWT_SECRET, and only that key opens it', () => {
    const derived = whatsappTokenKey({ JWT_SECRET: 'jwt-secret-for-tests' });
    const sealed = sealToken('EAAG-secret-token', derived);
    expect(sealed).not.toContain('EAAG');
    expect(
      openToken(
        sealed,
        whatsappTokenKey({ JWT_SECRET: 'jwt-secret-for-tests' }),
      ),
    ).toBe('EAAG-secret-token');
    expect(() =>
      openToken(sealed, whatsappTokenKey({ JWT_SECRET: 'rotated' })),
    ).toThrow(
      'The saved WhatsApp token cannot be read with this server key. Link WhatsApp again in Clinic profile.',
    );
    const explicit = whatsappTokenKey({
      WHATSAPP_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'),
      JWT_SECRET: 'ignored',
    });
    expect(openToken(sealToken('t-2', explicit), Buffer.alloc(32, 7))).toBe(
      't-2',
    );
    expect(() =>
      whatsappTokenKey({
        WHATSAPP_TOKEN_KEY: Buffer.alloc(16).toString('base64'),
      }),
    ).toThrow('WHATSAPP_TOKEN_KEY must be the base64 encoding of 32 bytes.');
  });

  it('links only after Meta confirms the number, and never returns the token or its ciphertext', async () => {
    const s = setup();
    const view = await s.connections.link(
      { id: 'admin-1', branchId: 'branch-1' },
      {
        accessToken: ' clinic-token ',
        phoneNumberId: 'clinic-phone',
        businessAccountId: 'waba-9',
      },
    );
    expect(s.calls.map((c) => [c.method, c.url, c.auth])).toEqual([
      [
        'GET',
        'http://graph.test/v21.0/clinic-phone?fields=display_phone_number,verified_name,quality_rating',
        'Bearer clinic-token',
      ],
    ]);
    expect(view).toEqual({
      linked: true,
      phoneNumberId: 'clinic-phone',
      businessAccountId: 'waba-9',
      displayPhoneNumber: '+91 20 2555 0199',
      verifiedName: 'Lakshmi Family Clinic',
      qualityRating: 'GREEN',
      prescriptionTemplate: null,
      verifiedAt: expect.any(Date),
      linkedBy: { id: 'admin-1', name: 'Meera Kulkarni' },
    });
    const read = JSON.stringify(
      await s.controller.connection({
        user: { id: 'admin-1', branchId: 'branch-1', role: 'ADMIN' },
      }),
    );
    expect([
      read.includes('clinic-token'),
      read.includes(s.db.connections[0].accessTokenCipher),
      s.db.connections[0].accessTokenCipher.includes('clinic-token'),
    ]).toEqual([false, false, false]);
  });

  it('refuses to link when Meta rejects the token, storing nothing', async () => {
    const s = setup({
      'GET /v21.0/clinic-phone': () => ({
        status: 401,
        body: {
          error: { message: 'Error validating access token', code: 190 },
        },
      }),
    });
    await expect(
      s.connections.link(
        { id: 'admin-1', branchId: 'branch-1' },
        { accessToken: 'stale', phoneNumberId: 'clinic-phone' },
      ),
    ).rejects.toThrow(
      'WhatsApp did not accept these details. The WhatsApp access token is invalid or has expired. Create a new permanent token in Meta Business Manager and link WhatsApp again.',
    );
    expect(await s.connections.view('branch-1')).toEqual({
      linked: false,
      fallback: null,
    });
  });

  it('lists approved document-header templates with their body parameter count and stores the count Meta reports', async () => {
    const s = setup();
    await linkClinic(s);
    expect(await s.connections.templates('branch-1')).toEqual([
      { name: 'prescription_ready', language: 'en', bodyParams: 2 },
      { name: 'long_rx', language: 'en_US', bodyParams: 4 },
    ]);
    await expect(
      s.connections.setPrescriptionTemplate('branch-1', {
        name: 'long_rx',
        language: 'en_US',
      }),
    ).rejects.toThrow(
      '"long_rx" needs 4 body values. Prescriptions fill at most 3: patient name, doctor name and clinic name.',
    );
    const view = await s.connections.setPrescriptionTemplate('branch-1', {
      name: 'prescription_ready',
      language: 'en',
    });
    expect(view.linked && view.prescriptionTemplate).toEqual({
      name: 'prescription_ready',
      language: 'en',
      bodyParams: 2,
    });
  });

  it('sends a plain document message when the clinic has no prescription template', async () => {
    const s = setup();
    await linkClinic(s);
    const result = await s.whatsapp.sendPrescription({
      branchId: 'branch-1',
      to: '+91 97048 02443',
      pdfBuffer: pdf,
      fileName: 'prescription-rx1.pdf',
      caption: 'Your prescription is attached.',
      patientName: 'Asha Verma',
      doctorName: 'Dr. Priya Menon',
      prescriptionId: 'rx1',
      kind: 'PRESCRIPTION',
    });
    expect(result).toEqual({
      status: 'ACCEPTED',
      wamid: 'wamid.HBg1',
      source: 'CLINIC',
    });
    expect(s.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST http://graph.test/v21.0/clinic-phone/media',
      'POST http://graph.test/v21.0/clinic-phone/messages',
    ]);
    const file = s.calls[0].form!.get('file') as File;
    expect([
      s.calls[0].form!.get('messaging_product'),
      s.calls[0].form!.get('type'),
      file.name,
      Buffer.from(await file.arrayBuffer()).toString(),
    ]).toEqual([
      'whatsapp',
      'application/pdf',
      'prescription-rx1.pdf',
      '%PDF-1.4 sample',
    ]);
    expect(s.calls[1].json).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '919704802443',
      type: 'document',
      document: {
        id: 'media-77',
        filename: 'prescription-rx1.pdf',
        caption: 'Your prescription is attached.',
      },
    });
    expect(
      s.db.messages.map(({ wamid, toPhone, kind, prescriptionId, status }) => ({
        wamid,
        toPhone,
        kind,
        prescriptionId,
        status,
      })),
    ).toEqual([
      {
        wamid: 'wamid.HBg1',
        toPhone: '919704802443',
        kind: 'PRESCRIPTION',
        prescriptionId: 'rx1',
        status: 'ACCEPTED',
      },
    ]);
  });

  it('sends the PDF as the template header with patient, doctor and clinic as body values when a template is chosen', async () => {
    const s = setup();
    await linkClinic(s, { name: 'prescription_ready', language: 'en' });
    await s.whatsapp.sendPrescription({
      branchId: 'branch-1',
      to: '9704802443',
      pdfBuffer: pdf,
      fileName: 'sample-prescription.pdf',
      caption: 'unused',
      patientName: 'Test Patient',
      doctorName: 'Dr. Meera Kulkarni',
      kind: 'TEST_PRESCRIPTION',
    });
    expect(s.calls[1].json).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '919704802443',
      type: 'template',
      template: {
        name: 'prescription_ready',
        language: { code: 'en' },
        components: [
          {
            type: 'header',
            parameters: [
              {
                type: 'document',
                document: {
                  id: 'media-77',
                  filename: 'sample-prescription.pdf',
                },
              },
            ],
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Test Patient' },
              { type: 'text', text: 'Dr. Meera Kulkarni' },
            ],
          },
        ],
      },
    });
  });

  it('renders the sample prescription PDF and sends it as a test from the clinic profile', async () => {
    const s = setup();
    await linkClinic(s, { name: 'prescription_ready', language: 'en' });
    const result = await s.controller.sendTest(
      { user: { id: 'admin-1', branchId: 'branch-1', role: 'ADMIN' } },
      { to: '+91 9704802443' },
    );
    expect(result).toEqual({
      status: 'ACCEPTED',
      wamid: 'wamid.HBg1',
      source: 'CLINIC',
    });
    const file = s.calls[0].form!.get('file') as File;
    expect(
      Buffer.from(await file.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');
    expect(s.calls[1].json.template.components[1].parameters).toEqual([
      { type: 'text', text: 'Test Patient' },
      { type: 'text', text: 'Dr. Meera Kulkarni' },
    ]);
    await expect(
      s.controller.sendTest(
        { user: { id: 'admin-1', branchId: 'branch-1', role: 'ADMIN' } },
        { to: '12345' },
      ),
    ).rejects.toThrow(
      'Enter a WhatsApp number with its country code, for example +91 97048 02443.',
    );
  });

  it.each([
    [
      190,
      'The WhatsApp access token is invalid or has expired. Create a new permanent token in Meta Business Manager and link WhatsApp again.',
    ],
    [
      131047,
      'This patient has not messaged the clinic in the last 24 hours, so WhatsApp needs an approved template. Choose a prescription template in Clinic profile.',
    ],
    [131026, 'This number is not on WhatsApp or cannot receive messages.'],
    [
      131030,
      "This number is not in the allowed list of the Meta test number. Add it under WhatsApp > API Setup in Meta, or link the clinic's live number.",
    ],
    [
      132001,
      'The chosen template does not exist in that language. Pick the template again in Clinic profile.',
    ],
    [100, 'Meta rejected a value in the request: Invalid parameter detail.'],
    [368, 'Temporarily blocked for policies violations.'],
  ])(
    'maps Meta error %i to a reason the clinic can act on',
    async (code, reason) => {
      const s = setup({
        'POST /v21.0/clinic-phone/messages': () => ({
          status: 400,
          body: {
            error: {
              code,
              message:
                code === 368
                  ? 'Temporarily blocked for policies violations.'
                  : 'meta text',
              error_data: { details: 'Invalid parameter detail' },
            },
          },
        }),
      });
      await linkClinic(s);
      const result = await s.whatsapp.sendText({
        branchId: 'branch-1',
        to: '9704802443',
        text: 'hi',
        kind: 'TEXT',
      });
      expect(result).toEqual({ status: 'FAILED', code, reason });
      expect(s.db.messages).toEqual([]);
    },
  );

  it('retries a 5xx once, then reports the failure without recording a message', async () => {
    let attempts = 0;
    const s = setup({
      'POST /v21.0/clinic-phone/messages': () => ({
        status: 503,
        body: { error: { message: `Service unavailable ${++attempts}` } },
      }),
    });
    await linkClinic(s);
    expect(
      await s.whatsapp.sendText({
        branchId: 'branch-1',
        to: '9704802443',
        text: 'hi',
        kind: 'TEXT',
      }),
    ).toEqual({ status: 'FAILED', reason: 'Service unavailable 2' });
  });

  it('chooses the doctor override, then the clinic link, then the server env, and reports NOT_CONFIGURED with none', async () => {
    const s = setup();
    expect(await s.whatsapp.resolveSender('branch-1')).toBeNull();
    expect(
      await s.whatsapp.sendText({
        branchId: 'branch-1',
        to: '9704802443',
        text: 'hi',
        kind: 'TEXT',
      }),
    ).toEqual({ status: 'NOT_CONFIGURED' });
    expect(() => acceptedOrThrow({ status: 'NOT_CONFIGURED' })).toThrow(
      new BadRequestException(
        'Link the clinic WhatsApp in Clinic profile first.',
      ),
    );
    process.env.WHATSAPP_TOKEN = 'env-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'env-phone';
    expect(await s.whatsapp.resolveSender('branch-1')).toEqual({
      token: 'env-token',
      phoneNumberId: 'env-phone',
      source: 'SERVER_ENV',
    });
    expect(await s.connections.view('branch-1')).toEqual({
      linked: false,
      fallback: 'SERVER_ENV',
    });
    await linkClinic(s);
    expect(await s.whatsapp.resolveSender('branch-1')).toEqual({
      token: 'clinic-token',
      phoneNumberId: 'clinic-phone',
      source: 'CLINIC',
    });
    expect(await s.whatsapp.resolveSender('branch-1', 'doctor-2')).toEqual({
      token: 'clinic-token',
      phoneNumberId: 'clinic-phone',
      source: 'CLINIC',
    });
    expect(await s.whatsapp.resolveSender('branch-1', 'doctor-1')).toEqual({
      token: 'doctor-token',
      phoneNumberId: 'doctor-phone',
      source: 'DOCTOR',
    });
    expect(
      await s.whatsapp.sendText({
        branchId: 'branch-1',
        to: '9704802443',
        text: 'hi',
        kind: 'APPOINTMENT',
        doctorId: 'doctor-1',
      }),
    ).toEqual({ status: 'ACCEPTED', wamid: 'wamid.DOC', source: 'DOCTOR' });
    await s.connections.unlink('branch-1');
    expect(
      await s.whatsapp.sendText({
        branchId: 'branch-1',
        to: '9704802443',
        text: 'hi',
        kind: 'TEXT',
      }),
    ).toEqual({ status: 'ACCEPTED', wamid: 'wamid.ENV', source: 'SERVER_ENV' });
  });

  describe('webhook', () => {
    const delivery = (
      status: string,
      wamid = 'wamid.HBg1',
      errors?: unknown[],
    ) => ({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-9',
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [
                  {
                    id: wamid,
                    status,
                    timestamp: '1700000000',
                    recipient_id: '919704802443',
                    ...(errors ? { errors } : {}),
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const post = (
      s: ReturnType<typeof setup>,
      body: unknown,
      signature?: string,
    ) => {
      const rawBody = Buffer.from(JSON.stringify(body));
      return s.controller.receiveWebhook({
        body,
        rawBody,
        header: (name: string) =>
          name === 'x-hub-signature-256' ? signature : undefined,
      } as any);
    };
    const sign = (body: unknown, secret: string) =>
      `sha256=${createHmac('sha256', secret)
        .update(Buffer.from(JSON.stringify(body)))
        .digest('hex')}`;

    it('moves a message forward only, ignores repeats, and keeps FAILED final with its error', async () => {
      const s = setup();
      await linkClinic(s);
      await s.whatsapp.sendText({
        branchId: 'branch-1',
        to: '9704802443',
        text: 'hi',
        kind: 'TEXT',
      });
      const statuses: string[] = [];
      for (const status of [
        'delivered',
        'sent',
        'delivered',
        'read',
        'delivered',
      ]) {
        await post(s, delivery(status));
        statuses.push(s.db.messages[0].status);
      }
      expect(statuses).toEqual([
        'DELIVERED',
        'DELIVERED',
        'DELIVERED',
        'READ',
        'READ',
      ]);

      s.db.messages.push({
        id: 'm2',
        wamid: 'wamid.F',
        status: 'SENT',
        errorCode: null,
        errorTitle: null,
      });
      expect(
        await post(
          s,
          delivery('failed', 'wamid.F', [
            { code: 131026, title: 'Message undeliverable' },
          ]),
        ),
      ).toEqual({ updated: 1 });
      expect(await post(s, delivery('delivered', 'wamid.F'))).toEqual({
        updated: 0,
      });
      expect(s.db.messages[1]).toMatchObject({
        status: 'FAILED',
        errorCode: 131026,
        errorTitle: 'Message undeliverable',
      });
    });

    it('rejects a delivery whose signature does not match META_APP_SECRET', async () => {
      const s = setup();
      await linkClinic(s);
      await s.whatsapp.sendText({
        branchId: 'branch-1',
        to: '9704802443',
        text: 'hi',
        kind: 'TEXT',
      });
      process.env.META_APP_SECRET = 'app-secret';
      const body = delivery('read');
      await expect(post(s, body, sign(body, 'wrong-secret'))).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(post(s, body)).rejects.toThrow(UnauthorizedException);
      expect(s.db.messages[0].status).toBe('ACCEPTED');
      expect(await post(s, body, sign(body, 'app-secret'))).toEqual({
        updated: 1,
      });
      expect(s.db.messages[0].status).toBe('READ');
    });

    it('answers the verification challenge only for the configured verify token', () => {
      const s = setup();
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'verify-me';
      expect(
        s.controller.verifyWebhook('subscribe', 'verify-me', '1158201444'),
      ).toBe('1158201444');
      expect(() =>
        s.controller.verifyWebhook('subscribe', 'guess', '1158201444'),
      ).toThrow('Webhook verification failed');
    });

    it('reads only status entries from a webhook body', () => {
      expect(
        parseStatusUpdates({
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [{ id: 'in' }],
                    statuses: [
                      { id: 'w1', status: 'read' },
                      { id: 'w2', status: 'deleted' },
                    ],
                  },
                },
              ],
            },
          ],
        }),
      ).toEqual([
        { wamid: 'w1', status: 'READ', errorCode: null, errorTitle: null },
      ]);
    });
  });
});
