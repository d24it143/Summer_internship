# SecureBank Ledger — REST API Reference

Base URL: `http://localhost:4000` (dev) | `https://api.securebank.yourdomain.com` (prod)

All endpoints except `/api/auth/enroll` require: `Authorization: Bearer <jwt>`

---

## Authentication

### POST /api/auth/enroll
Enroll a Fabric CA user and receive JWT tokens.

**Request:**
```json
{ "userId": "bank-admin", "secret": "adminpw" }
```
**Response:**
```json
{
  "accessToken": "eyJhb...",
  "refreshToken": "eyJhb...",
  "userId": "bank-admin",
  "role": "ADMIN",
  "expiresIn": "15m"
}
```

### POST /api/auth/refresh
Rotate access token using refresh token.

**Request:** `{ "refreshToken": "eyJhb..." }`
**Response:** `{ "accessToken": "...", "refreshToken": "..." }`

### POST /api/auth/register *(ADMIN)*
Register a new Fabric CA user.

**Request:**
```json
{ "userId": "new-teller", "secret": "password", "role": "TELLER" }
```

---

## Accounts

### POST /api/accounts *(ADMIN, TELLER)*
```json
{ "customerId": "CUST-001", "accountType": "SAVINGS", "initialDeposit": 10000, "currency": "INR" }
```
Returns: `AccountState`

### GET /api/accounts/:id
Returns: `AccountState`

Roles: ADMIN, TELLER, AUDITOR, CUSTOMER (own only)

### GET /api/accounts/:id/history *(ADMIN, TELLER, AUDITOR)*
Returns: `HistoryRecord[]` — blockchain state history via GetHistoryForKey

### GET /api/accounts/:id/transactions
Query: `?startDate=2026-01-01T00:00:00Z&endDate=2026-12-31T23:59:59Z`
Returns: `TransactionState[]`

### PATCH /api/accounts/:id/freeze *(ADMIN)*
```json
{ "reason": "Suspicious activity" }
```

### PATCH /api/accounts/:id/kyc *(ADMIN, TELLER)*
```json
{ "status": "VERIFIED" }
```

---

## Transactions

### POST /api/transactions/deposit
```json
{ "accountId": "ACC-001", "amount": 5000, "reference": "Salary" }
```
Returns: `TransactionState`

### POST /api/transactions/withdraw
```json
{ "accountId": "ACC-001", "amount": 1000, "reference": "ATM withdrawal" }
```
Enforces: insufficient balance check, daily withdrawal limit

### POST /api/transactions/transfer
```json
{ "fromAccountId": "ACC-001", "toAccountId": "ACC-002", "amount": 3000, "reference": "Rent" }
```
Atomic: both debit and credit in the same Fabric transaction

### POST /api/transactions/:id/reverse *(ADMIN, TELLER)*
Only for COMPLETED transactions within 24h.
```json
{ "reason": "Customer request" }
```

### GET /api/transactions/:id
Returns: `TransactionState`

---

## Loans

### POST /api/loans
```json
{
  "customerId": "CUST-001",
  "accountId": "ACC-001",
  "principal": 100000,
  "termMonths": 24,
  "collateral": "{\"property\":\"Home at 123 Main St\"}"
}
```
Returns: `LoanState` (status: APPLIED)

### PATCH /api/loans/:id/approve *(LOAN_OFFICER, ADMIN)*
```json
{ "interestRate": 9.5 }
```
Calculates EMI: `P * r * (1+r)^n / ((1+r)^n - 1)`

### PATCH /api/loans/:id/disburse *(LOAN_OFFICER, ADMIN)*
Credits the loan principal to accountId via transaction-cc.

### POST /api/loans/:id/repay
```json
{ "amount": 9500 }
```
Auto-allocates interest/principal portions.

### GET /api/loans/:id
Returns: `LoanState`

### GET /api/loans/customer/:customerId
Returns: `LoanState[]`

### GET /api/loans/overdue *(ADMIN, AUDITOR, LOAN_OFFICER)*
Returns loans where `nextDueDate < now` and `status = DISBURSED`

---

## Audit Trail

All audit endpoints require `ADMIN` or `AUDITOR` role.

### GET /api/audit/:entityType/:entityId
`entityType`: ACCOUNT | TRANSACTION | LOAN | CONFIG

Returns: `AuditRecord[]` sorted by timestamp

### GET /api/audit/user/:userId?startDate=&endDate=
Returns: `AuditRecord[]` for actions performed by userId

### GET /api/audit/range?startDate=&endDate=
Returns: `AuditRecord[]` across all entities in date range

---

## Health

### GET /api/health
```json
{
  "status": "ok",
  "service": "SecureBank Ledger API",
  "timestamp": "2026-05-25T07:00:00.000Z",
  "version": "1.0.0"
}
```

---

## Error Responses

All errors follow this format:
```json
{
  "error": "Human-readable error message",
  "code": "OPTIONAL_CODE",
  "details": [{ "field": "amount", "message": "Must be positive" }]
}
```

| HTTP Code | Meaning |
|-----------|---------|
| 400 | Validation error or chaincode business logic error |
| 401 | Missing/invalid/expired JWT |
| 403 | Insufficient role |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
