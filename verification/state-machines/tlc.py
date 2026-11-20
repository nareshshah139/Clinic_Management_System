"""Run TLC on one rule at a time and read its verdict, trace and state graph.

Every model in this folder is checked one rule per TLC run, so a verdict names exactly one
invariant or temporal property. TLC stops at the first broken invariant and reports temporal
violations without naming the property, so running rules together would hide which ones hold.
"""
from __future__ import annotations

import hashlib
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

JAR_SHA256 = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"


def jar_path(arg: str | None = None) -> str:
    jar = arg or os.environ.get("TLA2TOOLS", "tla2tools.jar")
    if not Path(jar).is_file():
        raise SystemExit(f"{jar} not found. Pass --jar or set TLA2TOOLS to tla2tools v1.7.4.")
    if hashlib.sha256(Path(jar).read_bytes()).hexdigest() != JAR_SHA256:
        raise SystemExit(f"{jar} does not match the pinned tla2tools 1.7.4 checksum")
    return str(Path(jar).resolve())


@dataclass
class Step:
    action: str
    vars: dict


@dataclass
class Run:
    verdict: str
    states: int | None
    trace: list[Step] = field(default_factory=list)
    loop_to: int | None = None
    output: str = ""


def config(constants: dict[str, str], invariants=(), properties=()) -> str:
    lines = ["SPECIFICATION Spec"]
    if constants:
        lines.append("CONSTANTS")
        lines += [f"  {k} = {v}" for k, v in constants.items()]
    lines += [f"INVARIANT {i}" for i in invariants]
    lines += [f"PROPERTY {p}" for p in properties]
    return "\n".join(lines) + "\n"


def check(spec: Path, constants: dict[str, str], *, jar: str, invariant: str | None = None,
          prop: str | None = None, dump_dot: bool = False, timeout: int = 900) -> tuple[Run, str | None]:
    spec = Path(spec).resolve()
    with tempfile.TemporaryDirectory() as work:
        cfg = Path(work) / "MC.cfg"
        cfg.write_text(config(constants, [invariant] if invariant else [], [prop] if prop else []))
        for tla in spec.parent.glob("*.tla"):
            (Path(work) / tla.name).write_text(tla.read_text())
        heap = [f"-Xmx{os.environ['TLC_HEAP']}"] if os.environ.get("TLC_HEAP") else []
        cmd = ["java", "-XX:+UseParallelGC", *heap, "-cp", jar, "tlc2.TLC", "-workers", "1", "-deadlock",
               "-config", cfg.name, "-metadir", "meta"]
        if dump_dot:
            cmd += ["-dump", "dot,actionlabels", "graph"]
        cmd.append(spec.name)
        proc = subprocess.run(cmd, cwd=work, capture_output=True, text=True, timeout=timeout)
        out = proc.stdout + proc.stderr
        dot = (Path(work) / "graph.dot").read_text() if dump_dot and (Path(work) / "graph.dot").exists() else None
    return parse_output(out), dot


def parse_output(out: str) -> Run:
    counts = re.findall(r"([\d,]+) distinct states found", out)
    states = int(counts[-1].replace(",", "")) if counts else None
    if "Model checking completed. No error has been found." in out:
        return Run("holds", states, output=out)
    if re.search(r"Error: Invariant \w+ is violated", out) or "Temporal properties were violated" in out:
        trace, loop_to = parse_trace(out)
        return Run("breaks", states, trace, loop_to, out)
    return Run("error", states, output=out)


STATE_HEAD = re.compile(r"^State (\d+): (.*)$")
BACK = re.compile(r"^(?:State \d+: )?Back to state (\d+)")


def parse_trace(out: str) -> tuple[list[Step], int | None]:
    steps: list[Step] = []
    loop_to = None
    lines = out.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        back = BACK.match(line)
        if back:
            loop_to = int(back.group(1)) - 1
            i += 1
            continue
        if re.match(r"^State \d+: Stuttering", line):
            loop_to = len(steps) - 1
            i += 1
            continue
        head = STATE_HEAD.match(line)
        if not head:
            i += 1
            continue
        label = head.group(2)
        action = "Init" if label.startswith("<Initial predicate>") else re.sub(r"^<(\S+?)(?:\(.*)?\s+line.*$", r"\1", label)
        i += 1
        block: list[str] = []
        while i < len(lines) and lines[i].strip() and not STATE_HEAD.match(lines[i]) and not BACK.match(lines[i]):
            block.append(lines[i])
            i += 1
        steps.append(Step(action, parse_vars("\n".join(block))))
    return steps, loop_to


def parse_vars(text: str) -> dict:
    out = {}
    for part in re.split(r"\n(?=/\\ )", text.strip()):
        m = re.match(r"^(?:/\\ )?([A-Za-z_]\w*) = ([\s\S]*)$", part.strip())
        if m:
            out[m.group(1)] = parse_value(" ".join(m.group(2).split()))
    return out


def parse_value(src: str):
    """TLA+ value text to Python: sequence -> list, record or function -> dict, set -> frozenset-like sorted list."""
    pos = 0

    def ws():
        nonlocal pos
        while pos < len(src) and src[pos].isspace():
            pos += 1

    def eat(tok):
        nonlocal pos
        ws()
        if src.startswith(tok, pos):
            pos += len(tok)
            return True
        return False

    def items(close, item):
        out = []
        if eat(close):
            return out
        while True:
            out.append(item())
            if eat(close):
                return out
            if not eat(","):
                raise ValueError(f"expected , or {close} at {pos} in {src!r}")

    def name():
        nonlocal pos
        ws()
        m = re.match(r"[A-Za-z_]\w*", src[pos:])
        if not m:
            raise ValueError(f"bad token at {pos} in {src!r}")
        pos += len(m.group(0))
        return m.group(0)

    def key(v):
        return v if isinstance(v, (str, int, bool)) else repr(v)

    def val():
        nonlocal pos
        ws()
        if eat("<<"):
            return items(">>", val)
        if eat("{"):
            return sorted(items("}", val), key=repr)
        if eat("["):
            def field():
                k = name()
                if not eat("|->"):
                    raise ValueError("expected |->")
                return (k, val())
            return dict(items("]", field))
        if eat("("):
            out = {}
            while True:
                k = val()
                if not eat(":>"):
                    raise ValueError("expected :>")
                out[key(k)] = val()
                if eat(")"):
                    return out
                if not eat("@@"):
                    raise ValueError("expected @@")
        if pos < len(src) and src[pos] == '"':
            pos += 1
            s = ""
            while src[pos] != '"':
                if src[pos] == "\\":
                    pos += 1
                s += src[pos]
                pos += 1
            pos += 1
            return s
        m = re.match(r"-?\d+", src[pos:])
        if m:
            pos += len(m.group(0))
            lo = int(m.group(0))
            if eat(".."):
                hi = val()
                return list(range(lo, hi + 1))
            return lo
        w = name()
        return {"TRUE": True, "FALSE": False}.get(w, w)

    v = val()
    ws()
    if pos != len(src):
        raise ValueError(f"trailing text at {pos} in {src!r}")
    return v


def parse_dot(text: str) -> tuple[dict[str, dict], set[str], list[tuple[str, str, str]]]:
    """TLC's -dump dot,actionlabels output to (states by id, start ids, edges)."""
    unq = lambda s: re.sub(r"\\(.)", lambda m: "\n" if m.group(1) == "n" else m.group(1), s)
    states, starts, edges = {}, set(), []
    for line in text.splitlines():
        m = re.match(r'^(-?\d+) -> (-?\d+) \[label="((?:[^"\\]|\\.)*)"', line)
        if m:
            edges.append((m.group(1), m.group(2), unq(m.group(3))))
            continue
        m = re.match(r'^(-?\d+) \[label="((?:[^"\\]|\\.)*)"(.*)$', line)
        if m:
            states[m.group(1)] = parse_vars(unq(m.group(2)))
            if re.search(r"style\s*=\s*filled", m.group(3)):
                starts.add(m.group(1))
    return states, starts, edges
