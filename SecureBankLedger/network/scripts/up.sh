#!/usr/bin/env bash
################################################################################
# SecureBank Ledger — network/scripts/up.sh (3 Organizations)
# Brings up the entire Hyperledger Fabric network (Org1, Org2, Org3)
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FABRIC_CFG_PATH="${NETWORK_DIR}"

export PATH="/Users/dhavalvarvariya/Downloads/CHARUSAT/D/fabric-samples/bin:${PATH}"
export FABRIC_CFG_PATH

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()   { echo -e "${GREEN}[$(date +'%H:%M:%S')] $*${NC}"; }
warn()  { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARN: $*${NC}"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR: $*${NC}"; exit 1; }

# Ensure binaries are available
command -v cryptogen    &>/dev/null || error "cryptogen not found. Install Fabric binaries."
command -v configtxgen  &>/dev/null || error "configtxgen not found. Install Fabric binaries."
command -v docker       &>/dev/null || error "docker not found."
command -v docker-compose &>/dev/null || error "docker-compose not found."

log "═══════════════════════════════════════════════════════"
log " SecureBank Ledger — Starting 3-Org Fabric Network"
log " Org1 (BankOrg) | Org2 (InsuranceOrg) | Org3 (AuditOrg)"
log "═══════════════════════════════════════════════════════"

##############################################################################
# 1. Generate crypto material
##############################################################################
log "Step 1: Generating cryptographic material..."
cd "${NETWORK_DIR}"

if [ -d "organizations/peerOrganizations/bank.com" ] && \
   [ -d "organizations/peerOrganizations/insurance.com" ] && \
   [ -d "organizations/peerOrganizations/audit.com" ]; then
  warn "Crypto material already exists for all 3 orgs. Skipping generation."
else
  cryptogen generate \
    --config="${NETWORK_DIR}/crypto-config.yaml" \
    --output="${NETWORK_DIR}/organizations"
  log "Crypto material generated successfully for 3 orgs."
fi

##############################################################################
# 2. Generate channel artifacts
##############################################################################
log "Step 2: Generating channel artifacts..."
mkdir -p "${NETWORK_DIR}/channel-artifacts"

if [ ! -f "${NETWORK_DIR}/channel-artifacts/genesis.block" ]; then
  configtxgen \
    -profile BankOrdererGenesis \
    -channelID system-channel \
    -outputBlock "${NETWORK_DIR}/channel-artifacts/genesis.block" \
    -configPath "${NETWORK_DIR}"
  log "Genesis block created."
fi

if [ ! -f "${NETWORK_DIR}/channel-artifacts/banking-channel.tx" ]; then
  configtxgen \
    -profile BankingChannel \
    -outputCreateChannelTx "${NETWORK_DIR}/channel-artifacts/banking-channel.tx" \
    -channelID banking-channel \
    -configPath "${NETWORK_DIR}"
  log "Channel transaction created."
fi

# Anchor peer updates for each of the 3 orgs
for org in "BankOrgMSP" "InsuranceOrgMSP" "AuditOrgMSP"; do
  if [ ! -f "${NETWORK_DIR}/channel-artifacts/${org}anchors.tx" ]; then
    configtxgen \
      -profile BankingChannel \
      -outputAnchorPeersUpdate "${NETWORK_DIR}/channel-artifacts/${org}anchors.tx" \
      -channelID banking-channel \
      -asOrg "${org}" \
      -configPath "${NETWORK_DIR}"
  fi
done
log "Anchor peer transactions created for all 3 organizations."

##############################################################################
# 3. Start Docker Compose services
##############################################################################
log "Step 3: Starting Docker Compose services (Orderers + 9 Peers + 9 CouchDBs + 3 CAs)..."
cd "${NETWORK_DIR}"
docker-compose up -d

log "Waiting for peers and orderers to initialize..."
sleep 12

##############################################################################
# 4. Create channel and join all peers
##############################################################################
log "Step 4: Creating banking-channel and joining all 3 org peers..."
"${SCRIPT_DIR}/createChannel.sh"

##############################################################################
# 5. Deploy chaincodes across all 3 orgs
##############################################################################
log "Step 5: Deploying chaincodes..."
"${SCRIPT_DIR}/deployCC.sh"

##############################################################################
# 6. Enroll default users
##############################################################################
log "Step 6: Enrolling default users..."
"${SCRIPT_DIR}/enrollUsers.sh"

log "═══════════════════════════════════════════════════════"
log " SecureBank Ledger 3-Org Network is UP and READY!"
log " Org1 Peers: peer0.bank.com:7051, peer1:8051, peer2:9051"
log " Org2 Peers: peer0.insurance.com:10051, peer1:10052, peer2:10053"
log " Org3 Peers: peer0.audit.com:11051, peer1:11052, peer2:11053"
log " Orderers:   orderer0:7050, orderer1:8050, orderer2:9050"
log "═══════════════════════════════════════════════════════"
