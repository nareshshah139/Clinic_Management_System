from pathlib import Path
from collections import deque
import csv, hashlib, json
import z3

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def verify():
    """
    @cc [owner:nareshshah139,label:verification] knowledge-proof-scope
    The checker MUST reject production-source drift and every emitted uncertainty or permission
    counterexample. Recovery reachability MUST remain conditional on exact identity and available authority.
    """
    fingerprints = json.loads((HERE / 'presentation-sources.json').read_text())
    assert all(hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest for file, digest in fingerprints.items())
    rows = list(csv.DictReader((HERE / 'presentation-cases.tsv').open(), delimiter='\t'))
    assert len(rows) == len({r['kind'] for r in rows}) * len({r['status'] for r in rows}) * 4 * 3 * 7
    assert len({tuple(r[k] for k in ('kind','status','write','approve','effect','knowledge','operation')) for r in rows}) == len(rows)
    uncertain = [r for r in rows if r['knowledge'] in ('loading', 'load-failed', 'unconfirmed')]
    assert all(r['stockEffect'] == 'unknown' and r['canMutate'] == r['canEdit'] == '0' and r['checkLabel'] for r in uncertain)
    assert all(r['canMutate'] == r['canEdit'] == '0' for r in rows if r['write'] == '0')
    assert all(r['explanationComplete'] == '1' for r in rows)
    flags = z3.Bools('uncertain can_mutate can_edit stock_unknown check_visible explanation_complete write_authority')
    relation = sorted({(r['knowledge'] in ('loading', 'load-failed', 'unconfirmed'), r['canMutate'] == '1', r['canEdit'] == '1', r['stockEffect'] == 'unknown', bool(r['checkLabel']), r['explanationComplete'] == '1', r['write'] == '1') for r in rows})
    bad = z3.Or(z3.And(flags[0], z3.Or(flags[1], flags[2], z3.Not(flags[3]), z3.Not(flags[4]))), z3.And(z3.Not(flags[6]), flags[1]), z3.Not(flags[5]))
    solver = z3.Solver()
    solver.add(z3.Or(*[z3.And(*[flag == value for flag, value in zip(flags, values)]) for values in relation]), bad)
    assert solver.check() == z3.unsat
    (HERE / 'presentation-safety.smt2').write_text(solver.to_smt2())
    mutant_solver = z3.Solver()
    mutant_solver.add(z3.And(*[flag == value for flag, value in zip(flags, (True, True, False, True, True, True, True))]), bad)
    assert mutant_solver.check() == z3.sat
    statuses = sorted({r['status'] for r in rows})
    known = {'known:' + status for status in statuses}
    nodes = known | {'new', 'loading', 'load-failed', 'unconfirmed:create', 'unconfirmed:save', 'unconfirmed:transition', 'handoff'}
    edges = {s: set() for s in nodes}
    for state in nodes:
        edges[state].add(state)  # Waiting or repeated service failure is always possible.
        if state.startswith('unconfirmed:') or state in ('loading', 'load-failed'):
            edges[state] |= known | {'handoff'}
        elif state == 'new':
            edges[state] |= {'known:DRAFT', 'unconfirmed:create', 'handoff'}
        elif state.startswith('known:'):
            edges[state] |= {'handoff'}
    def reaches(start, graph):
        queue, seen = deque([start]), {start}
        while queue:
            state = queue.popleft()
            if state in known or state == 'handoff': return True
            for other in graph[state] - seen:
                seen.add(other); queue.append(other)
        return False
    assert all(reaches(state, edges) for state in nodes)
    mutations = {}
    for state in ('load-failed', 'unconfirmed:create', 'unconfirmed:transition'):
        mutant = {key: (set(value) if key != state else {state}) for key, value in edges.items()}
        mutations['remove recovery from ' + state] = not reaches(state, mutant)
    unsafe = dict(uncertain[0], canMutate='1')
    mutations['permit uncertain mutation'] = not (unsafe['canMutate'] == '0')
    assert all(mutations.values())
    version, expected = z3.Ints('current_version expected_version')
    fenced_version = z3.If(version == expected, version + 1, version)
    fence = z3.Solver()
    fence.add(version >= expected, expected >= 0, fenced_version == expected)
    assert fence.check() == z3.unsat
    (HERE / 'revision-fence-safety.smt2').write_text(fence.to_smt2())
    result = dict(result='PASS', presentation_cases=len(rows), uncertain_cases=len(uncertain), knowledge_states=len(nodes), smt='2 UNSAT (presentation relation; revision fence)', mutations=mutations,
        theorem='The finite abstract knowledge graph has a path to confirmed knowledge or explicit handoff. Edge availability is checked separately by mounted UI and backend regressions; this is not whole-program UI refinement.',
        assumptions=['Known branch-scoped record ID or retained exact creation request key and envelope.', 'Backend creation replay preserves the branch/request-key unique record and never replays the stock transition. A same-version lost transition stays unresolved until a revision fence or an advanced authoritative revision.', 'An authorized colleague and a successful service interval exist for handoff completion.', 'Finite presentation cross-product includes unreachable kind/status combinations; it does not expand supported backend transitions.'],
        non_claims=['AF eventual success: waiting and unavailable-service cycles remain counterexamples.', 'Human comprehension or OCR factual accuracy.', 'Whole-program refinement or arbitrary concurrent executions.', 'Handoff alone changes stock or reconstructs historical movements.'])
    (HERE / 'knowledge-results.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(json.dumps({key: result[key] for key in ('result','presentation_cases','uncertain_cases','knowledge_states','smt','mutations')}))


if __name__ == '__main__': verify()
