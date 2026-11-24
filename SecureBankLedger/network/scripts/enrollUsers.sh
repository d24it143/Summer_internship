#!/usr/bin/env bash
################################################################################
# SecureBank Ledger — network/scripts/enrollUsers.sh
# Enrolls default users via Fabric CA: admin, teller, loan_officer, auditor
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log()   { echo -e "${GREEN}[$(date +'%H:%M:%S')] $*${NC}"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR: $*${NC}"; exit 1; }

command -v fabric-ca-client &>/dev/null || error "fabric-ca-client not found."

export FABRIC_CA_HOME="${NETWORK_DIR}/organizations/peerOrganizations/bank.com/ca"
CA_URL="https://localhost:7054"
CA_TLS_CERT="${NETWORK_DIR}/organizations/peerOrganizations/bank.com/ca/ca.bank.com-cert.pem"

# Enroll CA admin
log "Enrolling CA admin..."
fabric-ca-client enroll \
  -u "https://admin:adminpw@localhost:7054" \
  --caname ca.bank.com \
  --tls.certfiles "${CA_TLS_CERT}"

# Register and enroll each role
register_and_enroll() {
  local USER_ID=$1
  local SECRET=$2
  local ATTRS=$3
  local MSPDIR="${NETWORK_DIR}/wallet/${USER_ID}"

  log "Registering ${USER_ID}..."
  fabric-ca-client register \
    --caname ca.bank.com \
    --id.name "${USER_ID}" \
    --id.secret "${SECRET}" \
    --id.type client \
    --id.attrs "${ATTRS}" \
    --tls.certfiles "${CA_TLS_CERT}" 2>/dev/null || log "${USER_ID} may already be registered."

  log "Enrolling ${USER_ID}..."
  fabric-ca-client enroll \
    -u "https://${USER_ID}:${SECRET}@localhost:7054" \
    --caname ca.bank.com \
    -M "${MSPDIR}/msp" \
    --enrollment.attrs "${ATTRS}" \
    --tls.certfiles "${CA_TLS_CERT}"
  log "✓ ${USER_ID} enrolled."
}

# Admin user
register_and_enroll "bank-admin" "adminpw" "role=ADMIN:ecert,hf.Revoker=true"

# Teller user
register_and_enroll "bank-teller" "tellerpw" "role=TELLER:ecert"

# Loan Officer
register_and_enroll "loan-officer" "loanofficerpw" "role=LOAN_OFFICER:ecert"

# Auditor
register_and_enroll "bank-auditor" "auditorpw" "role=AUDITOR:ecert"

# Sample Customer
register_and_enroll "customer-001" "customer001pw" "role=CUSTOMER:ecert,customerId=CUST001:ecert"

log "All default users enrolled successfully!"
log "Wallet directory: ${NETWORK_DIR}/wallet"
