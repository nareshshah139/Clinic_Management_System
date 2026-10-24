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
 'DUPLICATE':['DRAFT_SAVED'], 'UNKNOWN_WITHOUT_INVOICE_ID':['NO_STOCK_WRITTEN','DRAFT_SAVED'],
 'UNKNOWN_WITH_INVOICE_ID':['DRAFT_SAVED'], 'WORKER_CRASHED':['UNKNOWN_WITHOUT_INVOICE_ID'],
 'DRAFT_SAVED':['DRAFT','STOCK_COMMITTED','CANCELLED'],
 'STOCK_COMMITTED':['VERIFIED_INVENTORY'], 'CANCELLED':['SAFELY_REJECTED'],
 'SAFELY_REJECTED':[], 'VERIFIED_INVENTORY':[],
}
graph={s:[(' → '.join([s,t]),t) for t in targets] for s,targets in paths.items()}
life={s:witness(s,graph,lambda s:s in ('SAFELY_REJECTED','VERIFIED_INVENTORY')) for s in paths}
baseline=json.loads((HERE/'source-baseline.json').read_text())
for path,digest in baseline.items():
    assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==digest, f'Source drift: {path}'
result={'scope':'Finite transition abstraction; not OCR ground-truth or a whole-program refinement proof.',
 'claims':{'at_most_one_stock_effect':'PASS','no_stock_fence_excludes_invoice':'PASS','rejection_has_no_stock_effect':'PASS','AG_EF_verified_inventory_or_safe_rejection':'PASS_CONDITIONAL'},
 'race_states':len(seen),'race_edges':sum(map(len,edges.values())), 'race_witnesses':races,
 'ocr_states':len(paths),'ocr_witnesses':life,
 'assumptions':['Retained branch-local records and valid current-version operations.','Physical evidence and eligible goods are required for inventory admission; absent evidence permits rejection.','Authorized actors and eventual database/read availability.','New automatic imports carry an attempt UUID persisted before dispatch; legacy uncorrelated requests must be drained before rollout.','Inventory endpoint invokes the previously checked physical reconciliation rules; financial corrections remain separate.'],
 'non_claims':['Automatic eventual completion','OCR factual accuracy or detection of two agreeing wrong reads','Historical accounting reconstruction','No-stock claims for missing linked records or arbitrary database corruption']}
(HERE/'model-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(f"PASS: {len(paths)} OCR classes; {len(seen)} race states; {sum(map(len,edges.values()))} transitions")
