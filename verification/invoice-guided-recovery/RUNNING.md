# Verify invoice recovery

Use Python 3, Java 17 or later, Graphviz `dot`, and the TLA+ 1.7.4 `tla2tools.jar`. The pinned JAR has SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`. Its embedded checker reports TLC 2.19, revision `5a47802`.

From the repository root, run:

```sh
export JAVA=/absolute/path/to/java
export TLA2TOOLS=/absolute/path/to/tla2tools.jar
python3 -m unittest discover -s verification/invoice-guided-recovery -p 'test_*.py'
python3 verification/invoice-guided-recovery/verify.py --output /tmp/invoice-recovery-formal --adjacency
```

The runner prints one JSON result and exits successfully only after the base exploration, all edge checks, all recovery checks, and all four negative controls pass. `--output` defaults to a new temporary directory. `--adjacency` adds the full state map, edges, initial states, and recovery distances in `adjacency.json.gz`.

Each TLC invocation has a 60-second timeout. Use `--timeout` to change that limit. A timeout, tool mismatch, malformed graph, missing witness, unexpected mutant result, or failed invariant exits nonzero and writes `run-status.json` with `status` set to `incomplete`. Inspect the corresponding `tlc.log` before changing the model. Sandboxed systems may need permission for TLC's local coordination socket.

To regenerate the compact committed artifacts after reviewing a model change, run:

```sh
python3 verification/invoice-guided-recovery/verify.py \
	--output /tmp/invoice-recovery-formal \
	--publish verification/invoice-guided-recovery/results \
	--adjacency
```

Review `results/summary.json`, `results/state-graph.svg`, `results/witnesses.json`, and all four traces in `results/negative-controls.json`. Confirm that the source hashes match the reviewed model and runner. A previous published artifact remains unchanged when a later run fails. The later run's exit status and `run-status.json` determine its result.

When an application transition or guard changes, update the correspondence map and model together. Add a real component regression for a model counterexample before relying on it to justify an application fix. Preserve the negative controls and the rule that recovery cannot abandon the invoice.
