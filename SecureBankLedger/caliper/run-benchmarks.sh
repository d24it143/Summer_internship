#!/usr/bin/env bash
################################################################################
# SecureBank Ledger — Master Benchmark Runner
# Runs all 3 Caliper benchmark suites in sequence:
#   1. Registration (100 → 2500 tx, 25 rounds)
#   2. Query        (100 → 2500 tx, 25 rounds)
#   3. Transfer     (100 → 2500 tx, 25 rounds)
#
# Usage: bash caliper/run-benchmarks.sh
# Prerequisites:
#   - Fabric network running (docker-compose up)
#   - Chaincode deployed on banking-channel
#   - Seed accounts created: node caliper/seed-accounts.js
#   - npm install in caliper/: npm install @hyperledger/caliper-cli
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CALIPER_DIR="$SCRIPT_DIR"
RESULTS_DIR="$CALIPER_DIR/results/$(date +%Y%m%d_%H%M%S)"
NETWORK_CONFIG="$CALIPER_DIR/networkConfig.yaml"

mkdir -p "$RESULTS_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠️ $*${NC}"; }
info() { echo -e "${BLUE}[$(date +%H:%M:%S)] ℹ️ $*${NC}"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] ❌ $*${NC}"; }

echo "═══════════════════════════════════════════════════════════════"
echo "  SecureBank Ledger — Hyperledger Caliper Benchmark Suite"
echo "  3 Organizations × 3 Transaction Types × 25 Rounds each"
echo "  Tx counts: 100, 200, 300 ... 2500 (step 100)"
echo "  Results: $RESULTS_DIR"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── Check caliper-cli ──────────────────────────────────────────────────────
if ! npx caliper --version &>/dev/null; then
  warn "caliper-cli not found. Installing..."
  cd "$CALIPER_DIR"
  npm install --save-dev @hyperledger/caliper-cli @hyperledger/caliper-fabric
  npx caliper bind --caliper-bind-sut fabric:2.4
fi

# ─── Helper: run one benchmark suite ────────────────────────────────────────
run_benchmark() {
  local bench_name="$1"
  local bench_file="$2"
  local report_file="$RESULTS_DIR/report-${bench_name}.html"
  local json_file="$RESULTS_DIR/report-${bench_name}.json"

  log "Starting benchmark: ${bench_name^^}"
  info "  Benchmark config : $bench_file"
  info "  Report output    : $report_file"
  echo ""

  npx caliper launch manager \
    --caliper-workspace "$CALIPER_DIR" \
    --caliper-networkconfig "$NETWORK_CONFIG" \
    --caliper-benchconfig "$bench_file" \
    --caliper-flow-only-test \
    --caliper-report-path "$report_file" \
    2>&1 | tee "$RESULTS_DIR/${bench_name}.log"

  if [ $? -eq 0 ]; then
    log "✅ ${bench_name^^} benchmark completed successfully"
  else
    err "${bench_name^^} benchmark encountered errors — check $RESULTS_DIR/${bench_name}.log"
  fi
  echo ""
}

# ─── 1. Registration Benchmark ───────────────────────────────────────────────
run_benchmark "registration" "$CALIPER_DIR/benchmarks/bench-registration.yaml"

# ─── 2. Query Benchmark ──────────────────────────────────────────────────────
run_benchmark "query" "$CALIPER_DIR/benchmarks/bench-query.yaml"

# ─── 3. Transfer Benchmark ───────────────────────────────────────────────────
run_benchmark "transfer" "$CALIPER_DIR/benchmarks/bench-transfer.yaml"

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
log "🎉 All benchmarks completed!"
info "Results directory: $RESULTS_DIR"
echo ""
echo "  HTML Reports:"
ls -lh "$RESULTS_DIR"/*.html 2>/dev/null || warn "No HTML reports found"
echo ""
echo "  Logs:"
ls -lh "$RESULTS_DIR"/*.log 2>/dev/null || warn "No log files found"
echo "═══════════════════════════════════════════════════════════════"
