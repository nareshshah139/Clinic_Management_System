#!/bin/sh
# Rehearsal check: runs every act and asserts the outcome the demo script expects.
# A violation, a divergence and a failed recording are expected outcomes, so each step names its exit code.
set -u
fail=0
expect() { # expect <exit code> <pattern> <label> -- <command...>
  want=$1 pattern=$2 label=$3; shift 4
  out=$("$@" 2>&1); got=$?
  if [ "$got" = "$want" ] && printf '%s' "$out" | grep -q -- "$pattern"; then echo "PASS $label"
  else echo "FAIL $label (exit $got, wanted $want and /$pattern/)"; printf '%s\n' "$out" | tail -5; fail=1; fi
}
expect 1 'stockConserved' 'act1:open finds the lost stock' -- npm run -s act1:open
expect 0 'No violation found' 'act1:decided holds' -- npm run -s act1:decided
expect 0 'Observed cancelledPartially' 'act1:observe reaches a part-committed cancel' -- npm run -s act1:observe
if [ "${SKIP_APALACHE:-}" = "" ]; then
  expect 1 'stockConserved' 'act1:verify-open finds the shortest bad run' -- npm run -s act1:verify-open
  expect 0 'No violation found' 'act1:verify-decided holds to 8 steps' -- npm run -s act1:verify-decided
fi
expect 0 '' 'act2:traces writes 200 traces' -- npm run -s act2:traces
expect 0 'OK 200 traces, 2400 steps' 'act2:replay matches the stand-in' -- npm run -s act2:replay
for m in no-version-check no-done-shortcut drop-discrepancy; do
  expect 1 'DIVERGED' "act2 mutant $m is caught" -- env MUTANT=$m npm run -s act2:replay
done
if [ "${SERVICE:-}" != "" ]; then
  expect 0 'OK 200 traces, 2400 steps' 'act2:replay:service matches the NestJS service on Postgres' -- npm run -s act2:replay:service
  expect 0 'OK 200 traces' 'act2 service mutant no-precheck survives (the claim still checks the version)' -- env MUTANT=no-precheck npm run -s act2:replay:service
  for m in no-version-check no-done-shortcut drop-discrepancy; do
    expect 1 'DIVERGED' "act2 service mutant $m is caught" -- env MUTANT=$m npm run -s act2:replay:service
  done
fi
expect 0 'wrote act3/recorded.qnt' 'act3:convert' -- npm run -s act3:convert
expect 1 '1 passing' 'act3:check passes the e2e run and fails the tampered one' -- npm run -s act3:check
expect 0 'No violation found' 'voice:run holds draftIsLatest and ownerIsActive' -- npm run -s voice:run
expect 0 'Observed reachesApplied' 'voice:observe reaches an applied draft' -- npm run -s voice:observe
if [ "${SKIP_APALACHE:-}" = "" ]; then
  expect 0 'No violation found' 'voice:verify:quick holds to 8 steps' -- npm run -s voice:verify:quick
fi
expect 0 '' 'voice:traces writes 200 traces' -- npm run -s voice:traces
expect 0 'OK 200 traces, 4000 steps' 'voice:replay matches the real reducer' -- npm run -s voice:replay
for m in no-attempt-check no-registration-check no-scope-reset; do
  expect 1 'DIVERGED' "voice mutant $m is caught" -- env MUTANT=$m npm run -s voice:replay
done
exit $fail
