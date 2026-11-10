#!/usr/bin/env python3
"""Model-check the CR-33 cash-count protocol and its negative controls with TLC."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
SPEC = ROOT / "CashCount.tla"
JAR_SHA256 = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"

# (mode, staff, max saves, expected) where expected is None for "no error" or the property TLC must report.
CASES = [
    ("correct", "{a, b}", 4, None),
    ("correct", "{a, b, c}", 4, None),
    ("noCheck", "{a, b}", 3, "NoLostUpdate"),
    ("noUnique", "{a, b}", 3, "Contiguous"),
    ("overwrite", "{a, b}", 3, "HistoryKept"),
]


def config(mode, staff, saves):
    return (
        "SPECIFICATION Spec\n"
        "CONSTANTS\n"
        f"  Staff = {staff}\n"
        f"  MaxSaves = {saves}\n"
        f'  MODE = "{mode}"\n'
        "INVARIANTS TypeOK Contiguous NoLostUpdate SomeoneCounted\n"
        "PROPERTIES HistoryKept\n"
    )


def run_case(jar, mode, staff, saves, workdir):
    name = f"MC_{mode}_{len(staff.split(','))}_{saves}"
    (Path(workdir) / f"{name}.cfg").write_text(config(mode, staff, saves))
    (Path(workdir) / SPEC.name).write_text(SPEC.read_text())
    proc = subprocess.run(
        ["java", "-XX:+UseParallelGC", "-cp", str(Path(jar).resolve()), "tlc2.TLC", "-workers", "2", "-deadlock",
         "-config", f"{name}.cfg", "-metadir", f"meta-{name}", SPEC.name],
        capture_output=True, text=True, cwd=workdir,
    )
    out = proc.stdout + proc.stderr
    violated = re.search(r"Invariant (\w+) is violated", out)
    if violated:
        return violated.group(1), out
    if re.search(r"Action property \w+ is violated|Temporal properties were violated", out):
        return "HistoryKept", out
    if "Model checking completed. No error has been found." in out:
        states = re.search(r"(\d+) distinct states found", out)
        return None, f"{states.group(1) if states else '?'} distinct states"
    raise RuntimeError(f"TLC did not finish for {mode}:\n{out}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--jar", default=os.environ.get("TLA2TOOLS", "tla2tools.jar"))
    args = parser.parse_args()
    if hashlib.sha256(Path(args.jar).read_bytes()).hexdigest() != JAR_SHA256:
        sys.exit(f"{args.jar} does not match the pinned tla2tools 1.7.4 checksum")
    failures = 0
    with tempfile.TemporaryDirectory() as workdir:
        for mode, staff, saves, expected in CASES:
            got, detail = run_case(args.jar, mode, staff, saves, workdir)
            ok = got == expected
            failures += not ok
            want = "no error" if expected is None else f"{expected} violated"
            seen = "no error" if got is None else f"{got} violated"
            note = detail if got is None else ""
            print(f"{'PASS' if ok else 'FAIL'}  {mode:<10} staff={staff:<10} saves={saves}  expected {want}, got {seen} {note}")
            if not ok and got is not None:
                print(detail)
    print(f"\n{len(CASES) - failures}/{len(CASES)} cash-count model checks behave as expected")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
