"""Proves the queue coverage rules in backend/src/modules/pharmacy/pharmacy-billing-quantity.ts
and the allocation in queueStatusPage / toMedicationCoverage, over exact arithmetic.

Floating-point agreement between Postgres and TypeScript is checked separately by
backend/src/modules/pharmacy/tests/pharmacy-queue-selling-units.database.spec.ts.
"""
import json
import sys
import z3

results = {}


def prove(name, premise, conclusion):
    reachable = z3.Solver()
    reachable.add(premise)
    if reachable.check() != z3.sat:
        results[name] = 'VACUOUS: premise unsatisfiable'
        return
    solver = z3.Solver()
    solver.add(premise, z3.Not(conclusion))
    outcome = solver.check()
    results[name] = 'proved' if outcome == z3.unsat else f'FAILED: {solver.model()}' if outcome == z3.sat else 'unknown'


def implies(premise, conclusion):
    return premise, conclusion


def ceil(x):
    return -z3.ToInt(-x)


explicit, stated_unit, doses_known, line_measured, inv_measured, inv_packs = z3.Bools(
    'explicit stated_unit doses_known line_measured inv_measured inv_packs')
E = z3.Real('E')
D, p = z3.Ints('D p')
facts = z3.And(E > 0, D >= 1)

# explicit: the item states a quantity E. stated_unit: its quantityUnit names a selling unit
# (the doctor counted strips, tubes...). Without stated_unit, E counts dose units (tablets).
measured = z3.Or(line_measured, inv_measured)
known = z3.Or(explicit, doses_known, line_measured, inv_measured)
need = z3.If(explicit, E, z3.If(doses_known, z3.ToReal(D), z3.RealVal(1)))
in_selling_units = z3.If(explicit, z3.Or(stated_unit, line_measured),
                         z3.And(z3.Not(doses_known), measured))
value = z3.If(in_selling_units, z3.RealVal(1),
              z3.If(measured, z3.If(explicit, z3.RealVal(1), need),
                    z3.If(inv_packs, z3.If(p > 0, z3.ToReal(p), need), z3.RealVal(1))))
billed = z3.If(z3.And(explicit, z3.Or(stated_unit, measured)), E,
               z3.If(measured, z3.RealVal(1),
                     z3.If(z3.And(z3.Not(explicit), z3.Not(doses_known)), z3.RealVal(1),
                           z3.If(z3.And(inv_packs, z3.Not(p > 0)), z3.RealVal(1),
                                 z3.ToReal(ceil(need / value))))))

prove('selling unit value is positive',
      *implies(z3.And(facts, known), value > 0))
prove('billing the suggested quantity covers the line',
      *implies(z3.And(facts, known), billed * value >= need))
prove('billing one unit fewer leaves the line short',
      *implies(z3.And(facts, known, billed > 1), (billed - 1) * value < need))
prove('a strip course bills ceil(doses / pack size) strips',
      *implies(z3.And(facts, z3.Not(explicit), doses_known, z3.Not(line_measured), z3.Not(inv_measured), inv_packs, p > 0),
                 z3.And(value == z3.ToReal(p), billed == z3.ToReal(ceil(z3.ToReal(D) / z3.ToReal(p))))))
prove('an explicit tablet count bills ceil(count / pack size) strips',
      *implies(z3.And(facts, explicit, z3.Not(stated_unit), z3.Not(line_measured), z3.Not(inv_measured), inv_packs, p > 0),
                 z3.And(value == z3.ToReal(p), billed == z3.ToReal(ceil(E / z3.ToReal(p))))))
prove('an explicit tablet count of a strip with no pack size bills 1 strip',
      *implies(z3.And(facts, explicit, z3.Not(stated_unit), z3.Not(measured), inv_packs, z3.Not(p > 0)),
                 billed == 1))
prove('an explicit count in a stated selling unit bills as entered',
      *implies(z3.And(facts, explicit, stated_unit), z3.And(value == 1, billed == E)))
prove('an explicit count on a measured item bills the stated count of packs',
      *implies(z3.And(facts, explicit, measured), z3.And(value == 1, billed == E)))
prove('one measured pack covers a measured line with no explicit quantity',
      *implies(z3.And(facts, known, z3.Not(explicit), measured), 1 * value >= need))
EXAMPLES = [(10, 10, 1), (15, 10, 2), (20, 10, 2), (21, 10, 3), (1, 10, 1)]
for count, pack, strips in EXAMPLES:
    prove(f'{count} tablets of a {pack}-per-strip pack bill {strips} strip(s)',
          *implies(z3.And(explicit, z3.Not(stated_unit), z3.Not(measured), inv_packs, E == count, p == pack, facts),
                     billed == strips))

N, R, S, x, r, v = z3.Reals('N R S x r v')
taken = z3.If(x < R, x, R)
prove('sequential remainder equals the window remainder (induction step)',
      *implies(z3.And(N > 0, x >= 0, R == z3.If(N - S > 0, N - S, 0)),
                 R - taken == z3.If(N - (S + x) > 0, N - (S + x), 0)))
prove('window take equals sequential take',
      *implies(z3.And(N > 0, x >= 0, R == z3.If(N - S > 0, N - S, 0)),
                 taken == z3.If(x < z3.If(N - S > 0, N - S, 0), x, z3.If(N - S > 0, N - S, 0))))

line_take = z3.If(r * v < R, r * v, R)
prove('an allocation never takes more units than remain and never goes negative',
      *implies(z3.And(r >= 0, v > 0, R >= 0),
                 z3.And(line_take / v >= 0, line_take / v <= r, r - line_take / v >= 0)))

K = 6
need_n = z3.Real('need')
avail = [z3.Real(f'a{i}') for i in range(K)]
vals = [z3.Real(f'v{i}') for i in range(K)]
bounds = [z3.And(a >= 0, w > 0) for a, w in zip(avail, vals)]
remaining = need_n
window_total = z3.RealVal(0)
prefix = z3.RealVal(0)
for a, w in zip(avail, vals):
    supply = a * w
    step = z3.If(supply < remaining, supply, remaining)
    gap = z3.If(need_n - prefix > 0, need_n - prefix, 0)
    window_total = window_total + z3.If(supply < gap, supply, gap)
    remaining = remaining - step
    prefix = prefix + supply
dispensed = z3.If(need_n < prefix, need_n, prefix)
prove(f'dispensed = min(need, supply) matches the greedy fill for {K} invoice items',
      *implies(z3.And(need_n > 0, *bounds), z3.And(window_total == dispensed, need_n - remaining == dispensed)))
prove(f'a line is covered exactly when supply reaches its need for {K} invoice items',
      *implies(z3.And(need_n > 0, *bounds), (dispensed >= need_n) == (prefix >= need_n)))

print(json.dumps(results, indent=2))
sys.exit(0 if all(value == 'proved' for value in results.values()) else 1)
