#!/usr/bin/env bash
################################################################################
# SecureBank Ledger — network/scripts/deployCC.sh (3 Organizations)
# Packages, installs across Org1/Org2/Org3, approves, and commits chaincodes
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
export PATH="/Users/dhavalvarvariya/Downloads/CHARUSAT/D/fabric-samples/bin:${PATH}"
CHAINCODE_DIR="$(cd "${NETWORK_DIR}/../../chaincode" && pwd)"
CHANNEL_NAME="banking-channel"
ORDERER_CA="${NETWORK_DIR}/organizations/ordererOrganizations/orderer.bank.com/orderers/orderer0.orderer.bank.com/msp/tlscacerts/tlsca.orderer.bank.com-cert.pem"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()   { echo -e "${GREEN}[$(date +'%H:%M:%S')] $*${NC}"; }
warn()  { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARN: $*${NC}"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR: $*${NC}"; exit 1; }

setGlobals() {
  local org=$1
  local peer_num=$2

  export CORE_PEER_TLS_ENABLED=true

  if [ "$org" == "1" ]; then
    export CORE_PEER_LOCALMSPID="BankOrgMSP"
    local ORG_DIR="${NETWORK_DIR}/organizations/peerOrganizations/bank.com"
    export CORE_PEER_MSPCONFIGPATH="${ORG_DIR}/users/Admin@bank.com/msp"
    case $peer_num in
      0) export CORE_PEER_ADDRESS=peer0.bank.com:7051; export CORE_PEER_TLS_ROOTCERT_FILE="${ORG_DIR}/peers/peer0.bank.com/tls/ca.crt" ;;
      1) export CORE_PEER_ADDRESS=peer1.bank.com:8051; export CORE_PEER_TLS_ROOTCERT_FILE="${ORG_DIR}/peers/peer1.bank.com/tls/ca.crt" ;;
      2) export CORE_PEER_ADDRESS=peer2.bank.com:9051; export CORE_PEER_TLS_ROOTCERT_FILE="${ORG_DIR}/peers/peer2.bank.com/tls/ca.crt" ;;
    esac
  elif [ "$org" == "2" ]; then
    export CORE_PEER_LOCALMSPID="InsuranceOrgMSP"
    local ORG_DIR="${NETWORK_DIR}/organizations/peerOrganizations/insurance.com"
    export CORE_PEER_MSPCONFIGPATH="${ORG_DIR}/users/Admin@insurance.com/msp"
    case $peer_num in
      0) export CORE_PEER_ADDRESS=peer0.insurance.com:10051; export CORE_PEER_TLS_ROOTCERT_FILE="${ORG_DIR}/peers/peer0.insurance.com/tls/ca.crt" ;;
      1) export CORE_PEER_ADDRESS=peer1.insurance.com:10052; export CORE_PEER_TLS_ROOTCERT_FILE="${ORG_DIR}/peers/peer1.insurance.com/tls/ca.crt" ;;
      2) export CORE_PEER_ADDRESS=peer2.insurance.com:10053; export CORE_PEER_TLS_ROOTCERT_FILE="${ORG_DIR}/peers/peer2.insurance.com/tls/ca.crt" ;;
    esac
  elif [ "$org" == "3" ]; then
    export CORE_PEER_LOCALMSPID="AuditOrgMSP"
    local ORG_DIR="${NETWORK_DIR}/organizations/peerOrganizations/audit.com"
    export CORE_PEER_MSPCONFIGPATH="${ORG_DIR}/users/Admin@audit.com/msp"
    case $peer_num in
      0) export CORE_PEER_ADDRESS=peer0.audit.com:11051; export CORE_PEER_TLS_ROOTCERT_FILE="${ORG_DIR}/peers/peer0.audit.com/tls/ca.crt" ;;
      1) export CORE_PEER_ADDRESS=peer1.audit.com:11052; export CORE_PEER_TLS_ROOTCERT_FILE="${ORG_DIR}/peers/peer1.audit.com/tls/ca.crt" ;;
      2) export CORE_PEER_ADDRESS=peer2.audit.com:11053; export CORE_PEER_TLS_ROOTCERT_FILE="${ORG_DIR}/peers/peer2.audit.com/tls/ca.crt" ;;
    esac
  fi
}

declare -A CHAINCODES=(
  ["audit-cc"]="1.0"
  ["account-cc"]="1.0"
  ["transaction-cc"]="1.0"
  ["loan-cc"]="1.0"
  ["config-cc"]="1.0"
)

deployChaincode() {
  local CC_NAME=$1
  local CC_VERSION=$2
  local CC_PATH="${CHAINCODE_DIR}/${CC_NAME}"
  local CC_LABEL="${CC_NAME}_${CC_VERSION}"
  local SEQUENCE=1

  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "Deploying: ${CC_NAME} v${CC_VERSION} (3 Organizations)"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 1. Build chaincode if node_modules doesn't exist
  if [ ! -d "${CC_PATH}/dist" ]; then
    log "Building ${CC_NAME}..."
    cd "${CC_PATH}"
    npm ci --silent
    npm run build --silent
    cd "${NETWORK_DIR}"
  fi

  # 2. Package chaincode
  local PKG_FILE="${NETWORK_DIR}/channel-artifacts/${CC_LABEL}.tar.gz"
  if [ ! -f "${PKG_FILE}" ]; then
    log "Packaging ${CC_NAME}..."
    setGlobals 1 0
    peer lifecycle chaincode package "${PKG_FILE}" \
      --path "${CC_PATH}" \
      --lang node \
      --label "${CC_LABEL}"
    log "Package created: ${PKG_FILE}"
  fi

  # 3. Install on all peers across all 3 orgs
  for org in 1 2 3; do
    for peer_num in 0 1 2; do
      log "Installing ${CC_NAME} on Org${org} peer${peer_num}..."
      setGlobals $org $peer_num
      peer lifecycle chaincode install "${PKG_FILE}" 2>/dev/null || true
    done
  done

  # 4. Query package ID from Org1 peer0
  setGlobals 1 0
  local CC_PACKAGE_ID
  CC_PACKAGE_ID=$(peer lifecycle chaincode queryinstalled \
    --output json | jq -r --arg label "${CC_LABEL}" \
    '.installed_chaincodes[] | select(.label==$label) | .package_id')
  log "Package ID: ${CC_PACKAGE_ID}"

  # 5. Approve chaincode for each organization
  for org in 1 2 3; do
    log "Approving ${CC_NAME} for Org${org}..."
    setGlobals $org 0
    peer lifecycle chaincode approveformyorg \
      -o orderer0.orderer.bank.com:7050 \
      --ordererTLSHostnameOverride orderer0.orderer.bank.com \
      --channelID "${CHANNEL_NAME}" \
      --name "${CC_NAME}" \
      --version "${CC_VERSION}" \
      --package-id "${CC_PACKAGE_ID}" \
      --sequence ${SEQUENCE} \
      --tls \
      --cafile "${ORDERER_CA}"
  done

  # 6. Commit chaincode with endorsement across all 3 orgs
  log "Committing ${CC_NAME} to ${CHANNEL_NAME}..."
  setGlobals 1 0
  peer lifecycle chaincode commit \
    -o orderer0.orderer.bank.com:7050 \
    --ordererTLSHostnameOverride orderer0.orderer.bank.com \
    --channelID "${CHANNEL_NAME}" \
    --name "${CC_NAME}" \
    --version "${CC_VERSION}" \
    --sequence ${SEQUENCE} \
    --tls \
    --cafile "${ORDERER_CA}" \
    --peerAddresses peer0.bank.com:7051 \
    --tlsRootCertFiles "${NETWORK_DIR}/organizations/peerOrganizations/bank.com/peers/peer0.bank.com/tls/ca.crt" \
    --peerAddresses peer0.insurance.com:10051 \
    --tlsRootCertFiles "${NETWORK_DIR}/organizations/peerOrganizations/insurance.com/peers/peer0.insurance.com/tls/ca.crt" \
    --peerAddresses peer0.audit.com:11051 \
    --tlsRootCertFiles "${NETWORK_DIR}/organizations/peerOrganizations/audit.com/peers/peer0.audit.com/tls/ca.crt"

  log "✓ ${CC_NAME} deployed and committed across Org1, Org2, Org3!"
}

# Deploy in dependency order
for cc in "audit-cc" "account-cc" "transaction-cc" "loan-cc" "config-cc"; do
  deployChaincode "${cc}" "${CHAINCODES[$cc]}"
done

log "All 5 chaincodes successfully deployed across all 3 Organizations!"
