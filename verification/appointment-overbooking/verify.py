#!/usr/bin/env python3
"""Model-check the appointment overbooking protocol and its negative controls."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
SPEC = ROOT / "Overbooking.tla"
JAR_SHA256 = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"
REQUESTS = "{r1, r2, r3, r4}"
ASKS = "{r2, r3}"

# (mode, limit, expected) where expected is None for "no error" or the property TLC must report.
CASES = [
    ("correct", 1, None),
    ("correct", 2, None),
    ("correct", 3, None),
    ("nolock", 1, "WithinLimit"),
    ("nolock", 2, "WithinLimit"),
    ("countOutsideLock", 1, "WithinLimit"),
    ("countOutsideLock", 2, "WithinLimit"),
    ("ignoreFlag", 2, "NoAccidentalOverbook"),
    # With a limit of 1 nothing can overbook, so ignoring the flag is harmless.
    ("ignoreFlag", 1, None),
]


def config(mode, limit):
    return (
        "SPECIFICATION Spec\n"
        "CONSTANTS\n"
        f"  Requests = {REQUESTS}\n"
        f"  Limit = {limit}\n"
        f"  AsksToOverbook = {ASKS}\n"
        f'  MODE = "{mode}"\n'
        "INVARIANTS TypeOK WithinLimit NoAccidentalOverbook SomeoneBooked\n"
        "PROPERTIES AllFinish\n"
    )


def run_case(jar, mode, limit, workdir):
    name = f"MC_{mode}_L{limit}"
    (Path(workdir) / f"{name}.cfg").write_text(config(mode, limit))
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
    if "Temporal properties were violated" in out:
        return "AllFinish", out
    if "Model checking completed. No error has been found." in out:
        states = re.search(r"(\d+) distinct states found", out)
        return None, f"{states.group(1) if states else '?'} distinct states"
    raise RuntimeError(f"TLC did not finish for {mode}/L{limit}:\n{out}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--jar", default=os.environ.get("TLA2TOOLS", "tla2tools.jar"))
    args = parser.parse_args()
    if hashlib.sha256(Path(args.jar).read_bytes()).hexdigest() != JAR_SHA256:
        sys.exit(f"{args.jar} does not match the pinned tla2tools 1.7.4 checksum")
    failures = 0
    with tempfile.TemporaryDirectory() as workdir:
        for mode, limit, expected in CASES:
            got, detail = run_case(args.jar, mode, limit, workdir)
            ok = got == expected
            failures += not ok
            want = "no error" if expected is None else f"{expected} violated"
            seen = "no error" if got is None else f"{got} violated"
            print(f"{'PASS' if ok else 'FAIL'} {mode:<17} limit={limit}  expected {want}, got {seen}"
                  + (f" ({detail})" if got is None else ""))
            if not ok and got is not None:
                print(detail)
    if failures:
        sys.exit(f"{failures} case(s) did not match")
    print(f"All {len(CASES)} cases matched.")


if __name__ == "__main__":
    main()
