"""
@cc [owner:nareshshah139,label:verification] ocr-recovery-model-scope
This finite checker MUST distinguish control-flow reachability from OCR factual correctness.
No-stock resolution MUST exclude a saved invoice in every explored interleaving. Every modeled
OCR state MUST have a guarded witness to verified inventory or safe rejection; source drift fails.
"""
from collections import deque
from pathlib import Path
import hashlib, json
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
# (durable attempt, worker phase, invoice, number of stock effects)
initial = ('ABSENT', 'NOT_SENT', 'NONE', 0)
def next_states(s):
    attempt, worker, invoice, effects = s
    out = []
    def add(label, a=attempt, w=worker, i=invoice, n=effects):
        out.append((label, (a,w,i,n)))
    if attempt in ('ABSENT','RUNNING'):
        add('Resolve: tombstone or fence', a='STOPPED')
    if worker == 'NOT_SENT':
        if attempt == 'ABSENT': add('Register before OCR', a='RUNNING', w='OCR')
        else: add('Delayed/replayed request observes terminal fence', w='DONE')
    if worker == 'OCR':
        add('Extraction completes', w='READY')
        add('Extraction fails', a='STOPPED' if attempt == 'RUNNING' else attempt, w='DONE')
        add('Worker crashes', w='CRASHED')
    if worker == 'READY':
        if attempt == 'RUNNING': add('Claim + create + bind in one transaction', a='SAVED', w='PROCESS', i='DRAFT')
        else: add('Stopped worker cannot create', w='DONE')
        add('Worker crashes', w='CRASHED')
    if attempt == 'SAVED' and invoice == 'DRAFT':
        add('Guarded stock transaction / resume exact invoice', i='COMMITTED', n=effects+1)
        add('Current revision + reason: reject before stock', i='CANCELLED')
    if worker == 'PROCESS':
        add('Response received/lost; durable identity unchanged', w='DONE')
        add('Worker crashes', w='CRASHED')
    return out

queue=deque([initial]); seen={initial}; edges={}
while queue:
    s=queue.popleft(); edges[s]=next_states(s)
    a,w,i,n=s
    assert n in (0,1), s
    assert (a == 'SAVED') == (i != 'NONE'), s
    assert (i == 'COMMITTED') == (n == 1), s
    if a == 'STOPPED': assert i == 'NONE' and n == 0, s
    if i == 'CANCELLED': assert n == 0, s
    for _, target in edges[s]:
        if target not in seen: seen.add(target); queue.append(target)
def safe(s): return s[0]=='STOPPED' or s[2] in ('COMMITTED','CANCELLED')
def witness(start, graph, goal):
    q=deque([(start,[])]); visited={start}
    while q:
        node, path=q.popleft()
        if goal(node): return path
        for action,nxt in graph[node]:
            if nxt not in visited: visited.add(nxt); q.append((nxt,path+[action]))
    raise AssertionError(('No safe path',start))
races={' / '.join(s[:3]):witness(s,edges,safe) for s in sorted(seen)}
# All user-visible lifecycle classes, including all persisted invoice/automation outcomes.
paths={
 'UPLOAD_NOT_SENT':['REGISTERED'], 'UPLOAD_REJECTED_FORMAT':['SAFELY_REJECTED'],
 'UPLOAD_REJECTED_SIZE':['SAFELY_REJECTED'], 'ORIGINAL_ARCHIVED':['EXTRACTING'],
 'REGISTERED':['ORIGINAL_ARCHIVED','UNKNOWN_WITHOUT_INVOICE_ID'],
 'EXTRACTING':['EXTRACTED_VALID','OCR_UNAVAILABLE','INCOMPLETE_PAGES','UNREADABLE_RESULT'],
 'OCR_UNAVAILABLE':['NO_STOCK_WRITTEN'], 'UNREADABLE_RESULT':['NO_STOCK_WRITTEN'],
 'EMPTY_RESULT':['NOT_SAVED'], 'INCOMPLETE_PAGES':['FULL_MANUAL_ENTRY','SAFELY_REJECTED'],
 'PAGE_LIMIT_EXCEEDED':['FULL_MANUAL_ENTRY','SAFELY_REJECTED'],
 'LEGACY_TRUNCATED_RESULT':['FULL_MANUAL_ENTRY','SAFELY_REJECTED'],
 'ROW_COUNT_DISAGREEMENT':['MANUAL_REVIEW'], 'FIELD_DISAGREEMENT':['MANUAL_REVIEW'],
 'LOW_CONFIDENCE':['MANUAL_REVIEW'], 'VERIFIER_UNAVAILABLE':['MANUAL_REVIEW'],
 'SOURCE_HIGHLIGHTS_UNAVAILABLE':['MANUAL_REVIEW'],
 'PRODUCT_OR_SUPPLIER_UNRESOLVED':['MANUAL_REVIEW'], 'TOTALS_MISMATCH':['MANUAL_REVIEW'],
 'EXTRACTED_VALID':['DRAFT'], 'NOT_SAVED':['FULL_MANUAL_ENTRY','SAFELY_REJECTED'],
 'NO_STOCK_WRITTEN':['FULL_MANUAL_ENTRY','SAFELY_REJECTED'],
 'FULL_MANUAL_ENTRY':['DRAFT','SAFELY_REJECTED'], 'MANUAL_REVIEW':['DRAFT','CANCELLED'],
 'DRAFT':['REVIEWED','CANCELLED'], 'OCR_REVIEW_REQUIRED':['MANUAL_REVIEW','CANCELLED'],
 'RECONCILIATION_FAILED':['MANUAL_REVIEW','CANCELLED'], 'SAVED_FOR_REVIEW':['MANUAL_REVIEW','CANCELLED'],
 'REVIEWED':['STOCK_COMMITTED','DRAFT','CANCELLED'], 'STALE_REVISION':['DRAFT_SAVED'],
 'DUPLICATE':['DRAFT_SAVED'], 'UNKNOWN_WITHOUT_INVOICE_ID':['NO_STOCK_WRITTEN','DRAFT_SAVED','LEGACY_WITHOUT_ATTEMPT_ID'],
 'UNKNOWN_WITH_INVOICE_ID':['DRAFT_SAVED','MISSING_LINKED_INVOICE'], 'WORKER_CRASHED':['UNKNOWN_WITHOUT_INVOICE_ID'],
 'DRAFT_SAVED':['DRAFT','STOCK_COMMITTED','CANCELLED'],
 'STOCK_COMMITTED':['VERIFIED_INVENTORY'], 'CANCELLED':['SAFELY_REJECTED'],
 'SAFELY_REJECTED':[], 'VERIFIED_INVENTORY':[],
 'LEGACY_WITHOUT_ATTEMPT_ID':['UNLINKED_RECOVERY'], 'MISSING_LINKED_INVOICE':['UNLINKED_RECOVERY'],
 'UNLINKED_RECOVERY':['DRAFT_SAVED','RETRY_REJECTED'], 'RETRY_REJECTED':['INVENTORY_RECONCILIATION'],
 'INVENTORY_RECONCILIATION':['VERIFIED_INVENTORY'],
 'LINKED_INVOICE_DELETE_BLOCKED':['DRAFT_SAVED'], 'LEGACY_WORKER_BLOCKED':['UNLINKED_RECOVERY'],
}
graph={s:[(' → '.join([s,t]),t) for t in targets] for s,targets in paths.items()}
life={s:witness(s,graph,lambda s:s in ('SAFELY_REJECTED','VERIFIED_INVENTORY','RETRY_REJECTED')) for s in paths}
# Legacy/orphan safety is about ADDITIONAL intake, never absence of historical posting.
legacy_witnesses={}; legacy_edges=0
for kind, present, historical in [('LEGACY',False,0),('LEGACY',False,1),('LEGACY',True,0),('LEGACY',True,1),('ORPHAN',False,0),('ORPHAN',False,1),('COMPETING',False,0)]:
    seed=(present,historical,'OPEN')
    todo=deque([seed]); visited={seed}; graph2={}
    while todo:
        state=todo.popleft(); invoice,effects,decision=state; out=[]
        assert historical <= effects <= 1
        if decision=='REJECTED': assert effects==historical
        # Old-worker writes are prohibited by installed triggers, including after rejection.
        out.append(('Old worker blocked by database protocol',state))
        if decision=='OPEN':
            out.append(('Read exact invoice' if invoice else 'Audit and reject retry', (invoice,effects,'RESUMED' if invoice else 'REJECTED')))
            if kind=='COMPETING' and not invoice:
                out.append(('Current worker binds source before recovery lock', (True,effects,'OPEN')))
        if invoice and decision in ('OPEN','RESUMED') and effects==0:
            out.append(('Commit exact invoice once', (True,1,decision)))
        if decision in ('REJECTED','RESUMED'):
            out.append(('Physical count and independent checkpoint; no purchase replay', (invoice,effects,'RECONCILED')))
        graph2[state]=out
        for _,target in out:
            if target not in visited: visited.add(target);todo.append(target)
    for state in visited:
        legacy_witnesses[f'{kind}:{historical}:{present}:{state}']=witness(state,graph2,lambda x:x[2] in ('REJECTED','RECONCILED'))
    legacy_edges+=sum(map(len,graph2.values()))
baseline=json.loads((HERE/'source-baseline.json').read_text())
for path,digest in baseline.items():
    assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==digest, f'Source drift: {path}'
result={'scope':'Finite transition abstraction; not OCR ground-truth or a whole-program refinement proof.',
 'claims':{'at_most_one_stock_effect':'PASS','no_stock_fence_excludes_invoice':'PASS','rejection_has_no_stock_effect':'PASS','AG_EF_verified_inventory_or_safe_rejection_or_retry_rejection':'PASS_CONDITIONAL','legacy_rejection_additional_stock_effects_zero':'PASS','old_worker_after_migration_cannot_post':'PASS'},
 'race_states':len(seen),'race_edges':sum(map(len,edges.values())), 'race_witnesses':races,
 'legacy_states':len(legacy_witnesses),'legacy_edges':legacy_edges,'legacy_witnesses':legacy_witnesses,
 'ocr_states':len(paths),'ocr_witnesses':life,
 'assumptions':['Retained branch-local records and valid current-version operations.','Physical evidence and eligible goods are required for inventory admission; absent evidence permits rejection.','Authorized actors and eventual database/read availability.','Both migrations are installed before recovery is enabled. Old workers fail the database protocol; legacy recovery UUIDs are persisted before dispatch.','Inventory endpoint invokes the previously checked physical reconciliation rules; financial corrections remain separate.'],
 'non_claims':['Automatic eventual completion','OCR factual accuracy or detection of two agreeing wrong reads','Historical accounting reconstruction','No-stock claims for orphan links or legacy unknown outcomes; retry rejection preserves uncertainty','Recovery from arbitrary corruption of the guard tables, triggers, or retained stock history']}
(HERE/'model-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(f"PASS: {len(paths)} OCR classes; {len(seen)} attempt race states; {len(legacy_witnesses)} legacy/orphan states; all witnesses and invariants pass")
