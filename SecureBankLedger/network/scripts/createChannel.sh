#!/usr/bin/env bash
###############################################################################
# SecureBank Ledger — network/scripts/createChannel.sh (3 Organizations)
# Creates banking-channel and joins peers from Org1, Org2, Org3
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
export PATH="/Users/dhavalvarvariya/Downloads/CHARUSAT/D/fabric-samples/bin:${PATH}"
CHANNEL_NAME="banking-channel"
DELAY=3
MAX_RETRY=10

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log()   { echo -e "${GREEN}[$(date +'%H:%M:%S')] $*${NC}"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR: $*${NC}"; exit 1; }

ORDERER_CA="${NETWORK_DIR}/organizations/ordererOrganizations/orderer.bank.com/orderers/orderer0.orderer.bank.com/msp/tlscacerts/tlsca.orderer.bank.com-cert.pem"

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

createChannel() {
  log "Creating channel: ${CHANNEL_NAME}..."
  setGlobals 1 0
  local rc=1
  local counter=1
  while [ $counter -le $MAX_RETRY ] && [ $rc -ne 0 ]; do
    peer channel create \
      -o orderer0.orderer.bank.com:7050 \
      -c "${CHANNEL_NAME}" \
      --ordererTLSHostnameOverride orderer0.orderer.bank.com \
      -f "${NETWORK_DIR}/channel-artifacts/${CHANNEL_NAME}.tx" \
      --outputBlock "${NETWORK_DIR}/channel-artifacts/${CHANNEL_NAME}.block" \
      --tls \
      --cafile "${ORDERER_CA}" && rc=0 || rc=$?
    counter=$((counter + 1))
    [ $rc -ne 0 ] && sleep $DELAY
  done
  [ $rc -ne 0 ] && error "Channel creation failed after ${MAX_RETRY} retries"
  log "Channel ${CHANNEL_NAME} created successfully."
}

joinChannel() {
  local org=$1
  local peer_num=$2
  log "Joining Org${org} peer${peer_num} to ${CHANNEL_NAME}..."
  setGlobals $org $peer_num
  local rc=1
  local counter=1
  while [ $counter -le $MAX_RETRY ] && [ $rc -ne 0 ]; do
    peer channel join \
      -b "${NETWORK_DIR}/channel-artifacts/${CHANNEL_NAME}.block" && rc=0 || rc=$?
    counter=$((counter + 1))
    [ $rc -ne 0 ] && sleep $DELAY
  done
  [ $rc -ne 0 ] && error "Org${org} peer${peer_num} failed to join channel"
  log "Org${org} peer${peer_num} joined ${CHANNEL_NAME}."
}

updateAnchorPeers() {
  local org=$1
  local org_msp=$2
  log "Updating anchor peer for Org${org} (${org_msp})..."
  setGlobals $org 0
  peer channel update \
    -o orderer0.orderer.bank.com:7050 \
    --ordererTLSHostnameOverride orderer0.orderer.bank.com \
    -c "${CHANNEL_NAME}" \
    -f "${NETWORK_DIR}/channel-artifacts/${org_msp}anchors.tx" \
    --tls \
    --cafile "${ORDERER_CA}"
  log "Anchor peer updated for Org${org}."
}

# 1. Create channel
createChannel

# 2. Join all peers across all 3 Orgs
for org in 1 2 3; do
  for peer in 0 1 2; do
    joinChannel $org $peer
  done
done

# 3. Update Anchor Peers for all 3 Orgs
updateAnchorPeers 1 "BankOrgMSP"
updateAnchorPeers 2 "InsuranceOrgMSP"
updateAnchorPeers 3 "AuditOrgMSP"

log "Channel setup complete. All 9 peers across Org1, Org2, Org3 have joined ${CHANNEL_NAME}."
