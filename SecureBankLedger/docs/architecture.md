# SecureBank Ledger — Architecture Document

## System Overview

SecureBank Ledger is a production-grade blockchain banking application built on Hyperledger Fabric 2.5. It provides immutable, auditable financial records for a single bank organization with role-based access control enforced at the chaincode level via X.509 certificate attributes.

## Key Design Decisions & Assumptions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Consensus | Raft (etcdraft) | Production-ready, crash-fault-tolerant, no external dependency |
| State DB | CouchDB | Rich JSON queries needed for reporting (getAccountsByCustomer, getOverdueLoans) |
| Chaincode lang | TypeScript | Strong typing, modern ecosystem, same language as backend |
| Backend SDK | @hyperledger/fabric-gateway | Official Fabric 2.5+ SDK (not deprecated fabric-network) |
| Auth | JWT (RS256) + X.509 | JWT for REST API, X.509 enforced in chaincode via ABAC |
| Off-chain DB | PostgreSQL | Event-sourced cache; blockchain is source of truth |
| Cross-CC calls | invokeChaincode() | audit-cc is called by all other chaincodes for audit trail |
| HSM | File-system wallet (dev), PKCS#11 SoftHSM2 (prod) | Dev simplicity; prod-grade key protection |
| Daily withdrawal limit | Config stored in config-cc world state | Configurable at runtime by ADMIN without chaincode upgrade |

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│   React 18 + Tailwind (Vite)  ←→  nginx (port 3000)         │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTPS / JWT Bearer
┌────────────────────────▼─────────────────────────────────────┐
│                      API LAYER                               │
│   Express 5 + Helmet + Rate Limit (port 4000)                │
│   Routes: /auth /accounts /transactions /loans /audit        │
│   Middleware: JWT auth → RBAC → Zod validation               │
│   Jobs: loanEmiReminder + defaultDetection (node-cron)       │
└───────────┬──────────────────────────────┬───────────────────┘
            │ Fabric Gateway SDK           │ Sequelize ORM
            │ (mTLS gRPC)                  │
┌───────────▼──────────┐     ┌─────────────▼────────────────┐
│  FABRIC NETWORK       │     │    PostgreSQL 16              │
│  ┌─────────────────┐ │     │    Off-chain event cache      │
│  │ peer0 (7051)    │ │     │    Tables: AccountCache,      │
│  │ peer1 (8051)    │◄├─────│    TransactionCache,          │
│  │ peer2 (9051)    │ │     │    LoanCache, AuditCache      │
│  └────────┬────────┘ │     └──────────────────────────────┘
│           │          │
│  ┌────────▼────────┐ │
│  │   CouchDB       │ │
│  │ (Rich queries)  │ │
│  └─────────────────┘ │
│                      │
│  Orderers (Raft):    │
│  orderer0 (7050)     │
│  orderer1 (8050)     │
│  orderer2 (9050)     │
│                      │
│  Fabric CA (7054)    │
└──────────────────────┘
         │
         │ Chaincode (TypeScript)
┌────────▼──────────────────────────────────────────────┐
│  banking-channel                                       │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────┐ │
│  │  account-cc  │  │transaction-cc │  │  loan-cc   │ │
│  │              │  │               │  │            │ │
│  │ ACCOUNT::*   │  │ TXN::*        │  │ LOAN::*    │ │
│  └──────┬───────┘  └───────┬───────┘  └─────┬──────┘ │
│         │                  │                │        │
│         └──────────────────┴────────────────┘        │
│                            │ invokeChaincode()        │
│                   ┌────────▼────────┐                │
│                   │   audit-cc      │                │
│                   │  AUDIT::*       │                │
│                   └─────────────────┘                │
│                                                      │
│         ┌─────────────────┐                          │
│         │   config-cc     │                          │
│         │   CONFIG::*     │                          │
│         └─────────────────┘                          │
└──────────────────────────────────────────────────────┘
```

## Role-Based Access Control (ABAC)

Roles are enforced at TWO levels:
1. **API Layer**: Express middleware (`requireRole()`) checks JWT payload
2. **Chaincode Layer**: `ctx.clientIdentity.assertAttributeValue('role', 'ADMIN')` checks X.509 cert attrs

| Role | Permissions |
|------|-------------|
| CUSTOMER | deposit/withdraw own accounts, transfer, getLoan, getAccount (own) |
| TELLER | all CUSTOMER ops + any account, updateKYC |
| LOAN_OFFICER | approveLoan, disburseLoan, markDefault, all read ops |
| AUDITOR | all read-only queries for accounts, transactions, loans, audit |
| ADMIN | all operations + setConfig + freezeAccount + closeAccount |

## Chaincode Cross-Call Pattern

All state-changing chaincodes call audit-cc via `ctx.stub.invokeChaincode()`:

```typescript
await ctx.stub.invokeChaincode('audit-cc', [
  'AuditContract:createAuditRecord',
  auditId, entityType, entityId, action, caller, oldValue, newValue
], ctx.stub.getChannelID());
```

This ensures every state change is atomically recorded in the same Fabric transaction (both succeed or both fail).

## Security Architecture

- **mTLS**: All peer/orderer gRPC connections use mutual TLS
- **JWT**: Access tokens (15m) + rotating refresh tokens (7d)  
- **PKCS#11 HSM**: Production wallet uses SoftHSM2 via fabric-ca-client PKCS11 config
- **pgcrypto**: Sensitive fields (SSN, full account numbers) encrypted at rest in PostgreSQL
- **Rate Limiting**: 100 req/min per IP via express-rate-limit
- **Helmet.js**: X-Content-Type-Options, CSP, HSTS headers
- **CORS**: Whitelist only frontend origin
- **Zod**: All API inputs validated before chaincode invocation

## Event Sourcing

Chaincode events are emitted on every state change:
- `AccountCreated`, `AccountFrozen`, `AccountClosed`
- `TransactionCompleted`, `TransactionReversed`
- `LoanApplied`, `LoanApproved`, `LoanDisbursed`, `LoanDefaulted`, `LoanClosed`
- `AuditRecordCreated`
- `ConfigUpdated`

The backend's `event.service.ts` subscribes to these via Fabric Gateway's `network.getChaincodeEvents()` and syncs to PostgreSQL for fast API queries without hitting the blockchain on every read.

## Data Flows

### Deposit Flow
```
Client → POST /api/transactions/deposit
  → Auth middleware (JWT verify)
  → RBAC middleware (CUSTOMER/TELLER/ADMIN)
  → Zod validation
  → TransactionCC.deposit() [Fabric Gateway submit]
    → getAccount(accountId) [cross-CC evaluate]
    → validateActive + balanceCheck
    → putState(TXN::*) + updateBalance via account-cc
    → invokeChaincode(audit-cc) [createAuditRecord]
    → setEvent('TransactionCompleted')
  → Response: TransactionState JSON
```

### Loan Disbursal Flow
```
LOAN_OFFICER → PATCH /api/loans/:id/disburse
  → disburseLoan(loanId) [Fabric submit]
    → mustGetLoan() → validate status=APPROVED
    → invokeChaincode(transaction-cc, deposit, principal)
      → credits accountId with principal amount
    → update loan status → DISBURSED
    → set disbursedAt + nextDueDate
    → invokeChaincode(audit-cc)
    → setEvent('LoanDisbursed')
```

## Production Deployment

```
kubectl apply -f k8s/
# Fill in secrets first:
kubectl create secret generic securebank-secrets \
  --from-literal=database-url='postgresql://...' \
  --from-literal=jwt-secret='...' \
  --from-literal=jwt-refresh-secret='...' \
  -n securebank
```

Fabric network runs as a separate infrastructure (not in the same K8s cluster in this design; it connects via external LoadBalancer services).
