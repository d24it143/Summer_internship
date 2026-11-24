#!/usr/bin/env bash
################################################################################
# SecureBank Ledger — Apply Endorsement Policy for a Single Case
#
# Usage:  bash caliper/cases/apply-policy.sh <caseId>
# Example: bash caliper/cases/apply-policy.sh case-01
#
# This script reads policy.json for the given case and updates the chaincode
# endorsement policies on the Fabric network via peer lifecycle commands.
#
# Must be run from project root with Fabric binaries on PATH and
# FABRIC_CFG_PATH pointing to the network config.
################################################################################

set -euo pipefail

CASE_ID="${1:-}"
if [[ -z "$CASE_ID" ]]; then
  echo "❌  Usage: bash apply-policy.sh <caseId>  (e.g. case-01)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASE_DIR="$SCRIPT_DIR/$CASE_ID"
POLICY_JSON="$CASE_DIR/policy.json"
NETWORK_DIR="$(dirname "$SCRIPT_DIR")/network"
export PATH="/Users/dhavalvarvariya/Downloads/CHARUSAT/D/fabric-samples/bin:${PATH}"

if [[ ! -f "$POLICY_JSON" ]]; then
  echo "❌  policy.json not found: $POLICY_JSON"
  exit 1
fi

# ── Read policies from JSON ──────────────────────────────────────────────────
REG_POLICY=$(python3 -c "import json,sys; d=json.load(open('$POLICY_JSON')); print(d['fabricPolicies']['registration'])")
XFER_POLICY=$(python3 -c "import json,sys; d=json.load(open('$POLICY_JSON')); print(d['fabricPolicies']['transfer'])")
LOAN_POLICY=$(python3 -c "import json,sys; d=json.load(open('$POLICY_JSON')); print(d['fabricPolicies']['loan'])")
DESCRIPTION=$(python3 -c "import json,sys; d=json.load(open('$POLICY_JSON')); print(d['description'])")

echo "═══════════════════════════════════════════════════════════════"
echo "  Applying Endorsement Policies: $CASE_ID"
echo "  $DESCRIPTION"
echo "  Registration : $REG_POLICY"
echo "  Transfer     : $XFER_POLICY"
echo "  Loan Approval: $LOAN_POLICY"
echo "═══════════════════════════════════════════════════════════════"

# ── Common Fabric env ────────────────────────────────────────────────────────
export FABRIC_CFG_PATH="$NETWORK_DIR"
export CORE_PEER_TLS_ENABLED=true
CHANNEL="banking-channel"
ORDERER="orderer0.orderer.bank.com:7050"
ORDERER_TLS="$NETWORK_DIR/organizations/ordererOrganizations/orderer.bank.com/orderers/orderer0.orderer.bank.com/tls/ca.crt"

# Org1 (BankOrg) identity — used as proposer for all policy updates
export CORE_PEER_LOCALMSPID="BankOrgMSP"
export CORE_PEER_ADDRESS="peer0.bank.com:7051"
export CORE_PEER_MSPCONFIGPATH="$NETWORK_DIR/organizations/peerOrganizations/bank.com/users/Admin@bank.com/msp"
export CORE_PEER_TLS_ROOTCERT_FILE="$NETWORK_DIR/organizations/peerOrganizations/bank.com/peers/peer0.bank.com/tls/ca.crt"

# ── Helper: approve + commit chaincode with new policy ───────────────────────
apply_chaincode_policy() {
  local cc_name="$1"
  local signature_policy="$2"
  local sequence="$3"

  echo ""
  echo "── Updating $cc_name (sequence=$sequence) ──────────────────"

  # Approve from Org1
  peer lifecycle chaincode approveformyorg \
    --channelID "$CHANNEL" \
    --name "$cc_name" \
    --version "v1.0" \
    --sequence "$sequence" \
    --signature-policy "$signature_policy" \
    --tls --cafile "$ORDERER_TLS" \
    --orderer "$ORDERER"
  echo "  ✅ Org1 approved $cc_name"

  # Approve from Org2 (InsuranceOrg)
  CORE_PEER_LOCALMSPID="InsuranceOrgMSP" \
  CORE_PEER_ADDRESS="peer0.insurance.com:10051" \
  CORE_PEER_MSPCONFIGPATH="$NETWORK_DIR/organizations/peerOrganizations/insurance.com/users/Admin@insurance.com/msp" \
  CORE_PEER_TLS_ROOTCERT_FILE="$NETWORK_DIR/organizations/peerOrganizations/insurance.com/peers/peer0.insurance.com/tls/ca.crt" \
  peer lifecycle chaincode approveformyorg \
    --channelID "$CHANNEL" \
    --name "$cc_name" \
    --version "v1.0" \
    --sequence "$sequence" \
    --signature-policy "$signature_policy" \
    --tls --cafile "$ORDERER_TLS" \
    --orderer "$ORDERER"
  echo "  ✅ Org2 approved $cc_name"

  # Approve from Org3 (AuditOrg)
  CORE_PEER_LOCALMSPID="AuditOrgMSP" \
  CORE_PEER_ADDRESS="peer0.audit.com:11051" \
  CORE_PEER_MSPCONFIGPATH="$NETWORK_DIR/organizations/peerOrganizations/audit.com/users/Admin@audit.com/msp" \
  CORE_PEER_TLS_ROOTCERT_FILE="$NETWORK_DIR/organizations/peerOrganizations/audit.com/peers/peer0.audit.com/tls/ca.crt" \
  peer lifecycle chaincode approveformyorg \
    --channelID "$CHANNEL" \
    --name "$cc_name" \
    --version "v1.0" \
    --sequence "$sequence" \
    --signature-policy "$signature_policy" \
    --tls --cafile "$ORDERER_TLS" \
    --orderer "$ORDERER"
  echo "  ✅ Org3 approved $cc_name"

  # Commit
  peer lifecycle chaincode commit \
    --channelID "$CHANNEL" \
    --name "$cc_name" \
    --version "v1.0" \
    --sequence "$sequence" \
    --signature-policy "$signature_policy" \
    --tls --cafile "$ORDERER_TLS" \
    --orderer "$ORDERER" \
    --peerAddresses "peer0.bank.com:7051" \
      --tlsRootCertFiles "$NETWORK_DIR/organizations/peerOrganizations/bank.com/peers/peer0.bank.com/tls/ca.crt" \
    --peerAddresses "peer0.insurance.com:10051" \
      --tlsRootCertFiles "$NETWORK_DIR/organizations/peerOrganizations/insurance.com/peers/peer0.insurance.com/tls/ca.crt" \
    --peerAddresses "peer0.audit.com:11051" \
      --tlsRootCertFiles "$NETWORK_DIR/organizations/peerOrganizations/audit.com/peers/peer0.audit.com/tls/ca.crt"
  echo "  ✅ $cc_name committed with new policy"
}

# ── Read current sequence numbers ────────────────────────────────────────────
get_next_sequence() {
  local cc_name="$1"
  local current
  current=$(peer lifecycle chaincode querycommitted \
    --channelID "$CHANNEL" --name "$cc_name" \
    --tls --cafile "$ORDERER_TLS" 2>/dev/null \
    | grep -oP 'Sequence: \K[0-9]+' || echo "1")
  echo $((current + 1))
}

echo ""
echo "🔍 Fetching current sequence numbers..."
ACC_SEQ=$(get_next_sequence "account-cc")
TXN_SEQ=$(get_next_sequence "transaction-cc")
LOAN_SEQ=$(get_next_sequence "loan-cc")
echo "   account-cc seq=$ACC_SEQ | transaction-cc seq=$TXN_SEQ | loan-cc seq=$LOAN_SEQ"

# ── Apply policies ───────────────────────────────────────────────────────────
apply_chaincode_policy "account-cc"     "$REG_POLICY"  "$ACC_SEQ"
apply_chaincode_policy "transaction-cc" "$XFER_POLICY" "$TXN_SEQ"
apply_chaincode_policy "loan-cc"        "$LOAN_POLICY" "$LOAN_SEQ"

echo ""
echo "🎉 All endorsement policies applied for $CASE_ID"
