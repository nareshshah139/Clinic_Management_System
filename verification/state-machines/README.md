# State machine models

Each folder here is one subsystem's lifecycle written as a TLA+ model and checked by TLC. A model runs in two modes:

- `code` is what the code does at the commit the model names. Its verdicts say which rules the code breaks today.
- `fixed` is the smallest change that makes every rule hold. It is the specification for the fix.

Other modes are negative controls. Each removes one guard from `fixed` and must break the rule that guard protects. A rule that no mode breaks could be vacuous, so the runner refuses it.

Every rule that breaks in `code` mode has a replay test. The test drives the real code through TLC's shortest path for that rule. It asserts the correct outcome and is marked `.failing`, so it passes while the bug exists. When someone fixes the code, the replay starts passing outright and jest reports the `.failing` marker as wrong. Remove the marker, then change the rule's `code` verdict to `holds` in `model.py`.

## Run

```sh
python3 verification/state-machines/verify.py --jar /path/to/tla2tools.jar            # every model
python3 verification/state-machines/verify.py --jar /path/to/tla2tools.jar <folder>   # one model
python3 verification/state-machines/chart.py --jar /path/to/tla2tools.jar <folder>    # redraw its charts
```

Both accept only tla2tools v1.7.4. `TLA2TOOLS` can stand in for `--jar`. Replay tests run with the backend and frontend suites. The backend ones need `FORMAL_REPLAY_TEST_DATABASE_URL` set to a loopback PostgreSQL URL, and are skipped without it.

## Files in a model folder

| File | Holds |
| --- | --- |
| `*.tla` | The spec. `Next` is a disjunction of named actions. Rules are invariants (safety) and temporal properties (liveness). |
| `model.py` | Constants, modes, rules, the verdict each mode must get, and the replay test for each rule `code` breaks. |
| `view.py` | `state(vars)` and `step(action, from, to)`, which name states and arrows in the reader's words for the chart. |
| `results/<mode>.mmd` | The Mermaid statechart. A state that breaks a rule is red. A state the system can stay in forever is amber and dashed. |
| `results/<mode>.md` | The rule table and TLC's shortest path to each broken rule. |
| `README.md` | What the model covers, a model-to-code table, every fairness assumption, and what the model leaves out. |

CI runs `verify.py` and `chart.py --check` on every pull request, so a chart cannot drift from its model.

## Tools

- `tlc.py` runs TLC on one rule at a time and parses its verdict, counterexample trace and state graph.
- `verify.py` checks each model's verdicts and its structure: both modes present, every rule checked in both, `fixed` holds everything, every rule breakable, every `code` break linked to a `.failing` replay.
- `chart.py` draws the charts and reports from TLC's own graph dump and counterexamples.
- `backend/src/shared/testing/interleave.ts` pauses one Prisma call so a replay test can run a second request in the gap. It turns a model's interleaving into a deterministic test.
