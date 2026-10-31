#!/usr/bin/env python3
import argparse
from collections import Counter, defaultdict, deque
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parent
JAR_SHA256 = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"
PHASES = (
    "unchecked", "checking", "blocked", "editing", "saving", "saveFailed",
    "savedChecking", "checkFailed", "savedCheckFailed", "ready", "reviewing",
    "reviewFailed", "committing", "stockUnknown", "readingBack", "committed", "handoff",
)
LABELS = {
    "unchecked": "Needs product check", "checking": "Checking products", "blocked": "Product details need attention",
    "editing": "Editing product details", "saving": "Saving product details", "saveFailed": "Save failed; entries retained",
    "savedChecking": "Details saved; checking again", "checkFailed": "Product check failed",
    "savedCheckFailed": "Details saved; check failed", "ready": "Ready for final review",
    "reviewing": "Saving draft / reviewing", "reviewFailed": "Review needs correction",
    "committing": "Adding stock", "stockUnknown": "Stock outcome unknown",
    "readingBack": "Confirming stock status", "committed": "Stock confirmed", "handoff": "Awaiting authorized colleague",
}
CALLBACKS = {
    "CheckReady", "CheckBlocked", "CheckFailure", "SaveSuccess", "SaveFailure", "DraftSaved", "DraftFailure",
    "ReviewReject", "ReviewCatch", "ReviewCleanup", "FocusCallback", "ReviewSuccess", "CommitSuccess", "CommitLost",
    "ReadbackSuccess", "ReadbackFailure",
}
RECOVERY_ACTIONS = {
    "BeginCheck", "CheckReady", "CheckBlocked", "CheckFailure", "EditProduct", "BeginSave", "SaveSuccess",
    "SaveFailure", "AskColleague", "ColleagueCorrects", "CorrectInvoice", "Approve", "RetryReadback",
    "ReadbackSuccess", "ReadbackFailure", "ReplaceEditor", "InvalidateEditor",
}
ABANDONMENT_ACTIONS = {"ReplaceEditor", "InvalidateEditor", "Unmount"}
UI_FIELDS = ("phase", "saved", "exact", "approved", "result", "busy", "focus", "typed")
MUTANTS = {"stalePublish": "staleSafe", "prematureReview": "reviewSafe", "retryStock": "stockSafe", "loseSaved": "savedSafe"}
ASSUMPTIONS = [
    "A later successful service response remains possible. Permanent outages are outside the recovery claim.",
    "Correct product details or an authorized colleague's assistance are available. Handoff alone is not recovery.",
    "The exact catalogue endpoint truthfully reports completeness for every current invoice line.",
    "The stock endpoint is authorized, atomic and idempotent per invoice. This model does not prove database transactions.",
    "Stock readback can eventually return a decisive status. Lost responses do not justify another stock attempt before readback.",
]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def parse_state(label):
    state = {}
    for field in ("invoice", "phase", "result", "saved", "exact", "approved", "busy", "focus", "typed", "canEdit", "complete", "stockA", "stockB"):
        found = re.search(r"\b" + field + r'\s*\|->\s*("[^"\n]+"|TRUE|FALSE|\d+)', label)
        require(found is not None, f"Missing state field {field}")
        value = found.group(1)
        state[field] = json.loads(value) if value.startswith('"') else {"TRUE": True, "FALSE": False}.get(value, int(value) if value.isdigit() else value)
    state["ops"] = [
        {"kind": kind, "current": current == "TRUE", "invoice": invoice}
        for kind, current, invoice in re.findall(r'\[\s*kind\s*\|->\s*"([A-Za-z]+)",\s*current\s*\|->\s*(TRUE|FALSE),\s*invoice\s*\|->\s*"([AB])"\s*\]', label)
    ]
    require(len(state["ops"]) == 2, "Expected exactly two operation slots")
    require(state["phase"] in PHASES, f"Unknown phase {state['phase']}")
    for observer in ("staleSafe", "reviewSafe", "stockSafe", "savedSafe"):
        found = re.search(r"\b" + observer + r"\s*=\s*(TRUE|FALSE)", label)
        require(found is not None, f"Missing observer {observer}")
        state[observer] = found.group(1) == "TRUE"
    return state


def read_graph(path, expected_states):
    """@cc [owner:nareshshah139,label:verification] reject-partial-graph
    Unknown records, duplicate nodes, missing endpoints or a state-count mismatch MUST fail.
    """
    states, edges, initials = {}, [], []
    node_pattern = re.compile(r'^(-?\d+) \[label="((?:\\.|[^"\\])*)"(.*)\];?$')
    edge_pattern = re.compile(r'^(-?\d+) -> (-?\d+) \[label="([A-Za-z]+)"[^\]]*\];$')
    with Path(path).open() as stream:
        for line in stream:
            line = line.strip()
            if not line or line in {"strict digraph DiskGraph {", "nodesep=0.35;", "subgraph cluster_graph {", 'color="white";', "}"}:
                continue
            if re.fullmatch(r"\{rank = same; (?:-?\d+;)+\}", line):
                continue
            edge = edge_pattern.fullmatch(line)
            if edge:
                edges.append(edge.groups())
                continue
            node = node_pattern.fullmatch(line)
            require(node is not None, f"Unrecognized DOT record: {line[:120]}")
            identifier, encoded, suffix = node.groups()
            require(identifier not in states, f"Duplicate state definition {identifier}")
            states[identifier] = parse_state(json.loads('"' + encoded + '"'))
            if "style = filled" in suffix:
                initials.append(identifier)
    require(len(states) == expected_states, f"Graph has {len(states)} states; TLC reported {expected_states}")
    require(len(initials) == 4, f"Expected four initial states, got {len(initials)}")
    require(all(a in states and b in states for a, b, _ in edges), "Graph contains an unknown edge endpoint")
    require(all(all(state[x] for x in MUTANTS.values()) for state in states.values()), "Graph contains failed safety observer")
    return states, edges, initials


def check_edges(states, edges):
    checks = Counter()
    for origin, target, action in edges:
        before, after = states[origin], states[target]
        if action in CALLBACKS:
            changed = [i for i in range(2) if before["ops"][i] != after["ops"][i]]
            require(len(changed) == 1, f"{action} must advance exactly one operation")
            current = before["ops"][changed[0]]["current"]
            if not current:
                require(all(before[k] == after[k] for k in UI_FIELDS), f"Stale UI publication in {action}: {origin} -> {target}")
                checks["stale_callback_edges"] += 1
            if action == "DraftSaved" and current:
                require(before["exact"] and before["approved"] and before["result"] == "ready", "Premature review dispatch")
                checks["authorized_review_dispatch_edges"] += 1
            if action == "SaveFailure" and current:
                require(before["typed"] and after["typed"], "Failed product save discarded entries")
                checks["failed_save_retains_entries_edges"] += 1
        before_stock = before["stockA"], before["stockB"]
        after_stock = after["stockA"], after["stockB"]
        if action in RECOVERY_ACTIONS:
            require(before_stock == after_stock, f"Recovery action {action} wrote stock")
            checks["recovery_without_stock_edges"] += 1
        if before_stock != after_stock:
            require(action in {"CommitSuccess", "CommitLost"}, f"Unexpected stock writer {action}")
            require(all(0 <= b <= a <= 1 for b, a in zip(before_stock, after_stock)), "Stock was duplicated or reversed")
            checks["stock_commit_edges"] += 1
        if before["saved"] and action not in ABANDONMENT_ACTIONS | {"CorrectInvoice"}:
            require(after["saved"], f"{action} lost the saved-product fact")
            checks["saved_fact_preserved_edges"] += 1
    require(all(checks[name] > 0 for name in ("stale_callback_edges", "authorized_review_dispatch_edges", "recovery_without_stock_edges", "stock_commit_edges", "saved_fact_preserved_edges")), "Safety coverage was vacuous")
    return dict(checks)


def recovery(states, edges):
    """@cc [owner:nareshshah139,label:verification] same-invoice-recovery
    Recovery paths MUST preserve invoice identity and exclude replacement and invalidation edges.
    """
    reverse = defaultdict(list)
    recovery_edges = []
    for origin, target, action in edges:
        if action in ABANDONMENT_ACTIONS or states[origin]["invoice"] != states[target]["invoice"]:
            continue
        reverse[target].append((origin, action))
        recovery_edges.append((origin, target, action))
    distance = {identifier: 0 for identifier, state in states.items() if state["phase"] in {"ready", "committed"}}
    require(distance, "No recovery targets exist")
    queue, witness = deque(sorted(distance)), {}
    while queue:
        target = queue.popleft()
        for origin, action in reverse[target]:
            if origin not in distance:
                distance[origin] = distance[target] + 1
                witness[origin] = target, action
                queue.append(origin)
    return distance, witness, recovery_edges


def project(states, recovery_edges, distance, witness):
    """@cc [owner:nareshshah139,label:verification] universal-projected-recovery
    Every concrete member MUST have a recovery witness before its projected node is published.
    """
    groups = defaultdict(list)
    for identifier, state in states.items():
        groups[state["phase"]].append(identifier)
    nodes, witnesses = [], {}
    for phase in PHASES:
        members = groups[phase]
        require(members, f"Unreached declared phase {phase}")
        recovered = sum(identifier in distance for identifier in members)
        node = {"phase": phase, "label": LABELS[phase], "states": len(members), "recoverable": recovered,
                "all_recoverable": recovered == len(members), "max_shortest_recovery_steps": max(distance.get(identifier, -1) for identifier in members)}
        nodes.append(node)
        require(node["all_recoverable"], f"Unrecoverable states in projected node {phase}")
        start = min(members, key=lambda identifier: (-distance[identifier], identifier))
        current, path = start, []
        while current in witness:
            target, action = witness[current]
            path.append({"action": action, "from": states[current]["phase"], "to": states[target]["phase"], "state": target})
            current = target
        witnesses[phase] = {"start": start, "invoice": states[start]["invoice"], "state": states[start], "path": path}
    projected_edges = Counter((states[a]["phase"], states[b]["phase"], action) for a, b, action in recovery_edges
                              if states[a]["phase"] != states[b]["phase"] or action == "Approve")
    return nodes, projected_edges, witnesses


def render_graph(output, nodes, edges):
    dot = ['digraph InvoiceRecovery {', 'rankdir=TB;', 'bgcolor="#ffffff";', 'pad="0.3";', 'nodesep="0.3";', 'ranksep="0.5";',
           'graph [fontname="Helvetica", fontsize=13, labelloc=t, label="Invoice recovery · all represented states have a verified recovery path\\nRecovery preserves this invoice; service success or authorized assistance may be required"];',
           'node [fontname="Helvetica", fontsize=11, shape=box, style="rounded,filled", color="#368367", fillcolor="#eaf6ee", margin="0.16,0.12"];',
           'edge [fontname="Helvetica", fontsize=9, color="#76867e", arrowsize=0.7];']
    for node in nodes:
        label = f"{node['label']}\n{node['recoverable']}/{node['states']} states recoverable\nPath exists within {node['max_shortest_recovery_steps']} steps"
        shape = ',shape=doubleoctagon,fillcolor="#c9ecd6"' if node["phase"] in {"ready", "committed"} else ""
        dot.append(f'{node["phase"]} [label={json.dumps(label)}{shape}];')
    grouped = defaultdict(list)
    for (origin, target, action), count in sorted(edges.items()):
        grouped[origin, target].append(action)
    for (origin, target), actions in grouped.items():
        dot.append(f'{origin} -> {target} [label={json.dumps(chr(10).join(actions))}];')
    dot.append("}")
    graph_path = output / "state-graph.dot"
    graph_path.write_text("\n".join(dot) + "\n")
    subprocess.run(["dot", "-Tsvg", str(graph_path), "-o", str(output / "state-graph.svg")], check=True, timeout=30)


def run_tlc(java, jar, output, mutant, timeout):
    """@cc [owner:nareshshah139,label:verification] completed-proof-or-counterexample
    The base MUST finish exhaustive exploration; each mutant MUST fail its named observer with a trace.
    """
    directory = output / mutant
    directory.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / "InvoiceRecovery.tla", directory / "InvoiceRecovery.tla")
    cfg = directory / "InvoiceRecovery.cfg"
    config = (ROOT / "InvoiceRecovery.cfg").read_text()
    require(config.count('CONSTANT Mutant = "none"') == 1, "Expected one mutant selector in the committed configuration")
    cfg.write_text(config.replace('CONSTANT Mutant = "none"', f'CONSTANT Mutant = "{mutant}"'))
    graph = directory / "states.dot"
    command = [java, "-Xmx2g", "-XX:+UseParallelGC", "-cp", str(jar), "tlc2.TLC", "-workers", "1", "-seed", "1", "-fp", "0",
               "-cleanup", "-metadir", str(directory / "tlc-state"), "-config", "InvoiceRecovery.cfg"]
    if mutant == "none":
        command.extend(["-dump", "dot,actionlabels", str(graph)])
    command.append("InvoiceRecovery.tla")
    log_path = directory / "tlc.log"
    with log_path.open("w") as log:
        process = subprocess.run(command, cwd=directory, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
    text = log_path.read_text()
    if mutant != "none":
        observer = MUTANTS[mutant]
        require(process.returncode != 0 and "Invariant Safety is violated" in text and re.search(r"\b" + observer + r"\s*=\s*FALSE", text),
                f"Mutant {mutant} did not fail its expected safety observer. See {log_path}")
        trace = []
        for match in re.finditer(r"State (\d+): <([^\n]+)>\n(.*?)(?=\nState \d+:|\n\d+ states generated|\Z)", text, re.S):
            trace.append({"step": int(match.group(1)), "action": match.group(2), "state": parse_state(match.group(3))})
        require(trace and not trace[-1]["state"][observer], f"Missing counterexample for {mutant}")
        return {"mutant": mutant, "detected": True, "observer": observer, "trace": trace}
    require(process.returncode == 0 and "Model checking completed. No error has been found." in text,
            f"TLC did not complete successfully. See {log_path}")
    counts = re.search(r"([\d,]+) states generated, ([\d,]+) distinct states found, 0 states left on queue", text)
    depth = re.search(r"depth of the complete state graph search is (\d+)", text)
    require(counts and depth, "Missing complete-exploration counts")
    generated, distinct = (int(value.replace(",", "")) for value in counts.groups())
    return {"generated": generated, "distinct": distinct, "depth": int(depth.group(1)), "version": text.splitlines()[0]}, graph


def main():
    parser = argparse.ArgumentParser(description="Verify invoice recovery and derive its state graph.")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--publish", type=Path)
    parser.add_argument("--adjacency", action="store_true")
    parser.add_argument("--timeout", type=int, default=60)
    args = parser.parse_args()
    output = (args.output or Path(tempfile.mkdtemp(prefix="invoice-recovery-verification-"))).resolve()
    output.mkdir(parents=True, exist_ok=True)
    try:
        java = os.environ.get("JAVA", "java")
        jar = Path(os.environ["TLA2TOOLS"]).resolve()
        require(digest(jar) == JAR_SHA256, "TLA2TOOLS checksum differs from the pinned checker")
        require(shutil.which("dot") is not None, "Graphviz dot is required to render the verified graph")
        source_hashes = {name: digest(ROOT / name) for name in ("InvoiceRecovery.tla", "InvoiceRecovery.cfg", "verify.py", "test_verify.py", "CONTRACTS")}
        counts, raw_graph = run_tlc(java, jar, output, "none", args.timeout)
        states, edges, initials = read_graph(raw_graph, counts["distinct"])
        edge_checks = check_edges(states, edges)
        distance, witness, recovery_edges = recovery(states, edges)
        require(len(distance) == len(states), f"{len(states) - len(distance)} concrete states have no same-invoice recovery path")
        nodes, projected_edges, witnesses = project(states, recovery_edges, distance, witness)
        mutants = [run_tlc(java, jar, output, mutant, args.timeout) for mutant in MUTANTS]
        require(source_hashes == {name: digest(ROOT / name) for name in source_hashes}, "Verification sources changed during this run")
        summary = {"status": "verified", "method": "Finite-state TLA+ model checking and independent same-invoice graph reachability",
                   "property": "AG EF (ready or committed), over recovery edges excluding editor replacement and invalidation",
                   "bounds": {"invoice_identities": 2, "editor_replacements": 1, "operation_slots": 2,
                              "aggregate_invoice_readiness": "all current lines exact and complete", "permission_profiles": 2,
                              "identity_abstraction": "current versus permanently stale captured identity", "retry_limit": None},
                   "tlc": counts, "jar_sha256": JAR_SHA256, "source_sha256": source_hashes,
                   "graph_sha256": digest(raw_graph), "initial_states": len(initials), "edges": len(edges),
                   "recovery_edges": len(recovery_edges), "recoverable_states": len(distance), "max_shortest_recovery_steps": max(distance.values()),
                   "edge_checks": edge_checks, "nodes": nodes, "negative_controls": [{k: value[k] for k in ("mutant", "detected", "observer")} for value in mutants],
                   "assumptions": ASSUMPTIONS}
        write_json(output / "summary.json", summary)
        write_json(output / "witnesses.json", witnesses)
        write_json(output / "negative-controls.json", mutants)
        render_graph(output, nodes, projected_edges)
        if args.adjacency:
            with gzip.open(output / "adjacency.json.gz", "wt") as stream:
                json.dump({"states": states, "edges": edges, "initials": initials, "distance": distance}, stream, separators=(",", ":"))
        if args.publish:
            args.publish.mkdir(parents=True, exist_ok=True)
            for name in ("summary.json", "witnesses.json", "negative-controls.json", "state-graph.dot", "state-graph.svg"):
                shutil.copyfile(output / name, args.publish / name)
        write_json(output / "run-status.json", {"status": "verified"})
        print(json.dumps({"status": "verified", "states": len(states), "edges": len(edges), "recoverable": len(distance), "negative_controls": len(mutants), "output": str(output)}, separators=(",", ":")))
    except (Exception, KeyboardInterrupt) as error:
        write_json(output / "run-status.json", {"status": "incomplete", "reason": str(error)})
        raise


if __name__ == "__main__":
    main()
