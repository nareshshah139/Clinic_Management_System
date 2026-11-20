import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { localDatabase } from '../../../shared/testing/local-database';
import { gate } from '../../../shared/testing/interleave';
import { PharmacyAgentService } from '../pharmacy-agent.service';
import { PharmacyService } from '../../pharmacy/pharmacy.service';
import { DrugService } from '../../pharmacy/drug.service';
import { PharmacyPurchaseInvoiceService } from '../../pharmacy/pharmacy-purchase-invoice.service';
import { PharmacyPrescriptionQueueService } from '../../pharmacy/pharmacy-prescription-queue.service';
import { InventoryService } from '../../inventory/inventory.service';
import { InventoryItemRequestService } from '../../inventory/inventory-item-request.service';
import { ReportsService } from '../../reports/reports.service';

const databaseTests = process.env.FORMAL_REPLAY_TEST_DATABASE_URL ? describe : describe.skip;

const NO_CHANGES_REPLY =
  'The embedded Codex run could not complete. Check the server Codex login/status and try again. No database changes were made.';

const sku = (code: string) => `${code}-${randomUUID().slice(0, 8)}`;
const newItem = (name: string, code: string, expectedVersion = '') => ({
  actionType: 'create_inventory_item',
  targetType: 'inventory_item',
  targetId: '',
  permissionRequired: '',
  expectedVersion,
  inputJson: JSON.stringify({ name, sku: sku(code), type: 'MEDICINE', unit: 'STRIPS', costPrice: 5, sellingPrice: 9 }),
  previewJson: '{}',
  itemNaming: { form: '', medicineName: '', strength: '', isCombination: false },
});
const twoItems = () => ({
  title: 'Add Telma and Dolo',
  summary: 'Two new stock lines',
  riskLevel: 'low',
  actions: [newItem('Telma 40 mg tablet', 'TELMA-40'), newItem('Dolo 650 mg tablet', 'DOLO-650')],
});
const codexAnswer = (proposals: unknown[]) => ({ answer: 'I prepared the new items for your review.', proposals });

type Codex = Record<string, unknown> | 'hang' | 'fail';
type Pharmacist = { id: string; branchId: string; role: string };

const settled = (p: Promise<unknown>) => p.then(() => undefined, () => undefined);
const reached = (g: { arrived: Promise<void> }, p: Promise<unknown>) => Promise.race([g.arrived, settled(p)]);
const outcome = (p: Promise<any>) => p.then((r) => r.status as string, (e) => e.constructor.name as string);

function throwingOn<T extends object>(client: T, target: string): T {
  const [model, method] = target.split('.');
  return new Proxy(client, {
    get(c: any, key) {
      const value = c[key];
      if (key !== model) return typeof value === 'function' ? value.bind(c) : value;
      return new Proxy(value, {
        get(d: any, m) {
          if (m === method) return async () => { throw new Error('Connection reset by peer'); };
          return typeof d[m] === 'function' ? d[m].bind(d) : d[m];
        },
      });
    },
  });
}

databaseTests('Pharmacy agent formal model replays (verification/state-machines/pharmacy-agent)', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    fixture = await localDatabase(process.env.FORMAL_REPLAY_TEST_DATABASE_URL!);
    prisma = fixture.prisma;
  }, 120_000);
  afterAll(() => fixture?.cleanup());

  function agent(client: any, codex: Codex = codexAnswer([twoItems()]), onCodex: () => void = () => {}) {
    const inventory = new InventoryService(client);
    const drugs = new DrugService(client);
    const service = new PharmacyAgentService(
      client,
      new PharmacyService(client),
      drugs,
      new PharmacyPurchaseInvoiceService(client),
      new PharmacyPrescriptionQueueService(client, drugs),
      inventory,
      new ReportsService(client),
      new InventoryItemRequestService(client, inventory),
    );
    (service as any).spawnWithInput = async () => {
      onCodex();
      if (codex === 'hang') return new Promise(() => {});
      if (codex === 'fail') return { stdout: '', stderr: 'codex: not logged in', exitCode: 1 };
      return { stdout: JSON.stringify(codex), stderr: '', exitCode: 0 };
    };
    return service;
  }

  async function pharmacy() {
    const branch = await prisma.branch.create({ data: { name: `Agent ${randomUUID()}`, address: 'Synthetic' } });
    const row = await prisma.user.create({
      data: {
        email: `pharmacist-${randomUUID()}@example.invalid`,
        password: 'no-login',
        firstName: 'Synthetic',
        lastName: 'Pharmacist',
        role: 'PHARMACIST',
        branchId: branch.id,
      },
    });
    const user: Pharmacist = { id: row.id, branchId: branch.id, role: 'PHARMACIST' };
    const session = await prisma.pharmacyAgentSession.create({ data: { branchId: branch.id, userId: row.id } });
    return { user, sessionId: session.id };
  }

  const ask = (service: PharmacyAgentService, sessionId: string, user: Pharmacist) =>
    service.sendMessage(sessionId, { message: 'Add Telma 40 and Dolo 650 to stock' } as any, user as any);

  async function answerPosted() {
    const { user, sessionId } = await pharmacy();
    const thread = gate(prisma, 'pharmacyAgentSession.update');
    const reply = ask(agent(thread.client), sessionId, user);
    await thread.arrived;
    const [proposal] = (await agent(prisma).listProposals(sessionId, user as any)).data;
    return { user, sessionId, proposal, proposalId: proposal.id as string, thread, reply };
  }

  async function statuses(proposalId: string) {
    const row = await prisma.pharmacyAgentProposal.findUniqueOrThrow({
      where: { id: proposalId },
      include: { actions: { orderBy: { createdAt: 'asc' } } },
    });
    return { proposal: row.status as string, actions: row.actions.map((a) => a.status).sort() };
  }

  const itemRequests = (branchId: string) => prisma.inventoryItemRequest.count({ where: { branchId } });

  async function failedRunStillOffersProposal() {
    const { user, sessionId } = await pharmacy();
    const unparseable = { ...twoItems(), title: 'Fix Dolo price', actions: [newItem('Dolo 650 mg tablet', 'DOLO-650', 'tomorrow')] };
    const reply = await ask(agent(prisma, codexAnswer([twoItems(), unparseable])), sessionId, user);
    const listed = await agent(prisma).listProposals(sessionId, user as any);
    return {
      reply: reply.message.content,
      run: (await agent(prisma).getRun(reply.runId, user as any)).status,
      pending: listed.data.filter((p: any) => p.status === 'PENDING_REVIEW').map((p: any) => p.title),
    };
  }

  it.failing('NoChangesMeansNoChanges: a run that says nothing changed leaves no proposal to apply', async () => {
    expect(await failedRunStillOffersProposal()).toEqual({ reply: NO_CHANGES_REPLY, run: 'FAILED', pending: [] });
  });

  it('today: NoChangesMeansNoChanges, the failed run says nothing changed and its first proposal waits for review', async () => {
    expect(await failedRunStillOffersProposal()).toEqual({ reply: NO_CHANGES_REPLY, run: 'FAILED', pending: ['Add Telma and Dolo'] });
  });
  async function twoApplies() {
    const { user, proposalId, thread, reply } = await answerPosted();
    const first = gate(prisma, 'pharmacyAgentProposalAction.update', { nth: 2 });
    const applyA = agent(first.client).applyProposal(proposalId, user as any);
    await reached(first, applyA);
    const second = gate(prisma, 'pharmacyAgentProposalAction.update', { nth: 2 });
    const applyB = agent(second.client).applyProposal(proposalId, user as any);
    await reached(second, applyB);
    const requests = await itemRequests(user.branchId);
    first.release();
    second.release();
    thread.release();
    await Promise.all([settled(applyA), settled(applyB), settled(reply)]);
    return { requests };
  }

  it.failing('AppliedOnce: a second Apply on the same proposal does not repeat its first action', async () => {
    expect(await twoApplies()).toEqual({ requests: 1 });
  });

  it('today: AppliedOnce, two Apply clicks each file the first item request', async () => {
    expect(await twoApplies()).toEqual({ requests: 2 });
  });

  async function failureThenRejection() {
    const { user, proposal, proposalId, thread, reply } = await answerPosted();
    for (const action of proposal.actions)
      await prisma.inventoryItem.create({
        data: { ...action.input, branchId: user.branchId, type: 'MEDICINE', unit: 'STRIPS', costPrice: 5, sellingPrice: 9 },
      });
    const applying = gate(prisma, 'pharmacyAgentProposal.update');
    const applyA = agent(applying.client).applyProposal(proposalId, user as any);
    await reached(applying, applyA);
    const rejecting = gate(prisma, 'pharmacyAgentProposal.update');
    const rejectB = agent(rejecting.client).rejectProposal(proposalId, { reason: 'Not needed' } as any, user as any);
    await reached(rejecting, rejectB);
    applying.release();
    const apply = await outcome(applyA);
    rejecting.release();
    await settled(rejectB);
    thread.release();
    await settled(reply);
    return { apply, proposal: (await statuses(proposalId)).proposal };
  }

  it.failing('DecisionIsFinal: a proposal that failed to apply stays failed when a rejection lands after it', async () => {
    expect(await failureThenRejection()).toEqual({ apply: 'ConflictException', proposal: 'FAILED' });
  });

  it('today: DecisionIsFinal, the late rejection turns the failed proposal into rejected', async () => {
    expect(await failureThenRejection()).toEqual({ apply: 'ConflictException', proposal: 'REJECTED' });
  });

  async function rejectionAfterAChange() {
    const { user, proposalId, thread, reply } = await answerPosted();
    const applying = gate(prisma, 'pharmacyAgentProposalAction.update', { nth: 2 });
    const applyA = agent(applying.client).applyProposal(proposalId, user as any);
    await reached(applying, applyA);
    const reject = await outcome(agent(prisma).rejectProposal(proposalId, { reason: 'Not needed' } as any, user as any));
    const seen = { reject, requests: await itemRequests(user.branchId), ...(await statuses(proposalId)) };
    applying.release();
    thread.release();
    await Promise.all([settled(applyA), settled(reply)]);
    return seen;
  }

  it.failing('RejectedMeansNotApplied: Reject is refused once an action has changed the pharmacy', async () => {
    const seen = await rejectionAfterAChange();
    expect({ reject: seen.reject, requests: seen.requests }).toEqual({ reject: 'BadRequestException', requests: 1 });
  });

  it('today: RejectedMeansNotApplied, Reject marks an action rejected after it filed its item request', async () => {
    expect(await rejectionAfterAChange()).toEqual({
      reject: 'REJECTED',
      requests: 1,
      proposal: 'REJECTED',
      actions: ['REJECTED', 'REJECTED'],
    });
  });

  const statusesAgree = ({ proposal, actions }: { proposal: string; actions: string[] }) =>
    proposal === 'APPLIED' ? actions.every((s) => s === 'APPLIED')
    : proposal === 'REJECTED' ? actions.every((s) => s === 'REJECTED')
    : proposal === 'FAILED' ? actions.every((s) => s !== 'PENDING_REVIEW' && s !== 'APPLYING')
    : true;

  async function applyWritesOverRejection() {
    const { user, proposalId, thread, reply } = await answerPosted();
    const beforeWrite = gate(prisma, 'pharmacyAgentProposalAction.update');
    const afterWrite = gate(beforeWrite.client, 'pharmacyAgentProposalAction.update', { when: 'after' });
    const applyA = agent(afterWrite.client).applyProposal(proposalId, user as any);
    await reached(beforeWrite, applyA);
    await settled(agent(prisma).rejectProposal(proposalId, { reason: 'Not needed' } as any, user as any));
    beforeWrite.release();
    await reached(afterWrite, applyA);
    const seen = await statuses(proposalId);
    afterWrite.release();
    thread.release();
    await Promise.all([settled(applyA), settled(reply)]);
    return seen;
  }

  it.failing('StatusesAgree: an apply that read the proposal before a rejection does not start actions on it', async () => {
    expect(statusesAgree(await applyWritesOverRejection())).toBe(true);
  });

  it('today: StatusesAgree, a rejected proposal shows its first action being applied', async () => {
    expect(await applyWritesOverRejection()).toEqual({ proposal: 'REJECTED', actions: ['APPLYING', 'REJECTED'] });
  });

  async function threadUpdateFails() {
    const { user, sessionId } = await pharmacy();
    const reply = await ask(agent(throwingOn(prisma, 'pharmacyAgentSession.update')), sessionId, user);
    return {
      reply: reply.message.content,
      run: (await agent(prisma).getRun(reply.runId, user as any)).status,
    };
  }

  it.failing('RunEndsOnce: a completed run stays completed when the thread update after it fails', async () => {
    expect((await threadUpdateFails()).run).toBe('COMPLETED');
  });

  it('today: RunEndsOnce, the completed run is rewritten as failed and the agent says nothing changed', async () => {
    expect(await threadUpdateFails()).toEqual({ reply: NO_CHANGES_REPLY, run: 'FAILED' });
  });

  async function restartDuringCodex() {
    const { user, sessionId } = await pharmacy();
    let codexStarted!: () => void;
    const started = new Promise<void>((resolve) => (codexStarted = resolve));
    void settled(ask(agent(prisma, 'hang', codexStarted), sessionId, user));
    await started;
    await agent(prisma).onModuleInit();
    const run = await prisma.pharmacyAgentRun.findFirstOrThrow({ where: { sessionId } });
    return run.status;
  }

  it.failing('RunLeavesRunning: after a restart kills the request, its run does not stay running', async () => {
    expect(await restartDuringCodex()).toBe('FAILED');
  });

  it('today: RunLeavesRunning, the run killed during Codex stays running after the restart', async () => {
    expect(await restartDuringCodex()).toBe('RUNNING');
  });

  async function restartDuringApply() {
    const { user, sessionId } = await pharmacy();
    const touch = gate(throwingOn(prisma, 'pharmacyAgentSession.update'), 'pharmacyAgentSession.update');
    const failedWrite = gate(touch.client, 'pharmacyAgentRun.update', { nth: 2 });
    const reply = ask(agent(failedWrite.client), sessionId, user);
    await reached(touch, reply);
    const [proposal] = (await agent(prisma).listProposals(sessionId, user as any)).data;
    const beforeWrite = gate(prisma, 'pharmacyAgentProposalAction.update');
    const afterWrite = gate(beforeWrite.client, 'pharmacyAgentProposalAction.update', { when: 'after' });
    const applyA = agent(afterWrite.client).applyProposal(proposal.id, user as any);
    await reached(beforeWrite, applyA);
    touch.release();
    await reached(failedWrite, reply);
    const rejecting = gate(prisma, 'pharmacyAgentProposal.update');
    const rejectB = agent(rejecting.client).rejectProposal(proposal.id, { reason: 'Not needed' } as any, user as any);
    await reached(rejecting, rejectB);
    failedWrite.release();
    const answer = await reply;
    beforeWrite.release();
    await reached(afterWrite, applyA);
    void settled(applyA);
    void settled(rejectB);
    await agent(prisma).onModuleInit();
    const { actions } = await statuses(proposal.id);
    return { reply: answer.message.content, applying: actions.filter((s) => s === 'APPLYING').length };
  }

  it.failing('ApplyingEnds: after a restart kills an apply, no action stays shown as applying', async () => {
    expect((await restartDuringApply()).applying).toBe(0);
  });

  it('today: ApplyingEnds, the action the restart interrupted stays applying', async () => {
    expect(await restartDuringApply()).toEqual({ reply: NO_CHANGES_REPLY, applying: 1 });
  });
});
