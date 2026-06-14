import { PharmacyAgentService } from './pharmacy-agent.service';

describe('PharmacyAgentService safety helpers', () => {
  const service = new PharmacyAgentService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  ) as any;

  beforeEach(() => {
    service.codexStatusCache = null;
  });

  it('redacts sensitive fields recursively before Codex or audit storage', () => {
    expect(
      service.redact({
        authToken: 'secret-token',
        nested: {
          password: 'secret-password',
          ok: 'visible',
        },
        rows: [{ api_key: 'secret-key', name: 'Acne gel' }],
      }),
    ).toEqual({
      authToken: '[REDACTED]',
      nested: {
        password: '[REDACTED]',
        ok: 'visible',
      },
      rows: [{ api_key: '[REDACTED]', name: 'Acne gel' }],
    });
  });

  it('normalizes proposal actions with required permissions', () => {
    const actions = service.normalizeProposalActions([
      {
        actionType: 'update_drug',
        targetId: 'drug-1',
        input: { price: 120 },
      },
      {
        actionType: 'adjust_stock',
        targetId: 'item-1',
        input: { itemId: 'item-1', adjustmentQuantity: 5 },
      },
    ]);

    expect(actions).toMatchObject([
      {
        actionType: 'update_drug',
        targetType: 'drug',
        targetId: 'drug-1',
        permissionRequired: 'pharmacy:drug:update',
      },
      {
        actionType: 'adjust_stock',
        targetType: 'inventory_item',
        targetId: 'item-1',
        permissionRequired: 'inventory:adjustment:create',
      },
    ]);
  });

  it('drops unsupported data requests before the second Codex pass', () => {
    expect(
      service.normalizeDataRequests([
        { name: 'pharmacy_dashboard' },
        { name: 'drug_catalog', params: { sortBy: 'price' } },
        { name: 'raw_sql_dump' },
      ]),
    ).toEqual([
      { name: 'pharmacy_dashboard' },
      { name: 'drug_catalog', params: { sortBy: 'price' } },
    ]);
  });

  it('does not report Codex online when authenticated with an API key', async () => {
    service.runCodexStatus = jest.fn().mockResolvedValue({
      exitCode: 0,
      output: 'Logged in using an API key - sk-proj-***',
    });

    await expect(service.getCodexStatus()).resolves.toMatchObject({
      configured: false,
    });
  });

  it('reports Codex online when authenticated with ChatGPT access token auth', async () => {
    service.runCodexStatus = jest.fn().mockResolvedValue({
      exitCode: 0,
      output: 'Logged in using an access token',
    });

    await expect(service.getCodexStatus()).resolves.toMatchObject({
      configured: true,
    });
  });

  it('caches the Codex status check briefly', async () => {
    const previousTtl = process.env.PHARMACY_AGENT_CODEX_STATUS_CACHE_MS;
    process.env.PHARMACY_AGENT_CODEX_STATUS_CACHE_MS = '60000';
    service.runCodexStatus = jest.fn().mockResolvedValue({
      exitCode: 0,
      output: 'Logged in using ChatGPT',
    });

    try {
      await service.getCodexStatus();
      await service.getCodexStatus();
    } finally {
      if (previousTtl === undefined) {
        delete process.env.PHARMACY_AGENT_CODEX_STATUS_CACHE_MS;
      } else {
        process.env.PHARMACY_AGENT_CODEX_STATUS_CACHE_MS = previousTtl;
      }
    }

    expect(service.runCodexStatus).toHaveBeenCalledTimes(1);
  });

  it('returns the drug catalog with prices and price sorting', async () => {
    const prisma = {
      drug: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'drug-1',
            name: 'Acitretin 25 mg',
            price: 480,
            manufacturerName: 'Derma Labs',
            type: 'allopathy',
            packSizeLabel: 'Strip of 10',
            composition1: 'Acitretin',
            composition2: null,
            category: 'Dermatology',
            dosageForm: 'Tablet',
            strength: '25 mg',
            barcode: null,
            sku: 'ACIT-25',
            updatedAt: new Date('2026-05-19T00:00:00.000Z'),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const catalogService = new PharmacyAgentService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;

    const result = await catalogService.executeDataRequest(
      'drug_catalog',
      { sortBy: 'price', sortOrder: 'desc', startsWith: 'A', limit: 100 },
      'branch-1',
    );

    expect(prisma.drug.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId: 'branch-1',
          name: { startsWith: 'A', mode: 'insensitive' },
        }),
        orderBy: { price: 'desc' },
        take: 100,
        select: expect.objectContaining({ name: true, price: true }),
      }),
    );
    expect(result).toMatchObject({
      total: 1,
      returned: 1,
      sortBy: 'price',
      sortOrder: 'desc',
      currency: 'INR',
      drugs: [
        {
          name: 'Acitretin 25 mg',
          price: 480,
          sku: 'ACIT-25',
        },
      ],
    });
  });

  it('reuses an empty active draft session instead of creating duplicates', async () => {
    const prisma = {
      pharmacyAgentSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'draft-1',
          branchId: 'branch-1',
          userId: 'user-1',
          title: 'Agentic Pharmacy',
          status: 'ACTIVE',
          createdAt: new Date('2026-05-19T00:00:00.000Z'),
          updatedAt: new Date('2026-05-19T00:00:00.000Z'),
          messages: [],
          attachments: [],
          proposals: [],
        }),
        create: jest.fn(),
      },
    };
    const threadedService = new PharmacyAgentService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;

    const result = await threadedService.createSession(
      { title: 'Agentic Pharmacy' },
      {
        id: 'user-1',
        branchId: 'branch-1',
      },
    );

    expect(prisma.pharmacyAgentSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId: 'branch-1',
          userId: 'user-1',
          status: 'ACTIVE',
          messages: { none: {} },
          attachments: { none: {} },
          proposals: { none: {} },
        }),
      }),
    );
    expect(prisma.pharmacyAgentSession.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'draft-1',
      status: 'ACTIVE',
      messages: [],
      attachments: [],
      proposals: [],
    });
  });

  it('shows one empty active draft and hides empty archived sessions', async () => {
    const prisma = {
      pharmacyAgentSession: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'archived-empty',
            title: 'Agentic Pharmacy',
            status: 'ARCHIVED',
            updatedAt: new Date('2026-05-19T05:00:00.000Z'),
            messages: [],
            attachments: [],
            proposals: [],
            _count: { messages: 0, attachments: 0, proposals: 0 },
          },
          {
            id: 'active-content',
            title: 'Stock question',
            status: 'ACTIVE',
            updatedAt: new Date('2026-05-19T04:00:00.000Z'),
            messages: [{ content: 'How many drugs?' }],
            attachments: [],
            proposals: [],
            _count: { messages: 2, attachments: 0, proposals: 0 },
          },
          {
            id: 'active-empty-new',
            title: 'Agentic Pharmacy',
            status: 'ACTIVE',
            updatedAt: new Date('2026-05-19T03:00:00.000Z'),
            messages: [],
            attachments: [],
            proposals: [],
            _count: { messages: 0, attachments: 0, proposals: 0 },
          },
          {
            id: 'active-empty-old',
            title: 'Agentic Pharmacy',
            status: 'ACTIVE',
            updatedAt: new Date('2026-05-19T02:00:00.000Z'),
            messages: [],
            attachments: [],
            proposals: [],
            _count: { messages: 0, attachments: 0, proposals: 0 },
          },
          {
            id: 'archived-content',
            title: 'Old report',
            status: 'ARCHIVED',
            updatedAt: new Date('2026-05-19T01:00:00.000Z'),
            messages: [{ content: 'Generated report' }],
            attachments: [],
            proposals: [],
            _count: { messages: 2, attachments: 0, proposals: 0 },
          },
        ]),
      },
    };
    const threadedService = new PharmacyAgentService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;

    const result = await threadedService.listSessions({
      id: 'user-1',
      branchId: 'branch-1',
    });

    expect(result.data.map((session: any) => session.id)).toEqual([
      'active-content',
      'active-empty-new',
      'archived-content',
    ]);
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'active-content', hasContent: true }),
        expect.objectContaining({ id: 'active-empty-new', hasContent: false }),
        expect.objectContaining({ id: 'archived-content', hasContent: true }),
      ]),
    );
  });

  it('archives and restores agent threads through session status', async () => {
    const prisma = {
      pharmacyAgentSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'session-1',
          branchId: 'branch-1',
          userId: 'user-1',
          title: 'Old analysis',
          status: 'ACTIVE',
          metadata: { topic: 'stock' },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'session-1',
          title: 'Old analysis',
          status: 'ARCHIVED',
          updatedAt: new Date('2026-05-19T00:00:00.000Z'),
          messages: [],
          proposals: [],
        }),
      },
      pharmacyAgentAuditEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const threadedService = new PharmacyAgentService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;

    const archived = await threadedService.archiveSession('session-1', {
      id: 'user-1',
      branchId: 'branch-1',
    });

    expect(prisma.pharmacyAgentSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1' },
        data: expect.objectContaining({
          status: 'ARCHIVED',
          metadata: expect.objectContaining({
            topic: 'stock',
            archivedBy: 'user-1',
          }),
        }),
      }),
    );
    expect(archived).toMatchObject({
      id: 'session-1',
      title: 'Old analysis',
      status: 'ARCHIVED',
    });
    expect(prisma.pharmacyAgentAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'SESSION_ARCHIVED',
          sessionId: 'session-1',
        }),
      }),
    );
  });

  it('rejects writes to archived threads', () => {
    expect(() => service.assertSessionWritable({ status: 'ARCHIVED' })).toThrow(
      'Restore it before adding messages or attachments',
    );
    expect(() =>
      service.assertSessionWritable({ status: 'ACTIVE' }),
    ).not.toThrow();
  });
});
