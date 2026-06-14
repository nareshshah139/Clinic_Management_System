import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { spawn } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import type { Express } from 'express';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import * as XLSX from 'xlsx';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { PharmacyService } from '../pharmacy/pharmacy.service';
import { DrugService } from '../pharmacy/drug.service';
import { PharmacyPurchaseInvoiceService } from '../pharmacy/pharmacy-purchase-invoice.service';
import { PharmacyPrescriptionQueueService } from '../pharmacy/pharmacy-prescription-queue.service';
import { InventoryService } from '../inventory/inventory.service';
import { ReportsService } from '../reports/reports.service';
import {
  CreatePharmacyAgentSessionDto,
  RejectPharmacyAgentProposalDto,
  SendPharmacyAgentMessageDto,
} from './dto/pharmacy-agent.dto';

type AgentUser = {
  id: string;
  branchId: string;
  role?: UserRole | string;
};

type CodexDataRequest = {
  name: string;
  params?: Record<string, unknown>;
  paramsJson?: string;
};

type CodexProposalAction = {
  actionType: string;
  targetType?: string;
  targetId?: string | null;
  permissionRequired?: string | null;
  expectedVersion?: string | null;
  input?: Record<string, unknown>;
  preview?: Record<string, unknown>;
  inputJson?: string;
  previewJson?: string;
};

type CodexProposal = {
  title?: string;
  summary?: string;
  riskLevel?: string;
  actions?: CodexProposalAction[];
};

type CodexAgentOutput = {
  answer?: string;
  needsFollowUp?: boolean;
  followUpQuestion?: string;
  dataRequests?: CodexDataRequest[];
  chart?: Record<string, unknown> | null;
  report?: Record<string, unknown> | null;
  chartJson?: string;
  reportJson?: string;
  proposals?: CodexProposal[];
};

type AttachmentSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  kind: string;
  summary?: unknown;
};

const CODEX_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string' },
    needsFollowUp: { type: 'boolean' },
    followUpQuestion: { type: 'string' },
    dataRequests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          paramsJson: { type: 'string' },
        },
        required: ['name', 'paramsJson'],
      },
    },
    chartJson: { type: 'string' },
    reportJson: { type: 'string' },
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          riskLevel: { type: 'string' },
          actions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                actionType: { type: 'string' },
                targetType: { type: 'string' },
                targetId: { type: 'string' },
                permissionRequired: { type: 'string' },
                expectedVersion: { type: 'string' },
                inputJson: { type: 'string' },
                previewJson: { type: 'string' },
              },
              required: [
                'actionType',
                'targetType',
                'targetId',
                'permissionRequired',
                'expectedVersion',
                'inputJson',
                'previewJson',
              ],
            },
          },
        },
        required: ['title', 'summary', 'riskLevel', 'actions'],
      },
    },
  },
  required: [
    'answer',
    'needsFollowUp',
    'followUpQuestion',
    'dataRequests',
    'chartJson',
    'reportJson',
    'proposals',
  ],
};

const READ_REQUESTS = new Set([
  'pharmacy_dashboard',
  'low_stock',
  'recent_invoices',
  'prescription_queue',
  'purchase_invoices',
  'inventory_report',
  'drug_search',
  'drug_catalog',
]);

const ACTION_PERMISSIONS: Record<string, string> = {
  create_drug: 'pharmacy:drug:create',
  update_drug: 'pharmacy:drug:update',
  create_inventory_item: 'inventory:item:create',
  update_inventory_item: 'inventory:item:update',
  adjust_stock: 'inventory:adjustment:create',
  create_purchase_invoice_draft: 'pharmacy:purchase-invoice:create',
  review_purchase_invoice: 'pharmacy:purchase-invoice:review',
  commit_purchase_invoice_stock: 'pharmacy:purchase-invoice:commit-stock',
};

const ACTION_TARGETS: Record<string, string> = {
  create_drug: 'drug',
  update_drug: 'drug',
  create_inventory_item: 'inventory_item',
  update_inventory_item: 'inventory_item',
  adjust_stock: 'inventory_item',
  create_purchase_invoice_draft: 'pharmacy_purchase_invoice',
  review_purchase_invoice: 'pharmacy_purchase_invoice',
  commit_purchase_invoice_stock: 'pharmacy_purchase_invoice',
};

const MAX_ACTIVE_AGENT_THREADS = 12;
const MAX_HISTORY_AGENT_THREADS = 30;

@Injectable()
export class PharmacyAgentService implements OnModuleInit {
  private readonly logger = new Logger(PharmacyAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pharmacyService: PharmacyService,
    private readonly drugService: DrugService,
    private readonly purchaseInvoiceService: PharmacyPurchaseInvoiceService,
    private readonly prescriptionQueueService: PharmacyPrescriptionQueueService,
    private readonly inventoryService: InventoryService,
    private readonly reportsService: ReportsService,
  ) {}

  async onModuleInit() {
    await this.ensureAgentPermissions();
  }

  async getCodexStatus() {
    const output = await this.runCodexStatus();
    const loggedIn = output.exitCode === 0 && /logged in/i.test(output.output);
    const usingApiKey = /api key/i.test(output.output);
    return {
      configured: loggedIn && !usingApiKey,
      output: output.output.slice(0, 500),
    };
  }

  async createSession(dto: CreatePharmacyAgentSessionDto, user: AgentUser) {
    const prisma = this.prisma as any;
    const reusable = await prisma.pharmacyAgentSession.findFirst({
      where: {
        branchId: user.branchId,
        userId: user.id,
        status: 'ACTIVE',
        messages: { none: {} },
        attachments: { none: {} },
        proposals: { none: {} },
      },
      orderBy: { updatedAt: 'desc' },
      include: this.sessionDetailInclude(),
    });

    if (reusable) {
      return this.serializeSession(reusable);
    }

    const created = await prisma.pharmacyAgentSession.create({
      data: {
        branchId: user.branchId,
        userId: user.id,
        title: dto.title || 'Agentic Pharmacy',
        metadata: { runtime: 'codex-cli', safety: 'draft_then_approve' },
      },
    });

    await this.audit({
      branchId: user.branchId,
      userId: user.id,
      sessionId: created.id,
      eventType: 'SESSION_CREATED',
      details: { title: created.title },
    });

    return this.getSession(created.id, user);
  }

  async getSession(sessionId: string, user: AgentUser) {
    const prisma = this.prisma as any;
    const session = await prisma.pharmacyAgentSession.findFirst({
      where: { id: sessionId, branchId: user.branchId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 80 },
        attachments: { orderBy: { createdAt: 'desc' }, take: 20 },
        proposals: {
          orderBy: { createdAt: 'desc' },
          include: { actions: { orderBy: { createdAt: 'asc' } } },
          take: 20,
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Agent session not found');
    }

    return this.serializeSession(session);
  }

  async listSessions(user: AgentUser) {
    const prisma = this.prisma as any;
    const sessions = await prisma.pharmacyAgentSession.findMany({
      where: { branchId: user.branchId, userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 80,
      include: this.sessionListInclude(),
    });
    return {
      data: this.visibleSessionList(sessions).map((session: any) =>
        this.serializeSessionListItem(session),
      ),
    };
  }

  async archiveSession(sessionId: string, user: AgentUser) {
    const session = await this.assertSession(sessionId, user);
    if (session.status === 'ARCHIVED')
      return this.serializeSessionListItem(session);

    const updated = await (this.prisma as any).pharmacyAgentSession.update({
      where: { id: session.id },
      data: {
        status: 'ARCHIVED',
        metadata: {
          ...this.objectMetadata(session.metadata),
          archivedAt: new Date().toISOString(),
          archivedBy: user.id,
        },
      },
      include: this.sessionListInclude(),
    });

    await this.audit({
      branchId: user.branchId,
      userId: user.id,
      sessionId: session.id,
      eventType: 'SESSION_ARCHIVED',
      details: { previousStatus: session.status },
    });

    return this.serializeSessionListItem(updated);
  }

  async restoreSession(sessionId: string, user: AgentUser) {
    const session = await this.assertSession(sessionId, user);
    if (session.status === 'ACTIVE')
      return this.serializeSessionListItem(session);

    const updated = await (this.prisma as any).pharmacyAgentSession.update({
      where: { id: session.id },
      data: {
        status: 'ACTIVE',
        metadata: {
          ...this.objectMetadata(session.metadata),
          restoredAt: new Date().toISOString(),
          restoredBy: user.id,
        },
      },
      include: this.sessionListInclude(),
    });

    await this.audit({
      branchId: user.branchId,
      userId: user.id,
      sessionId: session.id,
      eventType: 'SESSION_RESTORED',
      details: { previousStatus: session.status },
    });

    return this.serializeSessionListItem(updated);
  }

  async attachFile(
    sessionId: string,
    file: Express.Multer.File | undefined,
    user: AgentUser,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Upload a non-empty Excel, image, CSV, or PDF file',
      );
    }
    const session = await this.assertSession(sessionId, user);
    this.assertSessionWritable(session);
    const kind = this.detectAttachmentKind(file);
    const storageDir = path.join(
      process.cwd(),
      'uploads',
      'pharmacy-agent',
      session.id,
    );
    await fs.mkdir(storageDir, { recursive: true });

    const safeName = this.safeFileName(
      file.originalname || `attachment-${Date.now()}`,
    );
    const diskName = `${Date.now()}-${randomUUID()}-${safeName}`;
    const storagePath = path.join(storageDir, diskName);
    await fs.writeFile(storagePath, file.buffer);

    const processed = await this.summarizeAttachment(
      file,
      storagePath,
      kind,
      storageDir,
    );
    const prisma = this.prisma as any;
    const attachment = await prisma.pharmacyAgentAttachment.create({
      data: {
        sessionId: session.id,
        branchId: user.branchId,
        userId: user.id,
        fileName: safeName,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size || file.buffer.length,
        kind,
        storagePath,
        extractedText: processed.extractedText || null,
        summary: processed.summary,
      },
    });

    await this.audit({
      branchId: user.branchId,
      userId: user.id,
      sessionId: session.id,
      eventType: 'ATTACHMENT_UPLOADED',
      details: {
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        kind,
      },
    });

    return this.serializeAttachment(attachment);
  }

  async sendMessage(
    sessionId: string,
    dto: SendPharmacyAgentMessageDto,
    user: AgentUser,
  ) {
    const session = await this.assertSession(sessionId, user);
    this.assertSessionWritable(session);
    const prisma = this.prisma as any;
    const selectedAttachmentIds = Array.from(new Set(dto.attachmentIds || []));
    const attachments = selectedAttachmentIds.length
      ? await prisma.pharmacyAgentAttachment.findMany({
          where: {
            id: { in: selectedAttachmentIds },
            sessionId: session.id,
            branchId: user.branchId,
          },
        })
      : [];

    await prisma.pharmacyAgentMessage.create({
      data: {
        sessionId: session.id,
        branchId: user.branchId,
        userId: user.id,
        role: 'USER',
        content: dto.message.trim(),
        attachmentIds: selectedAttachmentIds.length
          ? JSON.stringify(selectedAttachmentIds)
          : null,
      },
    });

    const run = await prisma.pharmacyAgentRun.create({
      data: {
        sessionId: session.id,
        branchId: user.branchId,
        userId: user.id,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      const baseContext = await this.buildBaseContext(user.branchId);
      const attachmentSummaries = attachments.map((a: any) =>
        this.serializeAttachmentSummary(a),
      );
      const imagePaths = this.collectAttachmentImagePaths(attachments);
      let output = await this.runCodexAgent({
        userMessage: dto.message,
        attachmentSummaries,
        baseContext,
        fulfilledData: [],
        imagePaths,
      });

      const dataRequests = this.normalizeDataRequests(output.dataRequests);
      if (dataRequests.length > 0) {
        const fulfilledData = await this.executeDataRequests(
          dataRequests,
          user.branchId,
        );
        output = await this.runCodexAgent({
          userMessage: dto.message,
          attachmentSummaries,
          baseContext,
          fulfilledData,
          imagePaths,
        });
      }

      const proposals = await this.stageProposals({
        sessionId: session.id,
        runId: run.id,
        branchId: user.branchId,
        userId: user.id,
        proposals: output.proposals || [],
      });

      const assistantStructured = {
        chart: output.chart || null,
        report: output.report || null,
        proposals: proposals.map((proposal: any) => proposal.id),
        needsFollowUp: Boolean(output.needsFollowUp),
        followUpQuestion: output.followUpQuestion || null,
      };
      const assistantMessage = await prisma.pharmacyAgentMessage.create({
        data: {
          sessionId: session.id,
          branchId: user.branchId,
          role: 'ASSISTANT',
          content:
            output.answer ||
            output.followUpQuestion ||
            'I reviewed the pharmacy context and prepared the result.',
          structured: assistantStructured,
        },
      });

      await prisma.pharmacyAgentRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          output: this.redact({
            ...output,
            stagedProposalIds: proposals.map((proposal: any) => proposal.id),
          }),
        },
      });
      await prisma.pharmacyAgentSession.update({
        where: { id: session.id },
        data: {
          title: session.title || this.deriveTitle(dto.message),
          updatedAt: new Date(),
        },
      });

      await this.audit({
        branchId: user.branchId,
        userId: user.id,
        sessionId: session.id,
        runId: run.id,
        eventType: 'MESSAGE_COMPLETED',
        details: { proposalCount: proposals.length },
      });

      return {
        message: this.serializeMessage(assistantMessage),
        proposals: proposals.map((proposal: any) =>
          this.serializeProposal(proposal),
        ),
        chart: output.chart || null,
        report: output.report || null,
        runId: run.id,
      };
    } catch (error: any) {
      this.logger.error(`Agent run failed: ${error?.message || error}`);
      await prisma.pharmacyAgentRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error: String(error?.message || error).slice(0, 2000),
        },
      });
      const assistantMessage = await prisma.pharmacyAgentMessage.create({
        data: {
          sessionId: session.id,
          branchId: user.branchId,
          role: 'ASSISTANT',
          content:
            'The embedded Codex run could not complete. Check the server Codex login/status and try again. No database changes were made.',
          structured: { error: String(error?.message || error).slice(0, 500) },
        },
      });
      return {
        message: this.serializeMessage(assistantMessage),
        proposals: [],
        chart: null,
        report: null,
        runId: run.id,
      };
    }
  }

  async getRun(runId: string, user: AgentUser) {
    const prisma = this.prisma as any;
    const run = await prisma.pharmacyAgentRun.findFirst({
      where: { id: runId, branchId: user.branchId },
    });
    if (!run) throw new NotFoundException('Agent run not found');
    return run;
  }

  async listProposals(sessionId: string, user: AgentUser) {
    await this.assertSession(sessionId, user);
    const prisma = this.prisma as any;
    const proposals = await prisma.pharmacyAgentProposal.findMany({
      where: { sessionId, branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
      include: { actions: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      data: proposals.map((proposal: any) => this.serializeProposal(proposal)),
    };
  }

  async applyProposal(proposalId: string, user: AgentUser) {
    const prisma = this.prisma as any;
    const proposal = await prisma.pharmacyAgentProposal.findFirst({
      where: { id: proposalId, branchId: user.branchId },
      include: { actions: { orderBy: { createdAt: 'asc' } } },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(`Proposal is ${proposal.status}`);
    }

    for (const action of proposal.actions) {
      this.assertSupportedAction(action.actionType);
      const requiredPermission =
        action.permissionRequired || ACTION_PERMISSIONS[action.actionType];
      const allowed = await this.hasPermission(user, requiredPermission);
      if (!allowed) {
        throw new ForbiddenException(
          `Missing permission required to apply ${action.actionType}: ${requiredPermission}`,
        );
      }
      await this.assertExpectedVersion(action, user.branchId);
    }

    const results: any[] = [];
    for (const action of proposal.actions) {
      try {
        await prisma.pharmacyAgentProposalAction.update({
          where: { id: action.id },
          data: { status: 'APPLYING' },
        });
        const result = await this.applyAction(action, user);
        await prisma.pharmacyAgentProposalAction.update({
          where: { id: action.id },
          data: { status: 'APPLIED', result: this.redact(result) },
        });
        results.push({ actionId: action.id, result });
      } catch (error: any) {
        await prisma.pharmacyAgentProposalAction.update({
          where: { id: action.id },
          data: {
            status: 'FAILED',
            error: String(error?.message || error).slice(0, 1000),
          },
        });
        await prisma.pharmacyAgentProposal.update({
          where: { id: proposal.id },
          data: { status: 'FAILED' },
        });
        throw error;
      }
    }

    const updated = await prisma.pharmacyAgentProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'APPLIED',
        appliedBy: user.id,
        appliedAt: new Date(),
      },
      include: { actions: { orderBy: { createdAt: 'asc' } } },
    });

    await this.audit({
      branchId: user.branchId,
      userId: user.id,
      sessionId: proposal.sessionId,
      proposalId: proposal.id,
      eventType: 'PROPOSAL_APPLIED',
      details: { actionCount: proposal.actions.length },
    });

    return { proposal: this.serializeProposal(updated), results };
  }

  async rejectProposal(
    proposalId: string,
    dto: RejectPharmacyAgentProposalDto,
    user: AgentUser,
  ) {
    const prisma = this.prisma as any;
    const proposal = await prisma.pharmacyAgentProposal.findFirst({
      where: { id: proposalId, branchId: user.branchId },
      include: { actions: { orderBy: { createdAt: 'asc' } } },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(`Proposal is ${proposal.status}`);
    }

    const updated = await prisma.pharmacyAgentProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'REJECTED',
        rejectedBy: user.id,
        rejectedAt: new Date(),
        rejectionReason: dto.reason || null,
        actions: {
          updateMany: {
            where: { proposalId: proposal.id },
            data: { status: 'REJECTED' },
          },
        },
      },
      include: { actions: { orderBy: { createdAt: 'asc' } } },
    });

    await this.audit({
      branchId: user.branchId,
      userId: user.id,
      sessionId: proposal.sessionId,
      proposalId: proposal.id,
      eventType: 'PROPOSAL_REJECTED',
      details: { reason: dto.reason || null },
    });

    return this.serializeProposal(updated);
  }

  private async assertSession(sessionId: string, user: AgentUser) {
    const prisma = this.prisma as any;
    const session = await prisma.pharmacyAgentSession.findFirst({
      where: { id: sessionId, branchId: user.branchId },
    });
    if (!session) throw new NotFoundException('Agent session not found');
    return session;
  }

  private assertSessionWritable(session: any) {
    if (session.status === 'ARCHIVED') {
      throw new BadRequestException(
        'This agent thread is in history. Restore it before adding messages or attachments.',
      );
    }
  }

  private objectMetadata(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private sessionDetailInclude() {
    return {
      messages: { orderBy: { createdAt: 'asc' }, take: 80 },
      attachments: { orderBy: { createdAt: 'desc' }, take: 20 },
      proposals: {
        orderBy: { createdAt: 'desc' },
        include: { actions: { orderBy: { createdAt: 'asc' } } },
        take: 20,
      },
    };
  }

  private sessionListInclude() {
    return {
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      attachments: { select: { id: true }, take: 1 },
      proposals: {
        where: { status: 'PENDING_REVIEW' },
        select: { id: true },
      },
      _count: {
        select: {
          messages: true,
          attachments: true,
          proposals: true,
        },
      },
    };
  }

  private visibleSessionList(sessions: any[]) {
    const active = sessions.filter((session) => session.status !== 'ARCHIVED');
    const history = sessions.filter((session) => session.status === 'ARCHIVED');
    const activeWithContent = active.filter((session) =>
      this.hasVisibleSessionContent(session),
    );
    const activeDrafts = active.filter(
      (session) => !this.hasVisibleSessionContent(session),
    );
    const visibleActive = [
      ...activeWithContent.slice(0, MAX_ACTIVE_AGENT_THREADS),
      ...activeDrafts.slice(0, 1),
    ];
    const visibleHistory = history
      .filter((session) => this.hasVisibleSessionContent(session))
      .slice(0, MAX_HISTORY_AGENT_THREADS);

    return [...visibleActive, ...visibleHistory].sort((a, b) =>
      this.compareUpdatedDesc(a, b),
    );
  }

  private hasVisibleSessionContent(session: any) {
    const count = session?._count || {};
    const countedContent =
      Number(count.messages || 0) +
      Number(count.attachments || 0) +
      Number(count.proposals || 0);
    return (
      countedContent > 0 ||
      Boolean(session?.lastMessage) ||
      Boolean(session?.messages?.length) ||
      Boolean(session?.attachments?.length) ||
      Boolean(session?.proposals?.length)
    );
  }

  private compareUpdatedDesc(a: any, b: any) {
    const aTime = new Date(a?.updatedAt || 0).getTime();
    const bTime = new Date(b?.updatedAt || 0).getTime();
    return (
      (Number.isFinite(bTime) ? bTime : 0) -
      (Number.isFinite(aTime) ? aTime : 0)
    );
  }

  private async buildBaseContext(branchId: string) {
    const prisma = this.prisma as any;
    const [dashboard, lowStock, recentInvoices, pendingTasks] =
      await Promise.all([
        this.pharmacyService.getDashboard(branchId),
        prisma.inventoryItem.findMany({
          where: {
            branchId,
            status: 'ACTIVE',
            stockStatus: { in: ['LOW_STOCK', 'OUT_OF_STOCK'] },
          },
          select: {
            id: true,
            name: true,
            manufacturer: true,
            currentStock: true,
            reorderLevel: true,
            batchNumber: true,
            expiryDate: true,
            updatedAt: true,
          },
          orderBy: [{ currentStock: 'asc' }, { updatedAt: 'desc' }],
          take: 10,
        }),
        prisma.pharmacyInvoice.findMany({
          where: { branchId },
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            balanceAmount: true,
            paymentStatus: true,
            status: true,
            invoiceDate: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
        prisma.pharmacyDispenseTask.findMany({
          where: {
            branchId,
            status: {
              in: ['QUEUED', 'IN_REVIEW', 'PARTIALLY_FILLED', 'READY_TO_BILL'],
            },
          },
          select: {
            id: true,
            patientName: true,
            doctorName: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
      ]);

    return this.trimForPrompt({
      generatedAt: new Date().toISOString(),
      dashboard,
      lowStock,
      recentInvoices,
      pendingTasks,
      safety:
        'All database writes must be returned as proposals. The backend will not apply them until user approval.',
    });
  }

  private async executeDataRequests(
    requests: CodexDataRequest[],
    branchId: string,
  ) {
    const results: any[] = [];
    for (const request of requests.slice(0, 5)) {
      if (!READ_REQUESTS.has(request.name)) {
        results.push({
          name: request.name,
          error: 'Unsupported read request',
        });
        continue;
      }
      try {
        results.push({
          name: request.name,
          data: await this.executeDataRequest(
            request.name,
            request.params || {},
            branchId,
          ),
        });
      } catch (error: any) {
        results.push({
          name: request.name,
          error: String(error?.message || error),
        });
      }
    }
    return this.trimForPrompt(results);
  }

  private async executeDataRequest(
    name: string,
    params: Record<string, unknown>,
    branchId: string,
  ) {
    const prisma = this.prisma as any;
    switch (name) {
      case 'pharmacy_dashboard':
        return this.pharmacyService.getDashboard(branchId);
      case 'low_stock':
        return prisma.inventoryItem.findMany({
          where: {
            branchId,
            status: 'ACTIVE',
            stockStatus: { in: ['LOW_STOCK', 'OUT_OF_STOCK'] },
          },
          orderBy: [{ currentStock: 'asc' }, { updatedAt: 'desc' }],
          take: this.toLimit(params.limit, 20),
        });
      case 'recent_invoices':
        return prisma.pharmacyInvoice.findMany({
          where: { branchId },
          include: {
            items: { take: 10 },
            patient: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: this.toLimit(params.limit, 20),
        });
      case 'prescription_queue':
        return this.prescriptionQueueService.findAll(
          { page: 1, limit: this.toLimit(params.limit, 20) } as any,
          branchId,
        );
      case 'purchase_invoices':
        return prisma.pharmacyPurchaseInvoice.findMany({
          where: { branchId },
          include: { items: { orderBy: { lineNumber: 'asc' }, take: 15 } },
          orderBy: { createdAt: 'desc' },
          take: this.toLimit(params.limit, 15),
        });
      case 'inventory_report':
        return this.reportsService.generateInventoryReport(
          params as any,
          branchId,
        );
      case 'drug_search':
        return this.drugService.findAll(
          {
            search: String(params.search || params.q || params.query || ''),
            page: 1,
            limit: this.toLimit(params.limit, 20),
            sortBy: this.normalizeDrugCatalogSort(params.sortBy),
            sortOrder:
              String(
                params.sortOrder || params.order || 'asc',
              ).toLowerCase() === 'desc'
                ? 'desc'
                : 'asc',
          } as any,
          branchId,
        );
      case 'drug_catalog':
        return this.getDrugCatalog(params, branchId);
      default:
        throw new BadRequestException(`Unsupported data request: ${name}`);
    }
  }

  private async getDrugCatalog(
    params: Record<string, unknown>,
    branchId: string,
  ) {
    const prisma = this.prisma as any;
    const sortBy = this.normalizeDrugCatalogSort(params.sortBy);
    const sortOrder =
      String(params.sortOrder || params.order || 'asc').toLowerCase() === 'desc'
        ? 'desc'
        : 'asc';
    const limit = this.toCatalogLimit(params.limit, 200);
    const search = String(params.search || params.q || '').trim();
    const startsWith = String(params.startsWith || params.prefix || '').trim();

    const where: any = {
      branchId,
      isActive: true,
      isDiscontinued: false,
    };

    if (startsWith) {
      where.name = { startsWith, mode: 'insensitive' };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { manufacturerName: { contains: search, mode: 'insensitive' } },
        { composition1: { contains: search, mode: 'insensitive' } },
        { composition2: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [drugs, total] = await Promise.all([
      prisma.drug.findMany({
        where,
        select: {
          id: true,
          name: true,
          price: true,
          manufacturerName: true,
          type: true,
          packSizeLabel: true,
          composition1: true,
          composition2: true,
          category: true,
          dosageForm: true,
          strength: true,
          barcode: true,
          sku: true,
          updatedAt: true,
        },
        orderBy: { [sortBy]: sortOrder },
        take: limit,
      }),
      prisma.drug.count({ where }),
    ]);

    return this.trimForPrompt({
      total,
      returned: drugs.length,
      truncated: total > drugs.length,
      sortBy,
      sortOrder,
      filters: {
        search: search || null,
        startsWith: startsWith || null,
      },
      currency: 'INR',
      drugs: drugs.map((drug: any) => ({
        id: drug.id,
        name: drug.name,
        price: drug.price,
        manufacturerName: drug.manufacturerName,
        type: drug.type,
        packSizeLabel: drug.packSizeLabel,
        composition1: drug.composition1,
        composition2: drug.composition2,
        category: drug.category,
        dosageForm: drug.dosageForm,
        strength: drug.strength,
        barcode: drug.barcode,
        sku: drug.sku,
        updatedAt: drug.updatedAt,
      })),
    });
  }

  private async runCodexAgent(input: {
    userMessage: string;
    attachmentSummaries: AttachmentSummary[];
    baseContext: unknown;
    fulfilledData: unknown;
    imagePaths: string[];
  }): Promise<CodexAgentOutput> {
    const schemaPath = path.join(
      os.tmpdir(),
      `pharmacy-agent-codex-schema-${process.pid}.json`,
    );
    const outputPath = path.join(
      os.tmpdir(),
      `pharmacy-agent-codex-output-${process.pid}-${Date.now()}.json`,
    );
    await fs.writeFile(schemaPath, JSON.stringify(CODEX_OUTPUT_SCHEMA));

    const prompt = this.buildCodexPrompt(input);
    const codex = process.env.PHARMACY_AGENT_CODEX_PATH || 'codex';
    const timeoutMs = Number(
      process.env.PHARMACY_AGENT_CODEX_TIMEOUT_MS || 60000,
    );
    const args = [
      'exec',
      '--ephemeral',
      '--skip-git-repo-check',
      '--ignore-user-config',
      '--ignore-rules',
      '-s',
      'read-only',
      '--output-schema',
      schemaPath,
      '-o',
      outputPath,
      '-C',
      this.repoRoot(),
      ...input.imagePaths.flatMap((imagePath) => ['-i', imagePath]),
      '-',
    ];

    const { stdout, stderr, exitCode } = await this.spawnWithInput(
      codex,
      args,
      prompt,
      timeoutMs,
    );

    if (exitCode !== 0) {
      throw new ServiceUnavailableException(
        `Codex exited with ${exitCode}: ${stderr || stdout}`.slice(0, 1000),
      );
    }

    const outputText =
      (await fs.readFile(outputPath, 'utf8').catch(() => '')) || stdout || '{}';
    const parsed = this.parseJsonObject(outputText);
    return this.normalizeCodexOutput(parsed);
  }

  private buildCodexPrompt(input: {
    userMessage: string;
    attachmentSummaries: AttachmentSummary[];
    baseContext: unknown;
    fulfilledData: unknown;
  }) {
    return [
      'You are Agentic Pharmacy embedded inside a clinic management application.',
      'You help with pharmacy operations only: dashboard Q&A, invoices, prescription queue, dispense tasks, drug master, inventory, purchase invoices/OCR, purchase ledger, partner sales, compliance, packages, charts, and reports.',
      'Return only JSON matching the provided output schema.',
      'Use empty strings for unused string fields and empty arrays for unused arrays.',
      'For paramsJson, chartJson, reportJson, inputJson, and previewJson, put serialized JSON as a string. Use "{}" when empty.',
      'Never claim that a database write has been applied. For every create/update/delete/commit/payment/stock change, return a proposal action only.',
      'If you need more app data, use dataRequests with names from: pharmacy_dashboard, low_stock, recent_invoices, prescription_queue, purchase_invoices, inventory_report, drug_search, drug_catalog.',
      'For drug master questions about all drugs, prices, cheapest/most expensive drugs, names starting with a prefix, or ordering by price, request drug_catalog. Example paramsJson: {"sortBy":"price","sortOrder":"desc","limit":100}. Use {"startsWith":"A"} for prefix questions.',
      'Allowed proposal actionType values are: create_drug, update_drug, create_inventory_item, update_inventory_item, adjust_stock, create_purchase_invoice_draft, review_purchase_invoice, commit_purchase_invoice_stock.',
      'For charts, return a Recharts-compatible chart object with type, title, xKey, yKeys, and data.',
      'Do not mention secrets, tokens, filesystem internals, or implementation details.',
      '',
      '<user_message>',
      input.userMessage,
      '</user_message>',
      '',
      '<attachment_summaries>',
      JSON.stringify(this.redact(input.attachmentSummaries), null, 2),
      '</attachment_summaries>',
      '',
      '<base_context>',
      JSON.stringify(this.redact(input.baseContext), null, 2),
      '</base_context>',
      '',
      '<fulfilled_data>',
      JSON.stringify(this.redact(input.fulfilledData), null, 2),
      '</fulfilled_data>',
    ].join('\n');
  }

  private async spawnWithInput(
    command: string,
    args: string[],
    input: string,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env: this.codexEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new ServiceUnavailableException('Codex run timed out'));
      }, timeoutMs);
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode });
      });
      child.stdin.write(input);
      child.stdin.end();
    });
  }

  private async runCodexStatus() {
    try {
      const result = await this.spawnWithInput(
        process.env.PHARMACY_AGENT_CODEX_PATH || 'codex',
        ['login', 'status'],
        '',
        10000,
      );
      return {
        exitCode: result.exitCode,
        output: `${result.stdout}\n${result.stderr}`.trim(),
      };
    } catch (error: any) {
      return { exitCode: 1, output: String(error?.message || error) };
    }
  }

  private codexEnv() {
    const allowedKeys = [
      'PATH',
      'HOME',
      'CODEX_HOME',
      'CODEX_ACCESS_TOKEN',
      'SHELL',
      'LANG',
      'LC_ALL',
      'TERM',
      'TMPDIR',
      'NODE_EXTRA_CA_CERTS',
    ];
    const env: Record<string, string> = {};
    for (const key of allowedKeys) {
      const value = process.env[key];
      if (value) env[key] = value;
    }
    return env;
  }

  private async stageProposals(input: {
    sessionId: string;
    runId: string;
    branchId: string;
    userId: string;
    proposals: CodexProposal[];
  }) {
    const prisma = this.prisma as any;
    const staged: any[] = [];
    for (const rawProposal of (input.proposals || []).slice(0, 5)) {
      const actions = this.normalizeProposalActions(rawProposal.actions || []);
      if (actions.length === 0) continue;
      const proposal = await prisma.pharmacyAgentProposal.create({
        data: {
          sessionId: input.sessionId,
          runId: input.runId,
          branchId: input.branchId,
          userId: input.userId,
          title: String(rawProposal.title || 'Review pharmacy update').slice(
            0,
            160,
          ),
          summary: String(
            rawProposal.summary || 'Codex proposed a pharmacy database update.',
          ).slice(0, 2000),
          riskLevel: this.normalizeRisk(rawProposal.riskLevel),
          actions: {
            create: actions.map((action) => ({
              branchId: input.branchId,
              actionType: action.actionType,
              targetType:
                action.targetType ||
                ACTION_TARGETS[action.actionType] ||
                'unknown',
              targetId: action.targetId || null,
              permissionRequired:
                action.permissionRequired ||
                ACTION_PERMISSIONS[action.actionType] ||
                null,
              expectedVersion: action.expectedVersion
                ? new Date(action.expectedVersion)
                : undefined,
              input: this.redact(action.input || {}),
              preview: this.redact(action.preview || {}),
            })),
          },
        },
        include: { actions: { orderBy: { createdAt: 'asc' } } },
      });
      staged.push(proposal);
    }
    return staged;
  }

  private normalizeProposalActions(actions: CodexProposalAction[]) {
    return (actions || [])
      .filter((action) => action && typeof action.actionType === 'string')
      .slice(0, 20)
      .map((action) => ({
        actionType: action.actionType.trim(),
        targetType:
          action.targetType || ACTION_TARGETS[action.actionType] || 'unknown',
        targetId: action.targetId || null,
        permissionRequired:
          action.permissionRequired ||
          ACTION_PERMISSIONS[action.actionType] ||
          null,
        expectedVersion: action.expectedVersion || null,
        input: action.input || {},
        preview: action.preview || {},
      }));
  }

  private normalizeDataRequests(requests?: CodexDataRequest[]) {
    return (requests || [])
      .filter((request) => request?.name && READ_REQUESTS.has(request.name))
      .slice(0, 5);
  }

  private normalizeCodexOutput(output: any): CodexAgentOutput {
    return {
      answer: String(output?.answer || ''),
      needsFollowUp: Boolean(output?.needsFollowUp),
      followUpQuestion: output?.followUpQuestion
        ? String(output.followUpQuestion)
        : undefined,
      dataRequests: Array.isArray(output?.dataRequests)
        ? output.dataRequests.map((request: any) => ({
            name: request.name,
            params: this.parseJsonField(
              request.paramsJson,
              request.params || {},
            ),
          }))
        : [],
      chart:
        output?.chart && typeof output.chart === 'object'
          ? output.chart
          : this.parseOptionalJsonObject(output?.chartJson),
      report:
        output?.report && typeof output.report === 'object'
          ? output.report
          : this.parseOptionalJsonObject(output?.reportJson),
      proposals: Array.isArray(output?.proposals)
        ? output.proposals.map((proposal: any) => ({
            ...proposal,
            actions: Array.isArray(proposal.actions)
              ? proposal.actions.map((action: any) => ({
                  ...action,
                  input: this.parseJsonField(
                    action.inputJson,
                    action.input || {},
                  ),
                  preview: this.parseJsonField(
                    action.previewJson,
                    action.preview || {},
                  ),
                  targetId: action.targetId || null,
                  permissionRequired: action.permissionRequired || null,
                  expectedVersion: action.expectedVersion || null,
                }))
              : [],
          }))
        : [],
    };
  }

  private async applyAction(action: any, user: AgentUser) {
    const input = action.input || {};
    switch (action.actionType) {
      case 'create_drug':
        return this.drugService.create(input as any, user.branchId);
      case 'update_drug':
        if (!action.targetId)
          throw new BadRequestException('targetId is required');
        return this.drugService.update(
          action.targetId,
          input as any,
          user.branchId,
        );
      case 'create_inventory_item':
        return this.inventoryService.createInventoryItem(
          input as any,
          user.branchId,
        );
      case 'update_inventory_item':
        if (!action.targetId)
          throw new BadRequestException('targetId is required');
        return this.inventoryService.updateInventoryItem(
          action.targetId,
          input as any,
          user.branchId,
        );
      case 'adjust_stock':
        return this.inventoryService.adjustStock(
          input as any,
          user.branchId,
          user.id,
        );
      case 'create_purchase_invoice_draft':
        return this.purchaseInvoiceService.createDraft(
          input as any,
          user.branchId,
          user.id,
        );
      case 'review_purchase_invoice':
        if (!action.targetId)
          throw new BadRequestException('targetId is required');
        return this.purchaseInvoiceService.markReviewed(
          action.targetId,
          input as any,
          user.branchId,
        );
      case 'commit_purchase_invoice_stock':
        if (!action.targetId)
          throw new BadRequestException('targetId is required');
        return this.purchaseInvoiceService.commitStock(
          action.targetId,
          user.branchId,
          user.id,
        );
      default:
        throw new BadRequestException(
          `Unsupported action: ${action.actionType}`,
        );
    }
  }

  private assertSupportedAction(actionType: string) {
    if (!ACTION_PERMISSIONS[actionType]) {
      throw new BadRequestException(
        `Unsupported proposal action: ${actionType}`,
      );
    }
  }

  private async assertExpectedVersion(action: any, branchId: string) {
    if (!action.expectedVersion || !action.targetId) return;
    const model = this.modelForTarget(action.targetType);
    if (!model) return;
    const record = await (this.prisma as any)[model].findFirst({
      where: { id: action.targetId, branchId },
      select: { id: true, updatedAt: true },
    });
    if (!record) throw new NotFoundException(`${action.targetType} not found`);
    const expected = new Date(action.expectedVersion).getTime();
    const actual = new Date(record.updatedAt).getTime();
    if (Number.isFinite(expected) && actual !== expected) {
      throw new BadRequestException(
        `${action.targetType} changed after Codex prepared this proposal. Refresh and ask again.`,
      );
    }
  }

  private modelForTarget(targetType: string) {
    const map: Record<string, string> = {
      drug: 'drug',
      inventory_item: 'inventoryItem',
      pharmacy_purchase_invoice: 'pharmacyPurchaseInvoice',
    };
    return map[targetType];
  }

  private async hasPermission(user: AgentUser, permission?: string | null) {
    if (!permission) return true;
    if (
      user.role === UserRole.OWNER ||
      user.role === UserRole.ADMIN ||
      user.role === UserRole.DOCTOR
    ) {
      return true;
    }
    const prisma = this.prisma as any;
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { permissions: true, role: true },
    });
    if (!dbUser) return false;
    const userPermissions = this.parsePermissions(dbUser.permissions);
    const role = await prisma.role.findFirst({
      where: { name: dbUser.role },
      select: { permissions: true },
    });
    const rolePermissions = this.parsePermissions(role?.permissions);
    return new Set([...rolePermissions, ...userPermissions]).has(permission);
  }

  private parsePermissions(value?: string | null): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item) => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private detectAttachmentKind(file: Express.Multer.File) {
    const name = file.originalname || '';
    const mime = file.mimetype || '';
    if (/\.(xlsx|xls)$/i.test(name)) return 'spreadsheet';
    if (/\.csv$/i.test(name) || mime === 'text/csv') return 'spreadsheet';
    if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
    if (/^image\//i.test(mime)) return 'image';
    throw new BadRequestException(
      'Only Excel, CSV, image, and PDF files are supported',
    );
  }

  private async summarizeAttachment(
    file: Express.Multer.File,
    storagePath: string,
    kind: string,
    storageDir: string,
  ): Promise<{ summary: Record<string, unknown>; extractedText?: string }> {
    if (kind === 'spreadsheet') {
      const workbook = XLSX.read(file.buffer, {
        type: 'buffer',
        cellDates: true,
      });
      const sheetName = workbook.SheetNames[0];
      const rows = sheetName
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(
            workbook.Sheets[sheetName],
            { defval: '', raw: false },
          )
        : [];
      const columns = rows[0] ? Object.keys(rows[0]) : [];
      return {
        summary: {
          sheetNames: workbook.SheetNames,
          firstSheet: sheetName || null,
          rowCount: rows.length,
          columns,
          sampleRows: rows.slice(0, 20),
          truncated: rows.length > 20,
        },
      };
    }

    if (kind === 'image') {
      const imagePath = await this.normalizeImage(
        storagePath,
        storageDir,
        'image-1.jpg',
      );
      return {
        summary: {
          imagePaths: [imagePath],
          note: 'Image normalized for Codex vision input.',
        },
      };
    }

    const { pdf } = await import('pdf-to-img');
    const imagePaths: string[] = [];
    const maxPages = Number(process.env.PHARMACY_AGENT_MAX_PDF_PAGES || 3);
    let pageCount = 0;
    for await (const image of await pdf(file.buffer, { scale: 2 })) {
      pageCount += 1;
      if (imagePaths.length < maxPages) {
        const rawPath = path.join(storageDir, `pdf-page-${pageCount}.png`);
        await fs.writeFile(rawPath, Buffer.from(image));
        imagePaths.push(
          await this.normalizeImage(
            rawPath,
            storageDir,
            `pdf-page-${pageCount}.jpg`,
          ),
        );
      }
    }
    return {
      summary: {
        pageCount,
        includedPageCount: imagePaths.length,
        imagePaths,
        truncated: pageCount > imagePaths.length,
      },
    };
  }

  private async normalizeImage(
    sourcePath: string,
    storageDir: string,
    outputName: string,
  ) {
    const outputPath = path.join(storageDir, outputName);
    await sharp(sourcePath, { failOn: 'error' })
      .rotate()
      .resize({
        width: 1800,
        height: 1800,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(outputPath);
    return outputPath;
  }

  private collectAttachmentImagePaths(attachments: any[]) {
    const paths: string[] = [];
    for (const attachment of attachments) {
      const summary = attachment.summary || {};
      const imagePaths = Array.isArray(summary.imagePaths)
        ? summary.imagePaths
        : [];
      for (const imagePath of imagePaths) {
        if (
          typeof imagePath === 'string' &&
          imagePath.startsWith(process.cwd())
        ) {
          paths.push(imagePath);
        }
      }
    }
    return paths.slice(0, 6);
  }

  private serializeSession(session: any) {
    return {
      id: session.id,
      title: session.title,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: (session.messages || []).map((message: any) =>
        this.serializeMessage(message),
      ),
      attachments: (session.attachments || []).map((attachment: any) =>
        this.serializeAttachment(attachment),
      ),
      proposals: (session.proposals || []).map((proposal: any) =>
        this.serializeProposal(proposal),
      ),
    };
  }

  private serializeSessionListItem(session: any) {
    return {
      id: session.id,
      title: session.title,
      status: session.status,
      updatedAt: session.updatedAt,
      lastMessage: session.messages?.[0]?.content || null,
      pendingProposalCount: session.proposals?.length || 0,
      hasContent: this.hasVisibleSessionContent(session),
    };
  }

  private serializeMessage(message: any) {
    return {
      id: message.id,
      role: String(message.role || '').toLowerCase(),
      content: message.content,
      structured: message.structured || null,
      attachmentIds: this.parseJsonArray(message.attachmentIds),
      createdAt: message.createdAt,
    };
  }

  private serializeAttachment(attachment: any) {
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      kind: attachment.kind,
      status: attachment.status,
      summary: attachment.summary || null,
      createdAt: attachment.createdAt,
    };
  }

  private serializeAttachmentSummary(attachment: any): AttachmentSummary {
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      kind: attachment.kind,
      summary: attachment.summary || null,
    };
  }

  private serializeProposal(proposal: any) {
    return {
      id: proposal.id,
      title: proposal.title,
      summary: proposal.summary,
      riskLevel: proposal.riskLevel,
      status: proposal.status,
      createdAt: proposal.createdAt,
      appliedAt: proposal.appliedAt,
      rejectedAt: proposal.rejectedAt,
      actions: (proposal.actions || []).map((action: any) => ({
        id: action.id,
        actionType: action.actionType,
        targetType: action.targetType,
        targetId: action.targetId,
        permissionRequired: action.permissionRequired,
        input: action.input,
        preview: action.preview,
        status: action.status,
        result: action.result,
        error: action.error,
      })),
    };
  }

  private async audit(input: {
    sessionId?: string;
    runId?: string;
    proposalId?: string;
    branchId: string;
    userId?: string;
    eventType: string;
    details?: Record<string, unknown>;
  }) {
    try {
      await (this.prisma as any).pharmacyAgentAuditEvent.create({
        data: {
          sessionId: input.sessionId,
          runId: input.runId,
          proposalId: input.proposalId,
          branchId: input.branchId,
          userId: input.userId,
          eventType: input.eventType,
          details: this.redact(input.details || {}),
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to write agent audit event: ${error}`);
    }
  }

  private async ensureAgentPermissions() {
    const prisma = this.prisma as any;
    const permissions = [
      {
        id: 'perm_pharmacy_agent_use',
        name: 'pharmacy:agent:use',
        description: 'Use the embedded Agentic Pharmacy assistant',
        resource: 'pharmacy_agent',
        action: 'use',
      },
      {
        id: 'perm_pharmacy_agent_proposal_apply',
        name: 'pharmacy:agent:proposal:apply',
        description: 'Apply reviewed Agentic Pharmacy database proposals',
        resource: 'pharmacy_agent',
        action: 'proposal:apply',
      },
      {
        id: 'perm_pharmacy_drug_create',
        name: 'pharmacy:drug:create',
        description: 'Create pharmacy drug master records',
        resource: 'pharmacy_drug',
        action: 'create',
      },
    ];

    try {
      await Promise.all(
        permissions.map((permission) =>
          prisma.permission.upsert({
            where: { id: permission.id },
            create: { ...permission, isActive: true },
            update: {
              name: permission.name,
              description: permission.description,
              resource: permission.resource,
              action: permission.action,
              isActive: true,
            },
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(`Agent permission bootstrap skipped: ${error}`);
    }
  }

  private trimForPrompt(value: unknown, maxChars = 20000) {
    const json = JSON.stringify(this.redact(value));
    if (json.length <= maxChars) return value;
    return {
      truncated: true,
      jsonPreview: json.slice(0, maxChars),
    };
  }

  private redact<T>(value: T): T {
    const sensitive =
      /token|password|secret|apikey|api_key|authorization|cookie|jwt/i;
    const visit = (current: any): any => {
      if (current === null || current === undefined) return current;
      if (Array.isArray(current)) return current.map(visit);
      if (typeof current === 'object') {
        const out: any = {};
        for (const [key, val] of Object.entries(current)) {
          out[key] = sensitive.test(key) ? '[REDACTED]' : visit(val);
        }
        return out;
      }
      return current;
    };
    return visit(value);
  }

  private parseJsonObject(content: string) {
    const trimmed = String(content || '').trim();
    if (!trimmed) return {};
    try {
      return JSON.parse(trimmed);
    } catch {
      const first = trimmed.indexOf('{');
      const last = trimmed.lastIndexOf('}');
      if (first >= 0 && last > first) {
        return JSON.parse(trimmed.slice(first, last + 1));
      }
      throw new Error('Codex returned non-JSON output');
    }
  }

  private parseJsonField(value: unknown, fallback: Record<string, unknown>) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    const text = String(value || '').trim();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : fallback;
    } catch {
      return fallback;
    }
  }

  private parseOptionalJsonObject(value: unknown) {
    const parsed = this.parseJsonField(value, {});
    return Object.keys(parsed).length > 0 ? parsed : null;
  }

  private parseJsonArray(value?: string | null) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private toLimit(value: unknown, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(Math.floor(parsed), 50);
  }

  private toCatalogLimit(value: unknown, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(Math.floor(parsed), 500);
  }

  private normalizeDrugCatalogSort(value: unknown) {
    const sortBy = String(value || 'name');
    return [
      'name',
      'price',
      'manufacturerName',
      'category',
      'type',
      'updatedAt',
      'createdAt',
    ].includes(sortBy)
      ? sortBy
      : 'name';
  }

  private normalizeRisk(value?: string) {
    const risk = String(value || 'MEDIUM').toUpperCase();
    return ['LOW', 'MEDIUM', 'HIGH'].includes(risk) ? risk : 'MEDIUM';
  }

  private safeFileName(fileName: string) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
  }

  private deriveTitle(message: string) {
    return (
      message.trim().replace(/\s+/g, ' ').slice(0, 80) || 'Agentic Pharmacy'
    );
  }

  private repoRoot() {
    return path.basename(process.cwd()) === 'backend'
      ? path.resolve(process.cwd(), '..')
      : process.cwd();
  }
}
