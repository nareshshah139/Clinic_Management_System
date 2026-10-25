import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { localDatabase } from '../../../shared/testing/local-database';
import { InventoryWorkflowService } from '../inventory-workflow.service';

const databaseTests = process.env.INVENTORY_WORKFLOW_RECOVERY_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Workflow recovery fences with PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;
  let actor: {id:string;branchId:string;role:string};
  let itemId: string;
  let document: any;
  let writer: InventoryWorkflowService;
  let recovery: InventoryWorkflowService;
  beforeAll(async () => {
    fixture = await localDatabase(process.env.INVENTORY_WORKFLOW_RECOVERY_TEST_DATABASE_URL!);
    prisma = fixture.prisma;
    const branch = await prisma.branch.create({data:{name:'Synthetic workflow recovery',address:'Synthetic'}});
    const user = await prisma.user.create({data:{email:`workflow-${randomUUID()}@example.invalid`,password:'no-login',firstName:'Synthetic',lastName:'Recovery',role:'OWNER',branchId:branch.id}});
    actor = {id:user.id,branchId:branch.id,role:'OWNER'};
  }, 120000);
  beforeEach(async () => {
    const item = await prisma.inventoryItem.create({data:{branchId:actor.branchId,name:'Recovery race batch',type:'SUPPLY',costPrice:1,sellingPrice:1,unit:'PIECES',currentStock:10,heldStock:0}});
    itemId = item.id;
    document = await prisma.inventoryWorkflowDocument.create({data:{branchId:actor.branchId,kind:'LOSS',reference:randomUUID(),requestKey:randomUUID(),createdBy:actor.id,payload:{reason:'Verified damaged goods',date:new Date().toISOString().slice(0,10),lines:[{id:'loss-line',inventoryId:itemId,quantity:2,unitPrice:1}]}}});
    writer = new InventoryWorkflowService(prisma as any);
    recovery = new InventoryWorkflowService(prisma as any);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {await fixture?.cleanup();});
  it('fences a transition paused after its old-version read without changing stock', async () => {
    let reached: ()=>void = ()=>{}, release: ()=>void = ()=>{};
    const reading = new Promise<void>(resolve=>{reached=resolve;});
    const resume = new Promise<void>(resolve=>{release=resolve;});
    const authorize = writer.authorize.bind(writer);
    let first = true;
    jest.spyOn(writer,'authorize').mockImplementation(async (...args) => {
      await authorize(...args);
      if(first){first=false;reached();await resume;}
    });
    const pending = writer.transition(actor,document.id,{version:1,action:'POST'}).then(value=>({value}),error=>({error}));
    await reading;
    let settled: any, resolutionError: unknown;
    try { settled = await (recovery as any).resolveOutcome(actor,document.id,{version:1}); }
    catch (error) { resolutionError = error; }
    finally { release(); }
    const original = await pending;
    if (resolutionError) throw resolutionError;
    expect(original).toHaveProperty('error');
    expect(settled).toMatchObject({id:document.id,status:'DRAFT',version:2,effects:[]});
    expect(settled.events).toEqual([expect.objectContaining({action:'RESOLVE_OUTCOME',fromStatus:'DRAFT',toStatus:'DRAFT',version:2,actorId:actor.id,detail:expect.objectContaining({stockEffect:false,fencedVersion:1})})]);
    expect((await prisma.inventoryItem.findUniqueOrThrow({where:{id:itemId}})).currentStock).toBe(10);
    expect(await prisma.stockTransaction.count({where:{itemId}})).toBe(0);
    const repeated = await (recovery as any).resolveOutcome(actor,document.id,{version:1});
    expect(repeated.version).toBe(2);
    expect(repeated.events).toHaveLength(1);
  });
  it('returns an already committed transition without adding a second effect or recovery event', async () => {
    await writer.transition(actor,document.id,{version:1,action:'POST'});
    const settled = await (recovery as any).resolveOutcome(actor,document.id,{version:1});
    expect(settled).toMatchObject({id:document.id,status:'POSTED',version:2});
    expect(settled.events.map((event:any)=>event.action)).toEqual(['POST']);
    expect(settled.effects).toHaveLength(1);
    expect((await prisma.inventoryItem.findUniqueOrThrow({where:{id:itemId}})).currentStock).toBe(8);
    expect(await prisma.stockTransaction.count({where:{itemId}})).toBe(1);
  });
  it('rejects an impossible future revision and missing branch without modifying the document', async () => {
    await expect((recovery as any).resolveOutcome(actor,document.id,{version:2})).rejects.toThrow('revision');
    await expect((recovery as any).resolveOutcome({...actor,branchId:'unrelated-branch'},document.id,{version:1})).rejects.toThrow();
    expect((await prisma.inventoryWorkflowDocument.findUniqueOrThrow({where:{id:document.id}})).version).toBe(1);
    expect(await prisma.inventoryWorkflowEvent.count({where:{documentId:document.id}})).toBe(0);
    expect((await prisma.inventoryItem.findUniqueOrThrow({where:{id:itemId}})).currentStock).toBe(10);
  });
  it('requires actual-kind write permission to fence while retaining read-only lookup access', async () => {
    const reader = await prisma.user.create({data:{email:`reader-${randomUUID()}@example.invalid`,password:'no-login',firstName:'Synthetic',lastName:'Recovery',role:'PHARMACIST',branchId:actor.branchId,permissions:JSON.stringify(['inventory:item:read'])}});
    const readActor={id:reader.id,branchId:actor.branchId,role:'PHARMACIST'};
    const found=await (recovery as any).documentByRequest(readActor,document.requestKey);
    expect(found.id).toBe(document.id);
    await expect((recovery as any).resolveOutcome(readActor,document.id,{version:1})).rejects.toThrow('inventory:transaction:create');
    expect((await prisma.inventoryWorkflowDocument.findUniqueOrThrow({where:{id:document.id}})).version).toBe(1);
    expect(await prisma.inventoryWorkflowEvent.count({where:{documentId:document.id}})).toBe(0);
  });
});
