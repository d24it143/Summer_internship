#!/usr/bin/env bash
################################################################################
# SecureBank Ledger — Master All-Cases Benchmark Runner
#
# Runs all 27 cases in sequence:
#   For each case (1→27):
#     1. Apply endorsement policies (all 3 chaincodes)
#     2. Run Caliper benchmark (75 rounds: 3 tx types × 25 counts)
#     3. Save HTML report + JSON + log
#
# Usage:  bash caliper/run-all-cases.sh [START_CASE] [END_CASE]
# Example: bash caliper/run-all-cases.sh          # run all 27 cases
#          bash caliper/run-all-cases.sh 1 9       # run only Group A (cases 1-9)
#          bash caliper/run-all-cases.sh 10 18     # run only Group B
#          bash caliper/run-all-cases.sh 19 27     # run only Group C
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CALIPER_DIR="$SCRIPT_DIR"
CASES_DIR="$CALIPER_DIR/cases"
RESULTS_DIR="$CALIPER_DIR/results/all-cases-$(date +%Y%m%d_%H%M%S)"
NETWORK_CONFIG="$CALIPER_DIR/networkConfig.yaml"

START_CASE="${1:-1}"
END_CASE="${2:-27}"

mkdir -p "$RESULTS_DIR"

# ── Colors ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m';  RED='\033[0;31m';  CYAN='\033[0;36m'; NC='\033[0m'
log()   { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }
warn()  { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠️  $*${NC}"; }
info()  { echo -e "${BLUE}[$(date +%H:%M:%S)] ℹ️  $*${NC}"; }
head_()  { echo -e "${CYAN}$*${NC}"; }
err()   { echo -e "${RED}[$(date +%H:%M:%S)] ❌ $*${NC}"; }

# ── Summary tracking ─────────────────────────────────────────────────────────
PASSED=0; FAILED=0; FAILED_CASES=()

# ── Progress file ────────────────────────────────────────────────────────────
PROGRESS_FILE="$RESULTS_DIR/progress.log"
echo "SecureBank Ledger — All Cases Benchmark Run" > "$PROGRESS_FILE"
echo "Started: $(date)"                           >> "$PROGRESS_FILE"
echo "Cases: $START_CASE to $END_CASE"            >> "$PROGRESS_FILE"
echo ""                                           >> "$PROGRESS_FILE"

head_ "
╔══════════════════════════════════════════════════════════════════════╗
║   SecureBank Ledger — Full 27-Case Benchmark Suite                 ║
║   3 Organizations × 3 Tx Types × 27 Endorsement Policy Combos     ║
║   Each case: 75 rounds (3 tx types × 25 tx counts: 100→2500)       ║
║   Results → $RESULTS_DIR
╚══════════════════════════════════════════════════════════════════════╝
"

# ── Run each case ─────────────────────────────────────────────────────────────
for CASE_NO in $(seq "$START_CASE" "$END_CASE"); do
  CASE_ID=$(printf "case-%02d" "$CASE_NO")
  CASE_DIR="$CASES_DIR/$CASE_ID"
  BENCH_FILE="$CASE_DIR/benchmark.yaml"
  POLICY_FILE="$CASE_DIR/policy.json"
  CASE_RESULTS_DIR="$RESULTS_DIR/$CASE_ID"

  mkdir -p "$CASE_RESULTS_DIR"

  # ── Read case metadata ───────────────────────────────────────────────────
  DESCRIPTION=$(python3 -c "import json; d=json.load(open('$POLICY_FILE')); print(d['description'])" 2>/dev/null || echo "N/A")
  GROUP=$(python3 -c "import json; d=json.load(open('$POLICY_FILE')); print(d['group'])" 2>/dev/null || echo "?")

  head_ "
─────────────────────────────────────────────────────────────────────
  Case $CASE_NO / 27  |  $CASE_ID  |  Group $GROUP
  $DESCRIPTION
─────────────────────────────────────────────────────────────────────"

  CASE_START=$(date +%s)

  # ── Step 1: Apply endorsement policies ──────────────────────────────────
  log "[1/2] Applying endorsement policies..."
  POLICY_LOG="$CASE_RESULTS_DIR/policy-apply.log"

  if bash "$CASES_DIR/apply-policy.sh" "$CASE_ID" 2>&1 | tee "$POLICY_LOG"; then
    log "  ✅ Policies applied"
  else
    err "  Policy application failed for $CASE_ID — skipping benchmark"
    warn "  Check: $POLICY_LOG"
    FAILED=$((FAILED+1))
    FAILED_CASES+=("$CASE_ID")
    echo "FAILED (policy): $CASE_ID — $DESCRIPTION" >> "$PROGRESS_FILE"
    continue
  fi

  # ── Step 2: Run Caliper benchmark ───────────────────────────────────────
  log "[2/2] Running Caliper benchmark (75 rounds)..."
  REPORT_HTML="$CASE_RESULTS_DIR/report.html"
  BENCH_LOG="$CASE_RESULTS_DIR/benchmark.log"

  if npx caliper launch manager \
       --caliper-workspace "$CALIPER_DIR" \
       --caliper-networkconfig "$NETWORK_CONFIG" \
       --caliper-benchconfig "$BENCH_FILE" \
       --caliper-flow-only-test \
       --caliper-report-path "$REPORT_HTML" \
       2>&1 | tee "$BENCH_LOG"; then

    CASE_END=$(date +%s)
    DURATION=$(( CASE_END - CASE_START ))
    log "  ✅ $CASE_ID completed in ${DURATION}s"
    PASSED=$((PASSED+1))
    echo "PASSED: $CASE_ID (${DURATION}s) — $DESCRIPTION" >> "$PROGRESS_FILE"
  else
    CASE_END=$(date +%s)
    DURATION=$(( CASE_END - CASE_START ))
    err "  $CASE_ID benchmark failed after ${DURATION}s"
    FAILED=$((FAILED+1))
    FAILED_CASES+=("$CASE_ID")
    echo "FAILED (bench): $CASE_ID — $DESCRIPTION" >> "$PROGRESS_FILE"
  fi

  echo ""
done

# ── Final summary ─────────────────────────────────────────────────────────────
head_ "
╔══════════════════════════════════════════════════════════════════════╗
║                     BENCHMARK SUITE COMPLETE                       ║
╚══════════════════════════════════════════════════════════════════════╝"

echo ""
log "Total Cases Run : $((PASSED + FAILED))"
log "✅ Passed       : $PASSED"
if [[ $FAILED -gt 0 ]]; then
  err "❌ Failed       : $FAILED"
  for fc in "${FAILED_CASES[@]}"; do err "   → $fc"; done
fi
echo ""
info "Results directory: $RESULTS_DIR"
info "Progress log     : $PROGRESS_FILE"
echo ""

{
  echo ""
  echo "Finished: $(date)"
  echo "Passed: $PASSED / $((PASSED+FAILED))"
  echo "Failed cases: ${FAILED_CASES[*]:-none}"
} >> "$PROGRESS_FILE"
