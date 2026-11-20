#!/usr/bin/env python3
"""Draw a model's reachable states as a Mermaid statechart and report each rule's shortest bug path.

usage: chart.py [--jar tla2tools.jar] [--check] MODEL_DIR

For each mode in model.CHARTS, TLC explores the whole graph with no rules, view.state() names
each state in the reader's words, and view.step() names each step (None hides it). Each rule
the mode breaks is then run alone, and TLC's shortest counterexample becomes the numbered path.
Writes MODEL_DIR/results/<mode>.mmd and <mode>.md. With --check, fails if those files differ.
"""
from __future__ import annotations

import argparse
import sys
from collections import deque
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import tlc  # noqa: E402
from verify import load  # noqa: E402

MAX_ARROWS = 30


def esc(s: str) -> str:
    return s.replace('"', "'").replace("\n", " ")


def label_graph(view, states, starts, edges):
    label = {sid: view.state(v) for sid, v in states.items()}
    arrows: dict[tuple[str, str], set[str]] = {}
    hidden: set[str] = set()
    for a, b, action in edges:
        text = view.step(action, states[a], states[b])
        if text is None:
            hidden.add(action)
            continue
        if label[a] != label[b]:
            arrows.setdefault((label[a], label[b]), set()).add(text)
    start_labels = sorted({label[s] for s in starts})
    order, seen, queue = [], set(start_labels), deque(start_labels)
    while queue:
        cur = queue.popleft()
        order.append(cur)
        for nxt in sorted({b for (a, b) in arrows if a == cur}):
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    unreachable = sorted(set(label.values()) - seen)
    return order + unreachable, start_labels, arrows, hidden, unreachable


def bug_path(view, run):
    rows, prev = [], None
    for i, st in enumerate(run.trace):
        lab = view.state(st.vars)
        if prev is None:
            rows.append(f"1. {lab}")
        else:
            step = view.step(st.action, prev.vars, st.vars) or st.action
            rows.append(f"{i + 1}. {step}: {lab}")
        prev = st
    if run.loop_to is not None and run.trace:
        rows.append(f"From step {run.loop_to + 1} the system can repeat these steps, or stop here, forever.")
    return rows


def render(m, view, mode, jar):
    spec = Path(m.__file__).parent / m.SPEC
    consts = {**m.CONSTANTS, **m.MODES[mode]}
    base, dot = tlc.check(spec, consts, jar=jar, dump_dot=True)
    if base.verdict != "holds":
        raise SystemExit(f"TLC failed exploring {mode} with no rules:\n{base.output[-2000:]}")
    states, starts, edges = tlc.parse_dot(dot)
    order, start_labels, arrows, hidden, unreachable = label_graph(view, states, starts, edges)
    ids = {lab: f"s{i}" for i, lab in enumerate(order)}
    broken, paths = {}, []
    for rule, want in m.EXPECT[mode].items():
        if want != "breaks":
            continue
        kind = m.RULES[rule]
        run, _ = tlc.check(spec, consts, jar=jar, invariant=rule if kind == "invariant" else None,
                           prop=rule if kind == "property" else None)
        if run.verdict != "breaks":
            raise SystemExit(f"{mode}: expected {rule} to break, TLC says {run.verdict}")
        end = view.state(run.trace[-1].vars)
        cls = "stuck" if kind == "property" else "breaks"
        for st in run.trace[(run.loop_to or len(run.trace) - 1):] if kind == "property" else run.trace[-1:]:
            broken.setdefault(view.state(st.vars), set()).add((cls, rule))
        paths.append((rule, kind, getattr(m, "RULE_TEXT", {}).get(rule, ""), bug_path(view, run), end))
    title = getattr(view, "TITLE", m.SPEC)
    mmd = ["---", f'title: "{esc(title)} ({mode})"', "---", "stateDiagram-v2"]
    for lab in order:
        mmd.append(f'  state "{esc(lab)}" as {ids[lab]}')
    for lab in start_labels:
        mmd.append(f"  [*] --> {ids[lab]}")
    for (a, b), texts in sorted(arrows.items(), key=lambda kv: (order.index(kv[0][0]), order.index(kv[0][1]))):
        mmd.append(f"  {ids[a]} --> {ids[b]}: {esc(' / '.join(sorted(texts)))}")
    mmd += ["  classDef breaks fill:#fde2dd,stroke:#b3261e,stroke-width:2px",
            "  classDef stuck fill:#fdf0d5,stroke:#a35a05,stroke-width:2px,stroke-dasharray:5 3"]
    for cls in ("breaks", "stuck"):
        hit = [ids[lab] for lab in order if any(c == cls for c, _ in broken.get(lab, ()))]
        if hit:
            mmd.append(f"  class {','.join(hit)} {cls}")
    held = [r for r, w in m.EXPECT[mode].items() if w == "holds"]
    md = [f"# {title}, {mode} mode", "",
          f"TLC explored {len(states)} states and {len(edges)} steps. The chart has {len(order)} states and {len(arrows)} arrows.", "",
          "| Rule | Kind | Result |", "| --- | --- | --- |"]
    md += [f"| {r} | {m.RULES[r]} | {w} |" for r, w in m.EXPECT[mode].items()]
    md.append("")
    if held:
        md += [f"Holds: {', '.join(held)}.", ""]
    for rule, kind, text, rows, end in paths:
        md += [f"## {rule} breaks", ""] + ([text, ""] if text else []) + rows + [""]
    if hidden:
        md += ["## Steps the chart hides", "", ", ".join(sorted(hidden)), ""]
    if unreachable:
        md += ["## Chart states reachable only through hidden steps", "", ", ".join(unreachable), ""]
    if len(arrows) > MAX_ARROWS:
        md += [f"The chart has {len(arrows)} arrows, over the budget of {MAX_ARROWS}. Coarsen view.state().", ""]
    return "\n".join(mmd) + "\n", "\n".join(md)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jar")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("dir")
    args = ap.parse_args()
    d = Path(args.dir).resolve() if Path(args.dir).exists() else (HERE / args.dir).resolve()
    jar = tlc.jar_path(args.jar)
    m = load(d / "model.py", f"{d.name}_model")
    view = load(d / "view.py", f"{d.name}_view")
    out = d / "results"
    out.mkdir(exist_ok=True)
    drift = []
    for mode in m.CHARTS:
        mmd, md = render(m, view, mode, jar)
        for name, text in ((f"{mode}.mmd", mmd), (f"{mode}.md", md)):
            if args.check:
                if not (out / name).exists() or (out / name).read_text() != text:
                    drift.append(name)
            else:
                (out / name).write_text(text)
        print(f"{d.name} {mode}: {md.splitlines()[2]}")
    if drift:
        sys.exit(f"{d.name}: results differ from the model, rerun chart.py: {drift}")


if __name__ == "__main__":
    main()
