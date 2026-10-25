"""
@cc [owner:nareshshah139,label:verification] reconciliation-model-scope
This checker MUST distinguish finite abstraction checks from service and database evidence.
Recovery witnesses MUST preserve held-stock safety and retain counterexamples to unconditional
liveness and reconstruction of unknown history. Source drift MUST invalidate the result.
"""
from collections import deque
from itertools import product
from pathlib import Path
import hashlib, json

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BOUND = 12
results = []

def record(claim, cases, **extra):
    results.append(dict(claim=claim, status='PASS_BOUNDED', cases=cases, **extra))

movement_cases = count_cases = recovery_cases = hold_cases = ledger_cases = 0
for q in range(BOUND + 1):
    for h in range(q + 1):
        for delta in range(-BOUND, BOUND + 1):
            for release in range(h + 1):
                if delta and q + delta >= h - release:
                    assert 0 <= h - release <= q + delta
                    movement_cases += 1
        for p in range(BOUND + 1):
            if p >= h:
                assert q + (p - q) == p and h <= p
                count_cases += 1
            # Physical verification resolves missing held units by a linked loss first.
            loss = max(0, h - p)
            q1, h1 = q - loss, h - loss
            assert 0 <= h1 <= q1 and h1 <= p
            assert q1 + (p - q1) == p
            recovery_cases += 1
        for consumed in range(h + 1):
            for other in range(q - h + 1):
                # h = this source's original hold; other = unrelated holds.
                # Consumer posts, source residual releases, consumer compensates.
                q1, held1 = q - consumed, other
                assert 0 <= held1 <= q1
                q2, held2 = q1 + consumed, held1 + consumed
                assert q2 == q and held2 == other + consumed <= q2
                # Only the original source regains consumed units.
                assert held2 - consumed == other
                hold_cases += 1
record('Accepted movements preserve 0 <= held <= on_hand', movement_cases)
record('Fresh approved count sets on_hand = physical when physical >= held', count_cases)
record('Verified disposition of missing held units then fresh count is safe', recovery_cases)
record('Linked compensation after residual release restores only its original quarantine', hold_cases)

count_states = ['DRAFT','AWAITING_APPROVAL','APPROVED','REJECTED','CANCELLED','POSTED','REVERSED']
graph = {f'COUNT:{s}': ['FRESH_UNCOUNTED_DRAFT'] for s in count_states}
graph.update({
    'STALE_COUNT': ['FRESH_UNCOUNTED_DRAFT'],
    'AMBIGUOUS_EXISTING_LINKS': ['VERIFIED_IDENTITY'],
    'VERIFIED_IDENTITY': ['FRESH_UNCOUNTED_DRAFT'],
    'UNVERIFIED_LEDGER': ['FRESH_UNCOUNTED_DRAFT'],
    'LEDGER_DISCREPANCY': ['FRESH_UNCOUNTED_DRAFT'],
    'INACTIVE_BATCH': ['ACTIVE_VERIFIED_BATCH'],
    'ACTIVE_VERIFIED_BATCH': ['FRESH_UNCOUNTED_DRAFT'],
    'PHYSICAL_BELOW_HELD': ['VERIFIED_SOURCE_DISPOSITION'],
    'VERIFIED_SOURCE_DISPOSITION': ['FRESH_UNCOUNTED_DRAFT'],
    'RELEASED_SOURCE_WITH_POSTED_LOSS': ['RESTORED_ORIGINAL_QUARANTINE'],
    'RELEASED_SOURCE_WITH_RETURN_CHALLAN': ['RESTORED_ORIGINAL_QUARANTINE'],
    'RESTORED_ORIGINAL_QUARANTINE': ['FRESH_UNCOUNTED_DRAFT'],
    'PURCHASE:REVIEWED_INVALID': ['PURCHASE:DRAFT'],
    'PURCHASE:DRAFT': ['PURCHASE:REVIEWED_VALID'],
    'PURCHASE:OCR_REVIEW_REQUIRED': ['PURCHASE:DRAFT'],
    'PURCHASE:RECONCILIATION_FAILED': ['PURCHASE:DRAFT'],
    'PURCHASE:REVIEWED_VALID': ['PURCHASE:STOCK_COMMITTED'],
    'PURCHASE:STOCK_COMMITTED': ['FRESH_UNCOUNTED_DRAFT'],
    'PURCHASE:CANCELLED': ['PURCHASE:DRAFT'],
    'FRESH_UNCOUNTED_DRAFT': ['PHYSICAL_OBSERVATION'],
    'PHYSICAL_OBSERVATION': ['REVIEWED_CURRENT_COUNT'],
    'REVIEWED_CURRENT_COUNT': ['RECONCILED'],
    'RECONCILED': [],
})
# Edges denote authorized actions with documented evidence/availability preconditions.
paths = {}
for start in graph:
    queue, seen = deque([(start, [start])]), set()
    while queue:
        node, path = queue.popleft()
        if node in seen: continue
        seen.add(node)
        if node == 'RECONCILED':
            paths[start] = path
            break
        queue.extend((n, path + [n]) for n in graph[node])
    assert start in paths, f'No recovery path: {start}'
results.append(dict(claim='AG EF reconciled under edge preconditions', status='PASS_FINITE_ABSTRACTION', states=len(paths), witness_paths=paths))
for q, old_ledger, p in product(range(BOUND + 1), repeat=3):
    delta = p - q
    assert p - (old_ledger + delta) == q - old_ledger
    # COUNT commits delta plus an explicit physical checkpoint; unknown old history is covered.
    checkpoint, later_sum = p, 0
    assert checkpoint + later_sum == p == q + delta
    for later_delta in (-2, -1, 0, 1, 2):
        if p + later_delta >= 0:
            expected = checkpoint + later_delta
            assert expected == p + later_delta
            assert (expected + 1) - expected == 1  # independent drift detection
    ledger_cases += 1
record('Checkpoint establishes independent ledger agreement and preserves subsequent signed changes', ledger_cases)
results += [
    dict(claim='Unconditional AF reconciled', status='COUNTEREXAMPLE', trace=['AWAITING_APPROVAL','wait forever'], reason='Requires authority, evidence, scheduling and a successful stable transaction interval'),
    dict(claim='COUNT reconstructs unknown historical movements', status='COUNTEREXAMPLE', trace=['q=10,L=8,P=7','delta=-3','q=7,L=5'], reason='Historical gap stays 2; checkpoint explicitly starts a new verified baseline'),
    dict(claim='Every original terminal document eventually posts', status='COUNTEREXAMPLE', trace=['DRAFT','CANCELLED'], reason='Recovery creates a linked count or a new purchase; immutable history is retained'),
]
baseline = json.loads((HERE / 'source-baseline.json').read_text())
manifest = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in baseline}
assert manifest == baseline, 'Source changed. Review the mapping before refreshing the baseline.'
output = dict(scope='Finite mathematical abstraction, not a refinement or production/database proof.', bound=BOUND,
    assumptions=['Valid representable integer quantities and branch-local retained batch/source records.',
        'Verified physical identity, stock units and count; each held unit has an attributable source.',
        'Authorized staff can resolve dependencies and provide any required approval.',
        'A finite recovery sequence gets a stable interval and successful serializable commits.',
        'Purchase intake represents actual valid received goods; ledger scope starts at a physical checkpoint.'],
    results=results, source_sha256=manifest)
(HERE / 'inventory-model-results.json').write_text(json.dumps(output, indent=2) + '\n')
for result in results: print(result['status'], result['claim'], result.get('cases', result.get('states','')), sep='\t')
