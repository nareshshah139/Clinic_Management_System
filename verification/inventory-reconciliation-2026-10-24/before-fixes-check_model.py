"""
@cc [owner:nareshshah139,label:verification] reconciliation-model-scope
This checker MUST distinguish bounded model results from production verification.
It MUST check the stated conditional recovery property and retain counterexamples
to unconditional completion, same-document recovery, and ledger repair.
"""

from collections import deque
from itertools import product
from pathlib import Path
import hashlib
import json

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BOUND = 12
results = []
movement_cases = 0
count_cases = 0
recovery_cases = 0

for q in range(BOUND + 1):
    for h in range(q + 1):
        for delta in range(-BOUND, BOUND + 1):
            for release in range(h + 1):
                if delta != 0 and q + delta >= h - release:
                    q_next, h_next = q + delta, h - release
                    assert 0 <= h_next <= q_next
                    assert q_next - q == delta
                    movement_cases += 1
        for p in range(BOUND + 1):
            if p >= h:
                delta = p - q
                assert q + delta == p
                assert 0 <= h <= p
                count_cases += 1
            released_h = 0
            delta_after_fresh_count = p - q
            assert q + delta_after_fresh_count == p
            assert p >= released_h
            recovery_cases += 1

results.extend([
    {"claim": "accepted movement preserves 0 <= held <= on_hand", "status": "PASS_BOUNDED", "cases": movement_cases},
    {"claim": "fresh approved count with physical >= held sets on_hand = physical", "status": "PASS_BOUNDED", "cases": count_cases},
    {"claim": "releasable holds then a fresh authorized count can reconcile", "status": "PASS_BOUNDED_CONDITIONAL", "cases": recovery_cases},
])

same_document = {
    "DRAFT": ["AWAITING_APPROVAL", "POSTED", "CANCELLED", "REJECTED", "STALE"],
    "AWAITING_APPROVAL": ["APPROVED", "CANCELLED", "REJECTED", "STALE"],
    "APPROVED": ["POSTED", "CANCELLED", "STALE"],
    "STALE": ["CANCELLED"],
    "CANCELLED": [],
    "REJECTED": [],
    "POSTED": [],
}
recovery_graph = {key: list(value) for key, value in same_document.items()}
recovery_graph["CANCELLED"] = ["DRAFT"]
recovery_graph["REJECTED"] = ["DRAFT"]
recovery_graph["HELD_BLOCKED"] = ["HOLDS_RESOLVED"]
recovery_graph["HOLDS_RESOLVED"] = ["DRAFT"]
paths = {}
for start in recovery_graph:
    queue = deque([(start, [start])])
    seen = set()
    while queue:
        node, path = queue.popleft()
        if node in seen:
            continue
        seen.add(node)
        if node == "POSTED":
            paths[start] = path
            break
        queue.extend((next_node, path + [next_node]) for next_node in recovery_graph[node])
    assert start in paths, f"No recovery path from {start}"
assert same_document["REJECTED"] == []
assert same_document["CANCELLED"] == []
results.append({"claim": "AG EF POSTED in the recovery graph under its edge preconditions", "status": "PASS_FINITE_ABSTRACTION", "states": len(paths), "witness_paths": paths})
results.append({"claim": "every original count document eventually posts", "status": "COUNTEREXAMPLE", "trace": ["DRAFT", "REJECTED"], "reason": "A fresh document is a different identity."})
results.append({"claim": "AG AF reconciled without scheduling and availability assumptions", "status": "COUNTEREXAMPLE", "trace": ["AWAITING_APPROVAL", "wait", "AWAITING_APPROVAL", "wait forever"]})

ledger_cases = 0
for q, ledger, p in product(range(BOUND + 1), repeat=3):
    delta = p - q
    assert p - (ledger + delta) == q - ledger
    ledger_cases += 1
results.append({"claim": "a normal count removes a pre-existing stock/ledger gap", "status": "COUNTEREXAMPLE", "cases": ledger_cases, "witness": {"before": {"on_hand": 10, "ledger": 8}, "physical": 7, "delta": -3, "after": {"on_hand": 7, "ledger": 5}, "unchanged_gap": 2}})

baseline = json.loads((HERE / "source-baseline.json").read_text())
manifest = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in baseline}
assert manifest == baseline, "Inspected source changed. Re-audit the proof mapping before updating the baseline."
output = {
    "scope": "Finite mathematical abstraction. Not a database or production correctness proof.",
    "bound": BOUND,
    "assumptions": [
        "Valid integer balances and an authoritative physical count in the same stock unit.",
        "Every held unit has a consistent source that an authorized actor can resolve.",
        "A current snapshot, a new request key for a new attempt, and any required approval.",
        "A successful serializable commit and a stable interval without competing mutations.",
        "POSTED in this graph means a successful COUNT, not any posted document kind.",
    ],
    "results": results,
    "source_sha256": manifest,
}
(HERE / "model-results.json").write_text(json.dumps(output, indent=2) + "\n")
for result in results:
    print(f"{result['status']}\t{result['claim']}\t{result.get('cases', result.get('states', ''))}")
