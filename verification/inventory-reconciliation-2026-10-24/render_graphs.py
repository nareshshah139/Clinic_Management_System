"""Render the reviewed recovery abstractions; labels state required evidence and guards."""
from pathlib import Path
import subprocess
HERE = Path(__file__).resolve().parent
style = '''graph [rankdir=LR, bgcolor="#f8fafc", pad="0.35", nodesep="0.45", ranksep="0.65", fontname="Helvetica", fontsize=19, labelloc=t];
node [shape=box, style="rounded,filled", fillcolor="#e2e8f0", color="#94a3b8", fontname="Helvetica", fontsize=12, margin="0.16,0.1"];
edge [fontname="Helvetica", fontsize=10, color="#475569", arrowsize=0.7];'''
graphs = {
'stock-state': r'''
label="Inventory safety and physical recovery";
valid [label="Valid batch\n0 ≤ held ≤ on-hand"];
check [label="Verified physical count P\nIdentity + unit confirmed",fillcolor="#fef3c7"];
dispose [label="P < held\nVerify missing held units\nLinked LOSS against source",fillcolor="#fef3c7"];
post [label="Fresh current COUNT\nRequired approval\ndelta = P − current on-hand"];
goal [label="Reconciled inventory\non-hand = P\ncheckpoint = P\nheld ≤ P",fillcolor="#d1fae5"];
valid -> check;
check -> post [label="P ≥ held"];
check -> dispose [label="P < held"];
dispose -> post [label="Refresh after disposition"];
post -> goal [label="One serializable transaction"];
goal -> valid [label="Later signed movements"];
''',
'count-recovery': r'''
label="Every supported count state has a fresh recovery attempt";
open [label="DRAFT · AWAITING_APPROVAL\nAPPROVED\n(including stale snapshots)"];
terminal [label="REJECTED · CANCELLED\nPOSTED · REVERSED"];
fresh [label="RECOUNT → linked DRAFT\nCurrent system snapshot\nNo copied physical measurements",fillcolor="#dbeafe"];
observed [label="Record a new physical count\nResolve held-stock discrepancy"];
approved [label="Required approval\nRecheck revision and balance"];
posted [label="POSTED\nStock + movement + checkpoint\nApproval + audit + event",fillcolor="#d1fae5"];
open -> fresh [label="Authorized + version matched"];
terminal -> fresh [label="Original history retained"];
fresh -> fresh [label="Same source/version retry\nreturns same attempt"];
fresh -> observed;
observed -> approved;
approved -> posted [label="Atomic commit"];
approved -> fresh [label="Conflict → refresh/recount",color="#b45309"];
''',
'workflow-lifecycle': r'''
label="Supported recovery routes preserve document history";
identity [label="Ambiguous linked products\nVerify physical product + unit"];
resolved [label="Retain selected existing product\nRevision + reason + audit"];
legacy [label="Unknown old ledger\nor independently detected drift"];
count [label="Fresh COUNT\nCurrent snapshot + new observation",fillcolor="#dbeafe"];
hold [label="Released hold with\nlinked consumer correction"];
comp [label="Atomic compensation\nReopen original quarantine"];
purchase [label="Invalid REVIEWED purchase"];
draft [label="Audited reopen → DRAFT\nCorrect → review → commit"];
goal [label="Verified inventory baseline\nq = P = checkpoint + later deltas",fillcolor="#d1fae5"];
identity -> resolved [label="Authorized confirmation"];
resolved -> count;
legacy -> count;
hold -> comp [label="Reverse loss / cancel return"];
comp -> count [label="Disposition if P < held"];
purchase -> draft [label="Unposted + current revision"];
draft -> count [label="Actual goods received"];
count -> goal [label="Required approval + atomic post"];
''',
'purchase-recovery': r'''
label="Reviewed purchase recovery without double intake";
draft [label="DRAFT / OCR review / reconciliation failed\nCorrect identity, receipt and quantities"];
review [label="REVIEWED\nReceipt validated before locking",fillcolor="#dbeafe"];
invalid [label="Legacy invalid REVIEWED\nor receipt changed after review",fillcolor="#fef3c7"];
commit [label="STOCK_COMMITTED\nOne quantity effect\nLinked receipt: price update only",fillcolor="#d1fae5"];
count [label="New physical count\nExplicit baseline if needed"];
cancel [label="CANCELLED\nRetained historical record"];
draft -> review [label="Resolve flags + validate receipt"];
review -> commit [label="Validate again + commit once"];
review -> draft [label="Reopen: audit + revision\ncreate AND review permission"];
invalid -> draft [label="Same audited reopen"];
review -> invalid [label="Dependency changed\nCommit fails atomically",style=dashed];
commit -> count [label="Correction by linked workflow\nor verified physical count"];
cancel -> draft [label="New intake for actual goods\nnew request identity",style=dashed];
''',
'hold-counterexample': r'''
label="Former blocked hold sequence now has a safe compensation path";
a [label="Start\nq=10, held=0"];
b [label="HOLD H posts 5\nq=10, held=5"];
c [label="LOSS L consumes 3 from H\nq=7, held=2"];
d [label="Release residual 2 from H\nq=7, held=0\nH=RELEASED"];
e [label="Reverse L atomically\nH=POSTED + versioned event\nq=10, held=3",fillcolor="#d1fae5"];
f [label="Verify disposition\nRelease original H if saleable\nq=10, held=0",fillcolor="#d1fae5"];
a -> b -> c -> d;
d -> e [label="Restore SAME source\nInverse stock + hold effects"];
e -> f;
e -> d [label="Any failure rolls back\nthe whole compensation",style=dashed,color="#b45309"];
''',
'ledger-counterexample': r'''
label="Explicit count checkpoint resolves the baseline, not unknown history";
a [label="Before\nq=10, old ledger=8\nVerified physical P=7",fillcolor="#fef3c7"];
b [label="Quantity adjustment alone\ndelta=−3\nq=7, old ledger=5\nHistorical gap stays 2",fillcolor="#fee2e2"];
c [label="Same COUNT transaction\nCheckpoint quantity=7\nRecord covered movement IDs\nRetain old entries unchanged",fillcolor="#dbeafe"];
d [label="Verified current ledger\nexpected = 7 + later signed deltas\nq=7, expected=7",fillcolor="#d1fae5"];
e [label="Later stock drift or unknown sign\nDISCREPANCY / UNVERIFIED\nFresh count available",fillcolor="#fef3c7"];
a -> b [label="Old quantity-only behavior"];
a -> c [label="Current atomic behavior"];
c -> d;
d -> e [label="Independent comparison"];
e -> c [label="New verified physical count"];
'''
}
for name, body in graphs.items():
    source = HERE / (name + '.dot')
    source.write_text('digraph G {\n' + style + '\n' + body + '\n}\n')
    for fmt in ('svg', 'png'):
        subprocess.run(['/opt/homebrew/bin/dot', '-T' + fmt, str(source), '-o', str(HERE / (name + '.' + fmt))], check=True)
print('Rendered six graphs as DOT, SVG and PNG.')
