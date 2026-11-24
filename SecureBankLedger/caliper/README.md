# SecureBank Ledger — 3-Organization Benchmark & Test Automation Guide

This guide details how to run Hyperledger Caliper benchmarks across **3 Organizations** with **27 Endorsement Policy Scenario Cases** and increasing transaction volumes (100 to 2500 transactions per round).

---

## 1. Network Topology (3 Organizations)

- **Org1 (`BankOrgMSP`)**: Primary commercial bank (`bank.com`) — 3 Peers, 3 CouchDBs, CA.
- **Org2 (`InsuranceOrgMSP`)**: Financial/Insurance partner (`insurance.com`) — 3 Peers, 3 CouchDBs, CA.
- **Org3 (`AuditOrgMSP`)**: Regulatory/Auditor authority (`audit.com`) — 3 Peers, 3 CouchDBs, CA.
- **Orderers**: 3-Node Raft Cluster (`orderer0`, `orderer1`, `orderer2.orderer.bank.com`).
- **Channel**: `banking-channel` joined by all 9 peers across all 3 organizations.

---

## 2. Benchmark Design & Matrix

### 3 Transaction Types Evaluated
1. **Registration (`createAccount`)**: New account creation on ledger, distributed round-robin across Org1, Org2, Org3.
2. **Query (`getAccount` / `getAccountsByCustomer`)**: Read-only evaluation verifying cross-org data isolation and CouchDB index performance.
3. **Transfer (`transfer`)**: Cross-organization fund transfers (`Org1 → Org2 → Org3 → Org1`).

### Transaction Volumes per Case
- **25 Rounds per transaction type**: `100, 200, 300, ... 2500` (step size = 100).
- **Rounds per Case**: $3 \times 25 = 75$ rounds.
- **Total Transactions per Case**: $97,500$ transactions.

### 27 Scenario Cases (Endorsement Policies)
Each transaction type is evaluated under three endorsement policies:
- `ANY`: Single endorser required (`OR('BankOrgMSP.peer', 'InsuranceOrgMSP.peer', 'AuditOrgMSP.peer')`).
- `MAJORITY`: Quorum of 2 out of 3 (`OutOf(2, 'BankOrgMSP.peer', 'InsuranceOrgMSP.peer', 'AuditOrgMSP.peer')`).
- `ALL`: Unanimous agreement (`AND('BankOrgMSP.peer', 'InsuranceOrgMSP.peer', 'AuditOrgMSP.peer')`).

Total combinations: $3 \times 3 \times 3 = \mathbf{27\text{ Cases}}$:
- **Group A (Cases 1–9)**: Registration policy = `ANY`
- **Group B (Cases 10–18)**: Registration policy = `MAJORITY`
- **Group C (Cases 19–27)**: Registration policy = `ALL`

---

## 3. Quick Start Instructions

### Step 1: Start the 3-Org Fabric Network
```bash
cd network/scripts
bash up.sh
```
This script automatically:
1. Generates MSP crypto materials for Org1, Org2, and Org3.
2. Builds the genesis block and `banking-channel` artifacts.
3. Launches all 9 peers, 9 CouchDBs, 3 CAs, and 3 Raft orderers.
4. Joins all peers to `banking-channel` and updates anchor peers.
5. Deploys and commits all 5 chaincodes across all 3 organizations.

### Step 2: Install Caliper Dependencies
```bash
cd ../../caliper
npm install
npm run bind
```

### Step 3: Seed Account Pools
Pre-populate 500 accounts per organization (1,500 total) to ensure unique, collision-free transfers and queries:
```bash
npm run seed
```

### Step 4: Run Benchmarks

#### Option A: Run Individual Baseline Benchmarks
```bash
npm run bench:registration   # 25 rounds (100 to 2500 tx)
npm run bench:query          # 25 rounds
npm run bench:transfer       # 25 rounds
npm run bench:all            # Runs all 3 sequentially
```

#### Option B: Run by Endorsement Policy Groups
```bash
npm run cases:groupA         # Cases 1–9   (Registration = ANY)
npm run cases:groupB         # Cases 10–18 (Registration = MAJORITY)
npm run cases:groupC         # Cases 19–27 (Registration = ALL)
```

#### Option C: Run Full 27-Case Suite
```bash
npm run cases:all
# Or run a subset range (e.g. cases 1 to 5):
bash run-all-cases.sh 1 5
```

---

## 4. Analyzing Benchmark Results

Once completed, summarize and compare metrics across all 27 cases:
```bash
python3 analyze-results.py
```
This generates:
- A clean terminal summary table.
- A spreadsheet-ready CSV file (`benchmark_comparison_matrix.csv`) containing TPS, Latency (avg/max), and Success Rates for all 27 cases and all volume levels.
