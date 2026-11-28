#!/bin/sh
# Rehearsal check: runs every act and asserts the outcome the demo script expects.
# A violation, a divergence and a failed recording are expected outcomes, so each step names its exit code.
# SKIP_APALACHE=1 skips quint verify. SERVICE=1 adds the replays against the NestJS service on Postgres.
set -u
fail=0
expect() { # expect <exit code> <pattern> <label> -- <command...>
  want=$1 pattern=$2 label=$3; shift 4
  out=$("$@" 2>&1); got=$?
  if [ "$got" = "$want" ] && printf '%s' "$out" | grep -q -- "$pattern"; then echo "PASS $label"
  else echo "FAIL $label (exit $got, wanted $want and /$pattern/)"; printf '%s\n' "$out" | tail -5; fail=1; fi
}
# quint verify starts Apalache on port 8822. A run that starts before the last server frees the port drops its connection.
verify() { # verify <exit code> <pattern> <label> <npm script>
  [ "${SKIP_APALACHE:-}" = "" ] || return 0
  i=0; while nc -z 127.0.0.1 8822 2>/dev/null && [ $i -lt 60 ]; do sleep 1; i=$((i + 1)); done
  expect "$1" "$2" "$3" -- npm run -s "$4"
}
mutants() { # mutants <exit code> <pattern> <label> <npm script> <mutant...>
  m_want=$1 m_pattern=$2 m_label=$3 m_script=$4; shift 4
  for m in "$@"; do expect "$m_want" "$m_pattern" "$m_label $m" -- env MUTANT="$m" npm run -s "$m_script"; done
}

echo "# Partner daily sale"
expect 1 'stockConserved' 'act1:open finds the lost stock' -- npm run -s act1:open
expect 0 'No violation found' 'act1:decided holds' -- npm run -s act1:decided
expect 0 'Observed cancelledPartially' 'act1:observe reaches a part-committed cancel' -- npm run -s act1:observe
verify 1 'stockConserved' 'act1:verify-open finds the shortest bad run' act1:verify-open
verify 0 'No violation found' 'act1:verify-decided holds to 8 steps' act1:verify-decided
expect 0 '' 'act2:traces writes 200 traces' -- npm run -s act2:traces
expect 0 'OK 200 traces, 2400 steps' 'act2:replay matches the stand-in' -- npm run -s act2:replay
mutants 1 'DIVERGED' 'act2 catches mutant' act2:replay no-version-check no-done-shortcut drop-discrepancy
expect 0 'wrote act3/recorded.qnt' 'act3:convert' -- npm run -s act3:convert
expect 1 '1 passing' 'act3:check passes the e2e run and fails the tampered one' -- npm run -s act3:check

echo "# OCR purchase bill"
OCR_CAUGHT="no-review-revision no-reject-revision no-reopen-revision reopen-any-status no-commit-status no-commit-idempotent no-lowconf-check reject-posted no-edit-guard no-review-flag-check"
OCR_COVERED="no-commit-precheck no-claim-status no-reject-precheck"
expect 0 'No violation found' 'ocr:run holds the coded invariants' -- npm run -s ocr:run
expect 0 'Observed reopenedThenPosted' 'ocr:observe reaches a reopened bill that posts' -- npm run -s ocr:observe
expect 1 'postedWhatWasSeen' 'ocr:design finds a bill approved on content nobody saw' -- npm run -s ocr:design
expect 0 'No violation found' 'ocr:client holds when every review sends the revision' -- npm run -s ocr:client
verify 0 'No violation found' 'ocr:verify holds to 12 steps' ocr:verify
verify 1 'postedWhatWasSeen' 'ocr:design-verify finds the shortest bad run' ocr:design-verify
verify 0 'No violation found' 'ocr:client-verify holds to 10 steps' ocr:client-verify
expect 0 '' 'ocr:traces writes 200 traces' -- npm run -s ocr:traces
expect 0 'OK 200 traces, 2400 steps' 'ocr:replay matches the stand-in' -- npm run -s ocr:replay
mutants 1 'DIVERGED' 'ocr catches mutant' ocr:replay $OCR_CAUGHT
mutants 0 'OK 200 traces' 'ocr mutant survives, a second guard covers it:' ocr:replay $OCR_COVERED

echo "# Voice bar"
expect 0 'No violation found' 'voice:run holds draftIsLatest and ownerIsActive' -- npm run -s voice:run
expect 0 'Observed reachesApplied' 'voice:observe reaches an applied draft' -- npm run -s voice:observe
verify 0 'No violation found' 'voice:verify:quick holds to 8 steps' voice:verify:quick
expect 0 '' 'voice:traces writes 200 traces' -- npm run -s voice:traces
expect 0 'OK 200 traces, 4000 steps' 'voice:replay matches the real reducer' -- npm run -s voice:replay
mutants 1 'DIVERGED' 'voice catches mutant' voice:replay no-attempt-check no-registration-check no-scope-reset

if [ "${SERVICE:-}" != "" ]; then
  echo "# NestJS service on Postgres"
  expect 0 'OK 200 traces, 2400 steps' 'act2:replay:service matches the partner sale service' -- npm run -s act2:replay:service
  mutants 1 'DIVERGED' 'act2 service catches mutant' act2:replay:service no-version-check no-done-shortcut drop-discrepancy
  mutants 0 'OK 200 traces' 'act2 service mutant survives, the claim still checks the version:' act2:replay:service no-precheck
  expect 0 'OK 200 traces, 2400 steps' 'ocr:replay:service matches the purchase invoice service' -- npm run -s ocr:replay:service
  mutants 1 'DIVERGED' 'ocr service catches mutant' ocr:replay:service $OCR_CAUGHT
  mutants 0 'OK 200 traces' 'ocr service mutant survives:' ocr:replay:service $OCR_COVERED
fi
exit $fail
