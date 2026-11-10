#!/usr/bin/env python3
"""CR-33 Pharmacy Report: SMT proofs of the money rules, with negative controls.

1. GSTR-3B credit set-off (backend/src/modules/pharmacy/pharmacy-gst-reports.ts, setOff), for every
   non-negative liability and credit:
   - every head balances: paid through credit + paid in cash = liability, and credit used + carried
     forward = credit;
   - the allocation is legal under CGST Act s.49(5), s.49A and rule 88A: only the permitted routes;
     IGST credit pays IGST first, CGST and SGST credit pay their own head before IGST, and IGST
     credit is exhausted before any CGST or SGST credit is used;
   - it is cash-optimal: no legal allocation of the same credit pays less tax in cash.
   Negative controls: the naive greedy order (IGST credit to CGST before SGST, regardless of what
   CGST credit can cover) is shown suboptimal, and a route from CGST credit to SGST is shown illegal.
2. Daily collection (pharmacy-daily-collection.ts): a bill's ledger holds receipts and refunds handed
   back (negative entries), and collected is their sum. For every bill, billed = collected by day end -
   paid above the bill + still due, a refund taken from a day's mode lowers that day's expected money by
   exactly the refund, and the status follows the sign of the difference. A second conformance step runs
   the real buildDailyCollection on random days with refunds and checks the same identities.

The proofs are over real numbers; the code rounds each step to the paisa, which the Jest suites cover.
Run: python3 verification/cr33-pharmacy-report/check_money.py
"""
import json
import random
import subprocess
import sys
from pathlib import Path

from z3 import And, If, Implies, Not, Or, Real, RealVal, Solver, Sum, sat, unsat

HEADS = ["igst", "cgst", "sgst", "cess"]
ROUTES = [("igst", "igst"), ("igst", "cgst"), ("igst", "sgst"), ("cgst", "cgst"), ("cgst", "igst"),
          ("sgst", "sgst"), ("sgst", "igst"), ("cess", "cess")]
ZERO = RealVal(0)


def zmin(a, b):
    return If(a <= b, a, b)


def zmax(a, b):
    return If(a >= b, a, b)


def set_off(liability, credit, order):
    """Symbolic copy of setOff: `order` is the list of (from, to, cap) steps the code takes."""
    left = dict(liability)
    avail = dict(credit)
    used = {(f, t): ZERO for f in HEADS for t in HEADS}
    for f, t, cap in order:
        amount = zmin(avail[f], left[t])
        if cap is not None:
            amount = zmin(amount, cap(left, avail))
        amount = zmax(amount, ZERO)
        avail[f] = avail[f] - amount
        left[t] = left[t] - amount
        used[(f, t)] = used[(f, t)] + amount
    return used, left, avail


SHORTFALL = lambda head: (lambda left, avail: zmax(left[head] - avail[head], ZERO))  # noqa: E731

CODE_ORDER = [
    ("igst", "igst", None),
    ("igst", "cgst", SHORTFALL("cgst")),
    ("igst", "sgst", SHORTFALL("sgst")),
    ("igst", "cgst", None),
    ("igst", "sgst", None),
    ("cgst", "cgst", None),
    ("cgst", "igst", None),
    ("sgst", "sgst", None),
    ("sgst", "igst", None),
    ("cess", "cess", None),
]
GREEDY_ORDER = [step for step in CODE_ORDER if step[2] is None]
CROSS_ORDER = CODE_ORDER[:-1] + [("cgst", "sgst", None), ("cess", "cess", None)]


def legal(used, liability, credit):
    """Constraints any lawful utilisation satisfies."""
    rules = [used[(f, t)] >= 0 for f in HEADS for t in HEADS]
    rules += [used[(f, t)] == 0 for f in HEADS for t in HEADS if (f, t) not in ROUTES]
    rules += [Sum([used[(f, t)] for t in HEADS]) <= credit[f] for f in HEADS]
    rules += [Sum([used[(f, t)] for f in HEADS]) <= liability[t] for t in HEADS]
    paid = {t: Sum([used[(f, t)] for f in HEADS]) for t in HEADS}
    igst_used = Sum([used[("igst", t)] for t in HEADS])
    other_used = Sum([used[(f, t)] for f in ("cgst", "sgst") for t in HEADS])
    # s.49(5)(a): IGST credit pays IGST first; only what remains may pay CGST or SGST.
    rules.append(Implies(used[("igst", "cgst")] + used[("igst", "sgst")] > 0, used[("igst", "igst")] == liability["igst"]))
    # s.49(5)(b) and (d): CGST and SGST credit pay their own head first, and only then IGST.
    rules.append(Implies(used[("cgst", "igst")] > 0, paid["cgst"] == liability["cgst"]))
    rules.append(Implies(used[("sgst", "igst")] > 0, paid["sgst"] == liability["sgst"]))
    # Rule 88A / s.49A: IGST credit is used in full before any CGST or SGST credit.
    rules.append(Implies(other_used > 0, igst_used == credit["igst"]))
    return And(rules)


def cash(used, liability):
    return Sum([liability[t] - Sum([used[(f, t)] for f in HEADS]) for t in HEADS])


def inputs(prefix):
    liability = {h: Real(f"{prefix}_L_{h}") for h in HEADS}
    credit = {h: Real(f"{prefix}_C_{h}") for h in HEADS}
    domain = And([v >= 0 for v in list(liability.values()) + list(credit.values())])
    return liability, credit, domain


def prove(name, claim, domain):
    """Valid iff the negation is unsatisfiable within the domain."""
    solver = Solver()
    solver.add(domain, Not(claim))
    result = solver.check()
    return result == unsat, (solver.model() if result == sat else None)


def refute(name, claim, domain):
    """A negative control: the claim must fail for some input."""
    holds, model = prove(name, claim, domain)
    return not holds, model


def optimal(order):
    liability, credit, domain = inputs("o")
    used, _, _ = set_off(liability, credit, order)
    other = {(f, t): Real(f"x_{f}_{t}") for f in HEADS for t in HEADS}
    solver = Solver()
    solver.add(domain, legal(other, liability, credit), cash(other, liability) < cash(used, liability))
    result = solver.check()
    return result == unsat, (solver.model() if result == sat else None)


ROOT = Path(__file__).resolve().parents[2]
RUN_CODE = r"""
require(require.resolve('ts-node', { paths: [process.cwd()] })).register({ transpileOnly: true, project: 'tsconfig.json' });
const { setOff } = require('./src/modules/pharmacy/pharmacy-gst-reports.ts');
const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(cases.map(([L, C]) => setOff(L, C))));
"""
RUN_COLLECTION = r"""
require(require.resolve('ts-node', { paths: [process.cwd()] })).register({ transpileOnly: true, project: 'tsconfig.json' });
const { buildDailyCollection } = require('./src/modules/pharmacy/pharmacy-daily-collection.ts');
const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(cases.map((input) => buildDailyCollection(input))));
"""


def conformance(count=400):
    """The symbolic model above must compute what the TypeScript setOff computes."""
    rng = random.Random(33)
    pick = lambda: round(rng.choice([0, 0, rng.uniform(0, 500), rng.uniform(0, 50)]), 2)  # noqa: E731
    cases = [[{h: pick() for h in HEADS}, {h: pick() for h in HEADS}] for _ in range(count)]
    proc = subprocess.run(["node", "-e", RUN_CODE], input=json.dumps(cases), capture_output=True, text=True, cwd=ROOT / "backend")
    if proc.returncode:
        return False, proc.stderr[-2000:]
    results = json.loads(proc.stdout)
    for (L, C), got in zip(cases, results):
        used, left, avail = set_off({h: RealVal(str(L[h])) for h in HEADS}, {h: RealVal(str(C[h])) for h in HEADS}, CODE_ORDER)
        from z3 import simplify
        value = lambda e: float(simplify(e).as_fraction())  # noqa: E731
        for t in HEADS:
            if abs(value(left[t]) - got["cash"][t]) > 0.011 or abs(value(avail[t]) - got["carriedForward"][t]) > 0.011:
                return False, {"liability": L, "credit": C, "code": got, "model_cash": {h: value(left[h]) for h in HEADS}}
    return True, None


DAYS = ["2026-11-09", "2026-11-10", "2026-11-11"]
MODES = ["CASH", "UPI", "CARD"]


def collection_cases(count, rng):
    cases = []
    for _ in range(count):
        day = DAYS[1]
        bills = []
        for index in range(rng.randint(0, 4)):
            total = round(rng.uniform(0, 900), 2)
            payments, received = [], 0.0
            for _ in range(rng.randint(0, 3)):
                amount = round(rng.uniform(0, 600), 2)
                received += amount
                payments.append({"mode": rng.choice(MODES), "amount": amount, "day": rng.choice(DAYS)})
            excess = round(received - total, 2)
            if excess > 0 and rng.random() < 0.6:
                refund = round(rng.uniform(0.01, excess), 2)
                latest = max([p["day"] for p in payments])
                payments.append({"mode": rng.choice(MODES), "amount": -refund, "day": rng.choice([d for d in DAYS if d >= latest])})
            bills.append({"id": f"b{index}", "number": f"PHI-{index}", "day": rng.choice(DAYS[:2]), "entryAt": "2026-11-10T04:00:00.000Z",
                          "state": rng.choice(["FINAL", "FINAL", "FINAL", "CANCELLED"]), "customer": None, "total": total, "payments": payments})
        counter = [{"id": f"c{i}", "number": f"CS-{i}", "day": rng.choice(DAYS), "entryAt": "2026-11-10T05:00:00.000Z", "customer": None,
                    "total": round(rng.uniform(1, 300), 2), "mode": rng.choice(MODES + ["CREDIT"])} for i in range(rng.randint(0, 2))]
        returns = [{"id": f"r{i}", "number": f"RET-{i}", "day": rng.choice(DAYS), "entryAt": "2026-11-10T06:00:00.000Z", "customer": None,
                    "total": round(rng.uniform(1, 200), 2), "refundMode": rng.choice(MODES + ["CREDIT"])} for i in range(rng.randint(0, 2))]
        cases.append({"day": day, "bills": bills, "counterSales": counter, "returns": returns, "history": []})
    return cases


def collection_conformance(count=300):
    """The real buildDailyCollection keeps the ledger identities on random days with refunds."""
    cases = collection_cases(count, random.Random(3324))
    proc = subprocess.run(["node", "-e", RUN_COLLECTION], input=json.dumps(cases), capture_output=True, text=True, cwd=ROOT / "backend")
    if proc.returncode:
        return False, proc.stderr[-2000:]
    near = lambda a, b: abs(a - b) <= 0.011  # noqa: E731
    for case, got in zip(cases, json.loads(proc.stdout)):
        day = case["day"]
        moved = sum(p["amount"] for b in case["bills"] for p in b["payments"] if p["day"] == day)
        moved += sum(c["total"] for c in case["counterSales"] if c["day"] == day and c["mode"] != "CREDIT")
        moved -= sum(r["total"] for r in case["returns"] if r["day"] == day and r["refundMode"] != "CREDIT")
        handed_back = sum(-p["amount"] for b in case["bills"] for p in b["payments"] if p["day"] == day and p["amount"] < 0)
        handed_back += sum(r["total"] for r in case["returns"] if r["day"] == day and r["refundMode"] != "CREDIT")
        b = got["billing"]
        lines_ok = all(near(m["expected"], m["onTodaysBills"] + m["onEarlierBills"] + m["counterSales"] - m["refunds"]) and m["refunds"] >= 0 for m in got["modes"])
        if not (near(got["expectedTotal"], moved) and near(b["billed"], b["collectedOnTodaysBills"] - b["paidAboveBill"] + b["dueAtDayEnd"])
                and near(sum(m["refunds"] for m in got["modes"]), handed_back) and near(got["refunds"]["paidOut"], handed_back) and lines_ok):
            return False, {"input": case, "code": got}
    return True, None


def main():
    checks = []
    checks.append((f"the symbolic model computes what setOff in the code computes (400 random cases)", *conformance(), True))
    checks.append(("buildDailyCollection keeps the ledger identities on 300 random days with refunds", *collection_conformance(), True))
    liability, credit, domain = inputs("s")
    used, left, avail = set_off(liability, credit, CODE_ORDER)

    balances = And(
        [Sum([used[(f, t)] for f in HEADS]) + left[t] == liability[t] for t in HEADS]
        + [left[t] >= 0 for t in HEADS]
        + [Sum([used[(f, t)] for t in HEADS]) + avail[f] == credit[f] for f in HEADS]
        + [avail[f] >= 0 for f in HEADS]
    )
    checks.append(("every head balances (credit + cash = liability; used + carried = credit)", *prove("balance", balances, domain), True))
    checks.append(("the set-off is legal under s.49 and rule 88A", *prove("legal", legal(used, liability, credit), domain), True))
    checks.append(("no legal allocation pays less tax in cash", *optimal(CODE_ORDER), True))

    # Negative controls: each must be shown wrong, or the proofs above are not testing anything.
    greedy_ok, greedy_model = optimal(GREEDY_ORDER)
    checks.append(("CONTROL greedy IGST-to-CGST-first order is suboptimal", not greedy_ok, greedy_model, False))
    cl, cc, cd = inputs("x")
    cross_used, _, _ = set_off(cl, cc, CROSS_ORDER)
    cross_legal, cross_model = prove("cross", legal(cross_used, cl, cc), cd)
    checks.append(("CONTROL a CGST-credit-to-SGST route is illegal", not cross_legal, cross_model, False))

    # Daily collection: one bill of total T, receipts R and refunds F handed back by day end; refunds never exceed receipts.
    T, R, F = Real("T"), Real("R"), Real("F")
    collected = R - F
    due, above = zmax(T - collected, ZERO), zmax(collected - T, ZERO)
    bill_domain = And(T >= 0, R >= 0, F >= 0, F <= R)
    checks.append(("billed = collected (receipts - refunds) - paid above the bill + still due, for every bill", *prove("bill", collected - above + due == T, bill_domain), True))
    checks.append(("a bill is never both due and paid above", *prove("exclusive", Or(due == 0, above == 0), bill_domain), True))
    # A day's expected money in one mode: receipts Rd + counter sales Cd - refunds on bills Fd - return refunds Xd.
    Rd, Cd, Fd, Xd, G = Real("Rd"), Real("Cd"), Real("Fd"), Real("Xd"), Real("G")
    expected = lambda refund: Rd + Cd - refund - Xd  # noqa: E731
    checks.append(("a refund handed back on a day lowers that day's expected money by exactly the refund", *prove("refund", expected(Fd + G) == expected(Fd) - G, And(Rd >= 0, Cd >= 0, Fd >= 0, Xd >= 0, G >= 0)), True))
    # Negative control: the reader that dropped refunds (COMPLETED receipts only) overstates the drawer whenever money went back.
    checks.append(("CONTROL counting receipts only overstates expected money after a refund", not prove("receipts-only", Rd + Cd - Xd == expected(Fd), And(Rd >= 0, Cd >= 0, Fd >= 0, Xd >= 0))[0], None, False))
    D = Real("D")
    status = If(And(D > -RealVal("0.005"), D < RealVal("0.005")), 0, If(D < 0, -1, 1))
    checks.append(("SHORT exactly when counted < expected beyond half a paisa", *prove("status", And(Implies(status == -1, D < 0), Implies(D <= -RealVal("0.005"), status == -1), Implies(D >= RealVal("0.005"), status == 1)), D == D), True))

    failures = 0
    for name, ok, model, _positive in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}")
        if not ok:
            failures += 1
            print(f"      counterexample: {model}")
        elif model is not None and name.startswith("CONTROL"):
            print(f"      witness: {model}")
    print(f"\n{len(checks) - failures}/{len(checks)} money proofs and controls hold")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
