# SecureBank Ledger — Runbook

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Docker Desktop | ≥ 24 | https://docker.com |
| docker-compose | ≥ 2.20 | bundled with Docker Desktop |
| Fabric binaries | 2.5.x | See below |
| Node.js | 20.x | https://nodejs.org |
| npm | 10.x | bundled with Node 20 |

### Install Fabric Binaries

```bash
curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.7 1.5.9
# Adds peer, orderer, configtxgen, cryptogen, fabric-ca-client to PATH
export PATH="$PWD/bin:$PATH"
```

---

## Local Network Setup (Step by Step)

### 1. Clone & Navigate

```bash
git clone https://github.com/yourorg/securebank-ledger
cd securebank-ledger/SecureBankLedger
```

### 2. Start the Fabric Network

```bash
cd network
chmod +x scripts/*.sh
./scripts/up.sh
```

This script will:
- Generate crypto material (cryptogen)
- Create genesis block and channel tx (configtxgen)
- Start Docker Compose (CA + 3 orderers + 3 peers + CouchDB + PostgreSQL)
- Create `banking-channel` and join all peers
- Deploy all 5 chaincodes
- Enroll default users

### 3. Verify Network Health

```bash
# Check all containers are running
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Check peer channel list
docker exec peer0.bank.com peer channel list

# Check chaincode list
docker exec peer0.bank.com peer lifecycle chaincode querycommitted --channelID banking-channel

# CouchDB UI
open http://localhost:5984/_utils
# Login: admin / adminpw
```

### 4. Start Backend

```bash
cd backend
cp .env.example .env
# Edit .env with correct paths
npm install
npm run dev
# → Running on http://localhost:4000
```

### 5. Start Frontend

```bash
cd frontend
npm install
npm run dev
# → Running on http://localhost:3000
```

---

## Network Lifecycle Commands

### Stop Network (keep data)
```bash
cd network && ./scripts/down.sh
```

### Stop + Full Reset (remove all data)
```bash
cd network && ./scripts/down.sh --clean
```

### Re-deploy a single chaincode
```bash
# Edit CHAINCODES array in deployCC.sh for single CC
cd network && ./scripts/deployCC.sh
```

---

## User Enrollment

### Enroll via REST API
```bash
# Bank Admin
curl -X POST http://localhost:4000/api/auth/enroll \
  -H "Content-Type: application/json" \
  -d '{"userId":"bank-admin","secret":"adminpw"}'

# Teller
curl -X POST http://localhost:4000/api/auth/enroll \
  -d '{"userId":"bank-teller","secret":"tellerpw"}'

# Customer
curl -X POST http://localhost:4000/api/auth/enroll \
  -d '{"userId":"customer-001","secret":"customer001pw"}'
```

### Register New User (ADMIN only)
```bash
ADMIN_TOKEN="<jwt_from_enroll>"
curl -X POST http://localhost:4000/api/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId":"new-teller","secret":"tellerpw","role":"TELLER"}'
```

---

## Common Operations

### Create Account
```bash
curl -X POST http://localhost:4000/api/accounts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"CUST-001","accountType":"SAVINGS","initialDeposit":10000,"currency":"INR"}'
```

### Deposit
```bash
curl -X POST http://localhost:4000/api/transactions/deposit \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"accountId":"ACC-XXXX","amount":5000,"reference":"Salary"}'
```

### Transfer
```bash
curl -X POST http://localhost:4000/api/transactions/transfer \
  -d '{"fromAccountId":"ACC-A","toAccountId":"ACC-B","amount":2000,"reference":"Rent"}'
```

### Apply + Approve + Disburse Loan
```bash
# Apply (as CUSTOMER)
curl -X POST http://localhost:4000/api/loans \
  -d '{"customerId":"CUST-001","accountId":"ACC-XXX","principal":100000,"termMonths":12}'

# Approve (as LOAN_OFFICER)
curl -X PATCH http://localhost:4000/api/loans/LOAN-XXX/approve \
  -d '{"interestRate":9.5}'

# Disburse (as LOAN_OFFICER)
curl -X PATCH http://localhost:4000/api/loans/LOAN-XXX/disburse
```

### Query Audit Trail
```bash
curl http://localhost:4000/api/audit/ACCOUNT/ACC-XXX \
  -H "Authorization: Bearer $AUDITOR_TOKEN"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `cryptogen not found` | Add Fabric bin to PATH: `export PATH="$PWD/bin:$PATH"` |
| Peer not joining channel | Wait 15s for orderer to elect leader; check `docker logs orderer0.orderer.bank.com` |
| Chaincode install fails | Ensure Docker has access to `/var/run/docker.sock` |
| `Identity for user not found` | Run `./scripts/enrollUsers.sh` first |
| Backend `ECONNREFUSED 7051` | Ensure Fabric network is up: `docker ps | grep peer0` |
| CouchDB connection failed | Check CouchDB container: `docker logs couchdb0` |
| PostgreSQL `ECONNREFUSED` | Run network first: postgres is part of docker-compose |

---

## Port Reference

| Service | Port | Notes |
|---------|------|-------|
| Fabric CA | 7054 | TLS enabled |
| orderer0 | 7050 | gRPC + mTLS |
| orderer1 | 8050 | gRPC + mTLS |
| orderer2 | 9050 | gRPC + mTLS |
| peer0 | 7051 | gRPC + mTLS |
| peer1 | 8051 | gRPC + mTLS |
| peer2 | 9051 | gRPC + mTLS |
| CouchDB0 | 5984 | UI: /_utils |
| CouchDB1 | 6984 | |
| CouchDB2 | 7984 | |
| PostgreSQL | 5432 | |
| Backend API | 4000 | REST |
| Frontend | 3000 | React |
