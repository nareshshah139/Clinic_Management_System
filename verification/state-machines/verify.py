#!/usr/bin/env python3
"""Check every state machine model in this folder against its declared verdicts.

usage: verify.py [--jar tla2tools.jar] [MODEL_DIR ...]

Each model folder holds a TLA+ spec, model.py (constants, modes, rules, expected verdicts,
replay tests) and view.py (chart labels). Every rule runs in its own TLC process.
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE))
import tlc  # noqa: E402


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def model_dirs(names):
    if names:
        return [Path(n).resolve() if Path(n).exists() else (HERE / n).resolve() for n in names]
    return sorted(p.parent for p in HERE.glob("*/model.py"))


def structure_problems(d: Path, m) -> list[str]:
    problems = []
    rules, expect = m.RULES, m.EXPECT
    for mode in ("code", "fixed"):
        if mode not in m.MODES:
            problems.append(f"{d.name}: no '{mode}' mode")
            continue
        missing = set(rules) - set(expect.get(mode, {}))
        if missing:
            problems.append(f"{d.name}: mode {mode} does not check {sorted(missing)}")
    for rule, verdict in expect.get("fixed", {}).items():
        if verdict != "holds":
            problems.append(f"{d.name}: fixed mode must hold every rule, {rule} is {verdict}")
    for rule in rules:
        if not any(exp.get(rule) == "breaks" for exp in expect.values()):
            problems.append(f"{d.name}: no mode breaks {rule}, so nothing shows the rule can fail")
    for mode, exp in expect.items():
        if mode not in m.MODES:
            problems.append(f"{d.name}: EXPECT names unknown mode {mode}")
        for rule, verdict in exp.items():
            if rule not in rules:
                problems.append(f"{d.name}: EXPECT[{mode}] names unknown rule {rule}")
            if verdict not in ("holds", "breaks"):
                problems.append(f"{d.name}: EXPECT[{mode}][{rule}] is {verdict!r}")
    replays = getattr(m, "REPLAYS", {})
    for rule, verdict in expect.get("code", {}).items():
        if verdict != "breaks":
            continue
        target = replays.get(rule)
        if not target:
            problems.append(f"{d.name}: {rule} breaks in code mode but REPLAYS names no test that replays it")
            continue
        path = REPO / target
        if not path.is_file():
            problems.append(f"{d.name}: replay for {rule} not found at {target}")
            continue
        text = path.read_text()
        if rule not in text or ".failing(" not in text:
            problems.append(f"{d.name}: {target} must name {rule} in a test marked .failing")
    for name in ("state", "step"):
        if not hasattr(load(d / "view.py", f"{d.name}_view"), name):
            problems.append(f"{d.name}: view.py has no {name}()")
    return problems


def jobs_for(d: Path, m, jar):
    spec = d / m.SPEC
    for mode, exp in m.EXPECT.items():
        consts = {**m.CONSTANTS, **m.MODES[mode]}
        for rule, want in exp.items():
            kind = m.RULES[rule]
            yield d, mode, rule, want, (lambda s=spec, c=consts, r=rule, k=kind: tlc.check(
                s, c, jar=jar, invariant=r if k == "invariant" else None, prop=r if k == "property" else None)[0])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jar")
    ap.add_argument("dirs", nargs="*")
    args = ap.parse_args()
    jar = tlc.jar_path(args.jar)
    failures, problems, jobs = 0, [], []
    for d in model_dirs(args.dirs):
        m = load(d / "model.py", f"{d.name}_model")
        problems += structure_problems(d, m)
        jobs += list(jobs_for(d, m, jar))
    for p in problems:
        print("STRUCTURE", p)
    jobs_at_once = int(os.environ.get("STATE_MACHINES_JOBS") or max(1, (os.cpu_count() or 2) - 1))
    with ThreadPoolExecutor(max_workers=jobs_at_once) as pool:
        results = list(pool.map(lambda j: (j, j[4]()), jobs))
    for (d, mode, rule, want, _), run in results:
        ok = run.verdict == want
        failures += not ok
        detail = f"{run.states} states" if run.verdict == "holds" else f"{len(run.trace)}-state trace" if run.verdict == "breaks" else "TLC error"
        print(f"{'PASS' if ok else 'FAIL'} {d.name:<24} {mode:<20} {rule:<32} expected {want}, got {run.verdict} ({detail})")
        if run.verdict == "error" or not ok:
            print(run.output[-3000:])
    if problems or failures:
        sys.exit(f"{failures} verdict(s) and {len(problems)} structure problem(s) did not match")
    print(f"All {len(results)} verdicts matched across {len(model_dirs(args.dirs))} model(s).")


if __name__ == "__main__":
    main()
