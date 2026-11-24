#!/usr/bin/env bash
################################################################################
# SecureBank Ledger — network/scripts/down.sh
# Tears down the entire Fabric network and cleans up artifacts
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date +'%H:%M:%S')] $*${NC}"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARN: $*${NC}"; }

log "Stopping SecureBank Ledger network..."

cd "${NETWORK_DIR}"
docker-compose down --volumes --remove-orphans 2>/dev/null || true

# Remove chaincode containers and images
log "Removing chaincode containers..."
docker rm -f "$(docker ps -aq --filter 'name=dev-peer')" 2>/dev/null || true
docker rmi -f "$(docker images -q 'dev-peer*')" 2>/dev/null || true

# Optional: clean generated artifacts
if [ "${1:-}" == "--clean" ]; then
  warn "Removing crypto material and channel artifacts..."
  rm -rf "${NETWORK_DIR}/organizations/peerOrganizations"
  rm -rf "${NETWORK_DIR}/organizations/ordererOrganizations"
  rm -rf "${NETWORK_DIR}/channel-artifacts"
  rm -rf "${NETWORK_DIR}/wallet"
  log "Clean complete."
fi

log "Network stopped successfully."
