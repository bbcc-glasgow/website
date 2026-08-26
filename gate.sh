#!/usr/bin/env bash
# Runs every step in gate.d/, in filename order, writing structured
# per-step results to .sandcastle/gate-logs/ (issue #575). The orchestrator,
# GitHub Actions CI, and `pnpm gate` all call this one script, so wiring a
# new test into CI is one new gate.d/NN-name.sh file - no other file needs
# editing.
set -u

mkdir -p .sandcastle/gate-logs
rm -f .sandcastle/gate-logs/results
FAILED=0

for step in gate.d/*.sh; do
  name=$(basename "$step" .sh)
  name=${name#*-}
  if bash "$step" > ".sandcastle/gate-logs/$name.log" 2>&1; then
    echo "$name=pass" >> .sandcastle/gate-logs/results
  else
    echo "$name=fail" >> .sandcastle/gate-logs/results
    FAILED=1
  fi
done

exit "$FAILED"
