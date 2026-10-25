from collections import defaultdict, deque
from dataclasses import dataclass, replace, asdict
from pathlib import Path
from itertools import product
import hashlib
import json
import z3

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BOUND = 3
COUNT_STATUSES = ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED', 'CANCELLED', 'REVERSED')

@dataclass(frozen=True)
class Stock:
    q: int
    h: int
    p: int
    status: str
    snapshot: int
    observation: int
    current_version: bool
    checkpoint: int = -1
    reason: bool = False

@dataclass(frozen=True)
class Access:
    read: bool = True
    count: bool = True
    approver: bool = True
    disposition: bool = True
    selectable_source_capacity: bool = True
    physical_evidence: bool = True
    service_available: bool = True
    approval_required_for_variance: bool = True

ACTION_MAP = {
 'refresh': {'ui':'Check saved status / Retry loading', 'ui_source':'frontend/src/components/inventory/WorkflowDocumentEditor.tsx', 'backend':'GET /inventory/workspace/documents/:id', 'source':'backend/src/modules/inventory/inventory-workflow.service.ts'},
 'recount_chain': {'ui':'Start fresh count; follow an existing child and repeat to a fresh leaf', 'ui_source':'frontend/src/components/inventory/WorkflowDocumentEditor.tsx', 'backend':'POST /inventory/workspace/documents/:id/transition RECOUNT', 'source':'backend/src/modules/inventory/inventory-workflow.service.ts'},
 'observe': {'ui':'Enter truthful physical count and required reason', 'ui_source':'frontend/src/components/inventory/WorkflowDocumentEditor.tsx', 'backend':'PATCH /inventory/workspace/documents/:id', 'source':'backend/src/modules/inventory/inventory-workflow.service.ts'},
 'submit': {'ui':'Submit count', 'ui_source':'frontend/src/components/inventory/WorkflowDocumentEditor.tsx', 'backend':'POST /inventory/workspace/documents/:id/transition POST', 'source':'backend/src/modules/inventory/inventory-workflow.service.ts'},
 'approve': {'ui':'Approve document', 'ui_source':'frontend/src/components/inventory/WorkflowDocumentEditor.tsx', 'backend':'POST /inventory/workspace/documents/:id/transition APPROVE', 'source':'backend/src/modules/inventory/inventory-workflow.service.ts'},
 'post': {'ui':'Apply approved count', 'ui_source':'frontend/src/components/inventory/WorkflowDocumentEditor.tsx', 'backend':'POST /inventory/workspace/documents/:id/transition POST', 'source':'backend/src/modules/inventory/inventory-workflow.service.ts'},
 'dispose': {'ui':'Blocked stock -> source -> source-linked loss', 'ui_source':'frontend/src/components/inventory/WorkspaceStock.tsx', 'backend':'POST source-linked LOSS document and POST transition', 'source':'backend/src/modules/inventory/inventory-workflow.service.ts'},
 'cancel': {'ui':'Cancel document', 'ui_source':'frontend/src/components/inventory/WorkflowDocumentEditor.tsx', 'backend':'POST /inventory/workspace/documents/:id/transition CANCEL', 'source':'backend/src/modules/inventory/inventory-workflow.service.ts'},
}


def reconciled(s):
    return s.q == s.p and s.checkpoint == s.p and 0 <= s.h <= s.q


def successors(s, a):
    yield 'wait', s
    if not (a.service_available and a.read):
        return
    if not s.current_version:
        yield 'refresh', replace(s, current_version=True)
    if a.disposition and a.selectable_source_capacity and a.physical_evidence and s.p < s.h:
        missing = s.h - s.p
        yield 'dispose', replace(s, q=s.q-missing, h=s.p, checkpoint=-1)
    if not (a.count and s.current_version):
        return
    yield 'recount_chain', replace(s, status='DRAFT', snapshot=s.q, observation=-1)
    if s.status == 'DRAFT' and a.physical_evidence:
        yield 'observe', replace(s, observation=s.p, reason=True)
    if s.status in ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED'):
        yield 'cancel', replace(s, status='CANCELLED')
    if not s.reason or s.snapshot != s.q or s.observation != s.p or s.p < s.h:
        return
    if s.status == 'AWAITING_APPROVAL' and a.approver:
        yield 'approve', replace(s, status='APPROVED')
    if s.status in ('DRAFT', 'APPROVED'):
        if s.status == 'DRAFT' and s.q != s.p and a.approval_required_for_variance and not a.approver:
            yield 'submit', replace(s, status='AWAITING_APPROVAL')
        else:
            yield 'post', replace(s, q=s.p, status='POSTED', checkpoint=s.p)


def initial_states():
    for q in range(BOUND+1):
        for h in range(q+1):
            for p, status, version, reason in product(range(BOUND+1), COUNT_STATUSES, (False, True), (False, True)):
                for snapshot, observation in product({q, q+1}, {-2, -1, p}):
                    yield Stock(q,h,p,status,snapshot,observation,version,reason=reason)


def check_stock(name, access, disabled_actions=()):
    seeds = set(initial_states())
    edges, predecessors = {}, defaultdict(set)
    pending = deque(seeds)
    reached = set(seeds)
    while pending:
        s=pending.popleft()
        edges[s]=[(action,t) for action,t in successors(s,access) if action not in disabled_actions]
        for action,t in edges[s]:
            assert 0 <= t.h <= t.q <= BOUND, (action,s,t)
            if action == 'post':
                assert s.current_version and s.snapshot == s.q and s.observation == s.p
                assert t.q == s.p and t.checkpoint == s.p
            if action == 'recount_chain':
                assert (t.q,t.h,t.snapshot,t.observation)==(s.q,s.h,s.q,-1)
            predecessors[t].add(s)
            if t not in reached:
                reached.add(t);pending.append(t)
    winners = {s for s in reached if reconciled(s)}
    distance = {s:0 for s in winners}
    queue=deque(winners)
    while queue:
        target=queue.popleft()
        for s in predecessors[target]:
            if s not in winners:
                winners.add(s);distance[s]=distance[target]+1;queue.append(s)
    losers = reached - winners
    assert all(t in losers for s in losers for _,t in edges[s]), 'EF complement must be closed'
    witnesses={}
    for status in COUNT_STATUSES:
        start=Stock(3,2,1,status,4,-1,False)
        if start not in winners:
            witnesses[status]={'status':'NO_PATH','state':asdict(start)};continue
        trace=[];s=start
        while distance[s]:
            action,t=next((label,t) for label,t in edges[s] if distance.get(t,10**9)<distance[s])
            trace.append({'action':action,'from':asdict(s),'to':asdict(t)});s=t
        witnesses[status]={'status':'PATH','trace':trace}
    representative=sorted((s for s in losers if s.status == 'DRAFT' and s.observation == -1 and s.current_version),key=lambda s:(s.q,s.h,s.p,s.status,s.snapshot,s.observation,s.current_version))[:3]
    return {
      'profile':name,'access':asdict(access),'states':len(reached),'edges':sum(map(len,edges.values())),
      'AG_EF_reconciled':not losers,'recoverable':len(winners),'no_path':len(losers),
      'max_shortest_macro_path':max(distance.values(),default=0),'witnesses':witnesses,
      'counterexamples':[{'state':asdict(s),'enabled':sorted({a for a,_ in edges[s]})} for s in representative],
      'AF_reconciled':False,'AF_counterexample':'Any unreconciled state -> wait -> wait forever',
    }


def prove(name, assumptions, conclusion):
    solver=z3.Solver()
    solver.add(*assumptions,z3.Not(conclusion))
    outcome=solver.check()
    assert outcome == z3.unsat, (name,str(outcome),str(solver.model()) if outcome==z3.sat else '')
    (HERE/(name+'.smt2')).write_text(solver.to_smt2())
    return {'name':name,'result':'UNSAT','meaning':'No integer counterexample under stated assumptions'}


def arithmetic():
    q,h,p,d,r,c,o,signed,old_ledger=z3.Ints('q h p d r c other signed old_ledger')
    invariant=[q>=0,h>=0,h<=q]
    cases=[]
    cases.append(prove('movement_safety',invariant+[r>=0,r<=h,q+d>=h-r],z3.And(q+d>=0,h-r>=0,h-r<=q+d)))
    cases.append(prove('count_convergence',invariant+[p>=h],z3.And(q+(p-q)==p,0<=h,h<=p)))
    cases.append(prove('held_disposition_then_count',invariant+[p>=0,p<h,d==h-p],z3.And(q-d>=h-d,h-d==p,(q-d)+(p-(q-d))==p)))
    cases.append(prove('compensation_stock_safety',[o>=0,c>=0,q>=o],z3.And(q+c>=0,0<=o+c,o+c<=q+c)))
    cases.append(prove('checkpoint_agreement',[p>=0,q==p+signed,q+d>=0],q+d==p+(signed+d)))
    cases.append(prove('count_does_not_rewrite_old_gap',[q>=0,p>=0],p-(old_ledger+(p-q))==q-old_ledger))
    return cases


def intake():
    """
    @cc [owner:nareshshah139,label:verification] intake-evidence-partition
    Each delegated evidence state MUST have only its compatible outcome. Missing or conflicting
    historical links and lost originals without an exact invoice MUST NOT witness no-stock success.
    """
    outcomes={
      'NO_HISTORY':'NO_STOCK_WRITTEN', 'EXACT_DRAFT':'DRAFT_REVIEW',
      'EXACT_COMMITTED':'COMMITTED', 'MISSING_LINK':'RETRY_REJECTED',
      'CONFLICTING_LINKS':'RETRY_REJECTED', 'LOST_SOURCE':'RETRY_REJECTED',
    }
    def evidence_state(prior,link,sources_complete):
        if link in ('EXACT_DRAFT','EXACT_COMMITTED'):
            return link
        if link=='CONFLICTING_LINKS':
            return 'CONFLICTING_LINKS'
        if link=='MISSING_LINK':
            return 'MISSING_LINK'
        if not sources_complete:
            return 'LOST_SOURCE'
        return 'NO_HISTORY' if prior in ('ABSENT','RUNNING') else 'MISSING_LINK'
    cases=[{'prior':prior,'invoice_evidence':link,'retained_sources_complete':complete,
            'evidence':evidence_state(prior,link,complete)}
      for prior,link,complete in product(('ABSENT','RUNNING','INVOICE_SAVED'),
        ('NONE','EXACT_DRAFT','EXACT_COMMITTED','MISSING_LINK','CONFLICTING_LINKS'),(False,True))]
    def safe(case,outcome):
        no_history=(case['prior'] in ('ABSENT','RUNNING') and case['invoice_evidence']=='NONE'
          and case['retained_sources_complete'])
        if outcome=='NO_STOCK_WRITTEN':
            return no_history
        if outcome in ('DRAFT_REVIEW','COMMITTED'):
            return case['invoice_evidence']=={'DRAFT_REVIEW':'EXACT_DRAFT','COMMITTED':'EXACT_COMMITTED'}[outcome]
        return outcome=='RETRY_REJECTED' and not no_history and case['invoice_evidence'] not in ('EXACT_DRAFT','EXACT_COMMITTED')
    for case in cases:
        case['outcome']=outcomes[case['evidence']]
        assert safe(case,case['outcome']),case
    assert {case['evidence'] for case in cases}==set(outcomes)
    unsafe_mutations={
      'lost_originals_as_no_stock':lambda case: 'NO_STOCK_WRITTEN' if case['evidence']=='LOST_SOURCE' else case['outcome'],
      'missing_history_as_no_stock':lambda case: 'NO_STOCK_WRITTEN' if case['evidence']=='MISSING_LINK' else case['outcome'],
      'conflicting_links_as_saved':lambda case: 'DRAFT_REVIEW' if case['evidence']=='CONFLICTING_LINKS' else case['outcome'],
      'committed_invoice_as_draft':lambda case: 'DRAFT_REVIEW' if case['evidence']=='EXACT_COMMITTED' else case['outcome'],
    }
    safety_mutations=[]
    for name,mutate in unsafe_mutations.items():
        violations=[{**case,'mutated_outcome':mutate(case)} for case in cases if not safe(case,mutate(case))]
        assert violations,name
        safety_mutations.append({'mutation':name,'detected':True,'counterexamples':violations})
    nodes=('RUNNING_NO_HISTORY','ABSENT_ATTRIBUTED','LEGACY_RETAINED','MISSING_RETAINED',
      'MISSING_DIRECT_URL','DRAFT_REVIEW','REVIEWED','INCOMPLETE_PAGES','WRONG_DOCUMENT','PAGE_LIMIT','FIELD_BLOCKED','HISTORICAL_STOCK_HOLD','REVIEWED_LINKED_RECEIPT','DUPLICATE_DRAFT','DUPLICATE_COMMITTED','STALE_DRAFT','STALE_COMMITTED',
      'NO_STOCK_WRITTEN','RETRY_REJECTED','COMMITTED','CANCELLED')+tuple(
        prefix+evidence for prefix in ('UNKNOWN_','DELEGATED_') for evidence in outcomes)
    terminal={'NO_STOCK_WRITTEN','RETRY_REJECTED','COMMITTED','CANCELLED'}
    transitions=[
      ('MISSING_DIRECT_URL','MISSING_RETAINED','Initial read failure retains exact invoice','missing_entry'),
      ('RUNNING_NO_HISTORY','NO_STOCK_WRITTEN','Resolve interrupted import','owner'),
      ('ABSENT_ATTRIBUTED','NO_STOCK_WRITTEN','Resolve original attempt','owner'),
      ('RUNNING_NO_HISTORY','DELEGATED_NO_HISTORY','Open or copy recovery handoff','entry'),
      ('ABSENT_ATTRIBUTED','DELEGATED_NO_HISTORY','Retain original operator reference','attribution'),
      ('MISSING_RETAINED','DELEGATED_MISSING_LINK','Open exact recovery reference','entry'),
      ('LEGACY_RETAINED','RETRY_REJECTED','Recover legacy or missing invoice','recovery'),
      ('MISSING_RETAINED','RETRY_REJECTED','Recover legacy or missing invoice','owner_recovery'),
      ('DRAFT_REVIEW','REVIEWED','Review complete original','review'),
      ('DRAFT_REVIEW','CANCELLED','Reject unposted invoice','review'),
      ('REVIEWED','COMMITTED','Add to stock','commit'),
      ('REVIEWED','DRAFT_REVIEW','Reopen review','review'),
      ('INCOMPLETE_PAGES','DRAFT_REVIEW','Enter complete invoice manually','create'),
      ('WRONG_DOCUMENT','DRAFT_REVIEW','Upload correct invoice or verified manual entry','create'),
      ('WRONG_DOCUMENT','CANCELLED','Reject this upload','review'),
      ('PAGE_LIMIT','DRAFT_REVIEW','Enter complete invoice manually','create'),
      ('FIELD_BLOCKED','DRAFT_REVIEW','Correct the named field against the original','review'),
      ('HISTORICAL_STOCK_HOLD','CANCELLED','Reject unposted invoice; reconcile physical stock separately in Counts & audit','review'),
      ('REVIEWED_LINKED_RECEIPT','COMMITTED','Post bill; no additional stock','commit'),
      ('REVIEWED_LINKED_RECEIPT','DRAFT_REVIEW','Reopen review','review'),
      ('DUPLICATE_DRAFT','DRAFT_REVIEW','Open exact existing unposted invoice and compare retained entry','review'),
      ('DUPLICATE_COMMITTED','COMMITTED','Open exact existing committed invoice; do not add stock again','review'),
      ('STALE_DRAFT','DRAFT_REVIEW','Compare with authoritative unposted saved version','review'),
      ('STALE_COMMITTED','COMMITTED','Open authoritative committed outcome','review'),
    ]
    for evidence,outcome in outcomes.items():
        transitions.append(('UNKNOWN_'+evidence,'DELEGATED_'+evidence,'Open retained recovery reference','entry'))
        transitions.append(('DELEGATED_'+evidence,outcome,'Recover import outcome with '+evidence.lower(),
          'delegated_'+evidence.lower()))
    for evidence,outcome in outcomes.items():
        assert {end for start,end,_,_ in transitions if start=='DELEGATED_'+evidence}=={outcome}
    profiles=[('original_operator',True,True,True,True),('authorized_colleague',False,True,True,True),
      ('colleague_without_original_attribution',False,True,False,True),
      ('read_only_without_helper',False,False,True,True),('service_unavailable',False,True,True,False)]
    def check(name,owner,authorized,attributed,available,removed=()):
        guards={'missing_entry':available,'owner':owner and authorized and available,
          'entry':available,'attribution':attributed and available,
          'recovery':authorized and available,
          'owner_recovery':owner and authorized and available,'review':authorized and available,
          'create':authorized and available,'commit':authorized and available}
        guards.update({'delegated_'+evidence.lower():authorized and available and 'delegated' not in removed
          for evidence in outcomes})
        enabled=[e for e in transitions if guards[e[3]] and e[3] not in removed]
        winning=set(terminal); witness={}; distance={n:0 for n in terminal}
        while True:
            before=len(winning)
            for start,end,action,guard in enabled:
                if end in winning and start not in winning:
                    winning.add(start);witness[start]=(action,end);distance[start]=distance[end]+1
            if len(winning)==before:break
        losers=set(nodes)-winning
        assert all(end in losers for start,end,_,_ in enabled if start in losers)
        paths={}
        for node in nodes:
            if node in winning:
                cur=node; trace=[]
                while cur not in terminal:
                    action,end=witness[cur];trace.append({'from':cur,'action':action,'to':end});cur=end
                paths[node]=trace
        assert all(start not in terminal for start,_,_,_ in enabled)
        return {'profile':name,'AG_EF_safe_intake_terminal':not losers,'missing':sorted(losers),
          'enabled_transitions':enabled,'witnesses':paths,'terminal_monotonicity':True}
    results=[check(*profile) for profile in profiles]
    assert all(r['AG_EF_safe_intake_terminal'] for r in results[:2])
    assert all(not r['AG_EF_safe_intake_terminal'] for r in results[2:])
    mutation_guards=('missing_entry','delegated','attribution')+tuple('delegated_'+evidence.lower() for evidence in outcomes)
    mutations=[check('remove_'+guard,False,True,True,True,(guard,)) for guard in mutation_guards]
    assert all(not r['AG_EF_safe_intake_terminal'] for r in mutations)
    return {'scope':'Source-mapped recovery witness graph with evidence-partitioned outcomes, valid exact references, full purchase capabilities, truthful complete originals and service availability. It is not a whole-program refinement proof. Existing owner is immutable. An absent attempt requires validated branch-local original attribution.',
      'nodes':nodes,'terminal':sorted(terminal),'transitions':transitions,'profiles':results,'mutations':mutations,
      'evidence_partition':{'cases':cases,'all_outcomes_safe':True,'outcomes':outcomes,'unsafe_mutations':safety_mutations},
      'source_map':{
        'missing_entry':{'ui':'frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx initial invoice read effect'},
        'entry':{'ui':'frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx copyHandoff and Interrupted import recovery'},
        'delegated':{'ui':'frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx recoverDelegatedImport',
          'api':'backend/src/modules/pharmacy/pharmacy-purchase-invoice.controller.ts recoverDelegated',
          'outcome':'backend/src/modules/pharmacy/purchase-import-recovery.ts recoverDelegated and read'},
      },
      'guards':['Delegated recovery requires purchase read, create and review together on the recovering actor.',
      'An existing attempt derives its owner from persisted state; a supplied mismatch is rejected without mutation.',
      'An absent reference requires original-operator branch validation. Supplied attribution is not historical proof.',
      'Only a modern attempt with complete retained-source evidence and no historical invoice link may report NO_STOCK_WRITTEN. Missing or conflicting links and lost originals without an exact invoice retain UNVERIFIED history.',
      'An exact surviving invoice may be resumed by identity even when a retained original is unavailable. Further review remains conditional on complete originals.',
      'The branch lock, row fence, validated sources, terminal transition and audit are one transaction.',
      'Malformed, foreign or conflicting references retain the UI fields for correction. They do not authorize a stock write.'],
      'rejection_goal_separation':'RETRY_REJECTED resolves intake only. Its UI link enters the independent physical-count recovery graph.'}


def write_graphs():
    stock='''digraph reconciliation {
rankdir=TB; graph [fontname="Arial", bgcolor="white", nodesep=.25, ranksep=.55, label="Physical inventory recovery. Guards apply to every edge.", labelloc=t]; node [shape=box, style="rounded,filled", fontname="Arial", fontsize=12, fillcolor="#eaf2ff"]; edge [fontname="Arial", fontsize=10];
entry [label="Stock discrepancy, unverified ledger,\nterminal document, or rejected OCR intake"];
access [label="Inventory read + audit authority\nShared branch count; approver when needed",fillcolor="#fff0cc"];
count [label="Count this batch / Counts & audit\nDRAFT with current snapshot; no observation"];
observe [label="Enter truthful physical count P\nand required reason. Blank is uncounted"];
stale [label="Snapshot or version changed\nNo stock write",fillcolor="#fff0cc"];
held [label="P below held stock\nSelectable source capacity\nand disposition authority",fillcolor="#fff0cc"];
dispose [label="Source-linked loss for missing held units\nFresh observation required afterward"];
approve [label="AWAITING_APPROVAL -> APPROVED\nAuthorized approver + count permission"];
post [label="POST atomically\nq = P; held <= q; physical checkpoint",fillcolor="#daf2dd"];
terminal [label="Any saved COUNT status\nAll seven states, including terminal states"];
blocked [label="No authority, missing evidence,\nunattributed holds, permanent outage\nNo unconditional recovery theorem",fillcolor="#ffdada"];
entry->access; access->count [label="UI action enabled"]; access->blocked [label="precondition absent"];
count->observe; observe->stale [label="changed snapshot"]; stale->count [constraint=false,label="Reload + fresh count"];
observe->held [label="P < held"]; held->dispose [label="verified disposition"]; held->blocked [label="no source or authority"]; dispose->count [constraint=false];
observe->approve [label="policy needs approval"]; approve->post; observe->post [label="current, authorized, P >= held"];
terminal->count [label="Follow recount chain to fresh draft"]; post->terminal [constraint=false,label="Another count remains available"];
}
'''
    gaps='''digraph intake {
rankdir=TB; graph [fontname="Arial",bgcolor="white",label="Guarded UI recovery. Evidence determines the outcome.",labelloc=t]; node [shape=box,style="rounded,filled",fontname="Arial",fillcolor="#eaf2ff"]; edge [fontname="Arial",fontsize=10];
missing [label="Fresh missing-invoice URL"];
unknown [label="Exact invoice retained as unknown\nCheck saved status / recover missing invoice"];
interrupted [label="Interrupted or unknown import\nOriginal operator or authorized colleague"];
entry [label="Recover interrupted import\nRetain exact attempt, original operator and sources"];
recovery [label="Recover import outcome, or\nRecover legacy or missing invoice + reason\nRead + create + review; correct branch\nImmutable owner; branch lock; atomic audit"];
none [label="Modern RUNNING / absent attempt\nNo historical invoice link\nAll retained sources found"];
draft [label="One exact surviving draft invoice"];
committed [label="One exact surviving committed invoice"];
history [label="Missing or conflicting historical links"];
lost [label="Lost retained original\nNo exact surviving invoice"];
noStock [label="NO_STOCK_WRITTEN\nWorker fenced",fillcolor="#daf2dd"];
saved [label="DRAFT_REVIEW\nReview complete originals or reject",fillcolor="#daf2dd"];
posted [label="COMMITTED\nExact saved stock outcome",fillcolor="#daf2dd"];
rejected [label="RETRY_REJECTED\nHistorical stock remains UNVERIFIED",fillcolor="#fff0cc"];
correct [label="Invalid reference or missing attribution\nCorrect fields or open separate recovery page",fillcolor="#fff0cc"];
count [label="Reconcile physical inventory in Counts & audit\nFresh count under quantity recovery guards",fillcolor="#daf2dd"];
missing->unknown; unknown->recovery; interrupted->entry; entry->recovery;
recovery->none; recovery->draft; recovery->committed; recovery->history; recovery->lost;
none->noStock; draft->saved; committed->posted; history->rejected; lost->rejected;
recovery->correct [label="input / authority guard"]; correct->entry [label="authorized operator + reliable reference",constraint=false];
rejected->count [label="visible UI link"];
}
'''

    (HERE/'inventory-recovery.dot').write_text(stock)
    (HERE/'intake-recovery-gaps.dot').write_text(gaps)


def main():
    """
    @cc [owner:nareshshah139,label:verification] ui-recovery-model-scope
    This checker MUST gate every modeled stock action by UI authority and data guards, retain
    counterexamples, and distinguish bounded control-state checks from unbounded SMT obligations.
    """
    baseline=json.loads((HERE/'source-baseline.json').read_text())
    assert all(hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest for name,digest in baseline.items()),'Source drift invalidates source mapping'
    workflow=(ROOT/'backend/src/modules/inventory/inventory-workflow.service.ts').read_text()
    assert "['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED', 'CANCELLED', 'REVERSED'].includes(doc.status)" in workflow
    profiles={
      'authorized_team':Access(),
      'same_actor_without_approver':Access(approver=False),
      'same_actor_immediate_policy':Access(approver=False,approval_required_for_variance=False),
      'count_without_hold_authority':Access(disposition=False),
      'read_only':Access(count=False,approver=False,disposition=False),
      'unattributed_holds':Access(selectable_source_capacity=False),
      'physical_evidence_unavailable':Access(physical_evidence=False),
      'service_unavailable':Access(service_available=False),
    }
    checks=[check_stock(name,access) for name,access in profiles.items()]
    assert checks[0]['AG_EF_reconciled']
    assert checks[2]['AG_EF_reconciled']
    assert all(not c['AG_EF_reconciled'] for c in checks if c['profile'] not in ('authorized_team','same_actor_immediate_policy'))
    mutation_checks=[check_stock('remove_'+action,Access(),(action,)) for action in ('post','recount_chain','observe','dispose')]
    assert all(not c['AG_EF_reconciled'] for c in mutation_checks)
    result={'base_revision':'a28f6b32c621159579ac28e181eb78e74e317c53','source_fingerprints':'source-baseline.json','scope':'Finite guarded witness model plus source-derived integer proof obligations. Not whole-program refinement.',
      'bound':BOUND,'count_statuses':COUNT_STATUSES,'stock_profiles':checks,'mutation_checks':[{k:c[k] for k in ('profile','states','no_path','AG_EF_reconciled')} for c in mutation_checks],'smt':arithmetic(),'z3':z3.get_version_string(),'intake':intake(),'action_map':ACTION_MAP,
      'assumptions':['Truthful physical evidence; retained same-branch batch and selectable POSTED source capacity; quantities in the implemented representable integer range.',
      'A suitable stable interval and eventual successful database commits. No assertion of automatic completion.',
      'RECOUNT is a finite macro. Replays can return a prior child. Open that child and repeat along the finite creation-ordered chain until a fresh leaf is created. Macro distances are not UI click counts.',
      'Team profile means an actor exists who satisfies each complete action guard. It does not union unrelated permissions into a fictitious user.',
      'Disposition is a macro for finite source-owned losses totaling h-P. Selectable POSTED sources must have sufficient remaining capacity and physical evidence must authorize loss.',
      'The stock state graph is a recovery witness subgraph, not every possible business transition.',
      'UI uncertainty is modeled separately in check_knowledge.py. Same-version lost commands require a revision fence before retry. Stock document fields denote authoritative persisted fields. current_version says whether the UI has acquired that revision. Reload may yield any supported record, each of which has a checked recovery path.',
      'Observe is a UI macro that enters a truthful count and a nonempty reason. Approval policy is an explicit context parameter.'],
      'non_claims':['Every original document can be reversed','Historical accounting reconstruction','Product identity correctness','OCR truth','AF automatic reconciliation','Recovery without reliable identifiers, physical evidence, required authority or service availability']}
    (HERE/'model-results.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
    write_graphs()
    labels = {node:node.replace('_',' ').title() for node in result['intake']['nodes']}
    labels.update(NO_STOCK_WRITTEN='Stopped safely: no invoice or stock from this attempt', RETRY_REJECTED='Retry rejected: historical stock remains unverified', COMMITTED='Confirmed saved outcome', CANCELLED='Unposted intake rejected: retain originals and history', REVIEWED_LINKED_RECEIPT='Ready to Post bill: stock received earlier')
    graph = ['digraph ocr {', 'rankdir=LR; graph [fontname="Arial",bgcolor="white",label="OCR recovery and safe rejection paths",labelloc=t]; node [shape=box,style="rounded,filled",fillcolor="#edf3ff",fontname="Arial",fontsize=10]; edge [fontname="Arial",fontsize=9];']
    graph += [json.dumps(node)+' [label='+json.dumps(label)+'];' for node,label in labels.items()]
    graph += [json.dumps(start)+' -> '+json.dumps(end)+' [label='+json.dumps(action)+'];' for start,end,action,guard in result['intake']['transitions']]
    graph.append('}')
    (HERE/'ocr-recovery.dot').write_text('\n'.join(graph)+'\n')
    print(json.dumps({'stock_profiles':[{k:c[k] for k in ('profile','states','edges','AG_EF_reconciled','no_path')} for c in checks],'SMT':len(result['smt']),'intake':[{k:r[k] for k in ('profile','AG_EF_safe_intake_terminal','missing')} for r in result['intake']['profiles']]}))

if __name__=='__main__':
    main()
