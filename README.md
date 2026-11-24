# Hyperledger Fabric Banking Application & Benchmark Report

An end-to-end banking application built on **Hyperledger Fabric v2.5** featuring atomic fund transfers, a Node.js REST API Client using the modern **Fabric Gateway SDK**, and performance testing powered by **Hyperledger Caliper**.

---

## 📢 Executive Work Update: 3-Organization Consortium & 27-Case Benchmark Suite

### 1. What Was Built & Implemented

1. **3-Organization Network Topology (Fabric 2.5 + Raft)**:
   - Scaled the network to a complete enterprise multi-org consortium:
     - **Org 1 (`BankOrgMSP` / `bank.com`)**: Primary commercial bank (3 Peers, 3 CouchDB instances, Fabric CA).
     - **Org 2 (`InsuranceOrgMSP` / `insurance.com`)**: Partner financial/insurance organization (3 Peers, 3 CouchDB instances, Fabric CA).
     - **Org 3 (`AuditOrgMSP` / `audit.com`)**: Regulatory supervisor & auditing authority (3 Peers, 3 CouchDB instances, Fabric CA).
   - **Consensus**: 3-Node Raft ordering cluster (`orderer0`, `orderer1`, `orderer2`).
   - Total infra: **9 Peers, 9 CouchDB databases, 3 CAs, and 3 Raft orderers** joined to `banking-channel`.

2. **27-Case Scenario Configurations Quick Reference ($3^3 = 27$ Cases)**:
   - Extended the previous 8-case ($2^3$) matrix into **27 unique test cases** evaluating 3 endorsement policies:
     - **`ANY`**: 1 endorser out of 3.
     - **`MAJORITY`**: Quorum of 2 out of 3.
     - **`ALL`**: Unanimous 3 out of 3.
   - Evaluated across **3 transaction types**:
     1. **Registration (`createAccount`)**: Write transaction creating accounts round-robin across Org1, Org2, and Org3.
     2. **Query (`getAccount` / CouchDB rich queries)**: Read-only query evaluating cross-org data isolation and response times.
     3. **Transfer (`transfer`)**: Inter-organization atomic balance transfers (`Org1 → Org2 → Org3 → Org1`).

3. **High-Volume Load Scaling**:
   - Tested each case across **25 transaction counts**: $100, 200, 300, \dots, 2500$ (step size = 100).
   - Total test runs: $27\text{ Cases} \times 25\text{ Steps} \times 3\text{ Tx Types} = \mathbf{2,025\text{ Test Runs}}$ ($\approx 2.63\text{M}$ transactions evaluated).
   - Automated policy switching between rounds using Fabric peer lifecycle commit commands (`apply-policy.sh`).

4. **Results Compilation & Visual Charts**:
   - Detailed in [**`SecureBankLedger/caliper/BENCHMARK_RESULTS_REPORT.md`**](file:///Users/dhavalvarvariya/Downloads/CHARUSAT/Summer%20internship/SecureBankLedger/caliper/BENCHMARK_RESULTS_REPORT.md) featuring:
     - Full comparative data tables for all 27 cases.
     - **Mermaid line chart** of Throughput (TPS) scaling up to 2,500 transactions.
     - **Mermaid bar chart** showing the latency impact of endorsement policies (`ANY` vs. `MAJORITY` vs. `ALL`).
     - Stability chart demonstrating transaction success rate ($99.8\%$ to $100\%$).

### 2. Key Findings & Metrics

- **Throughput (TPS)**:
  - **Query**: Sustained **~185 TPS** (sub-50ms latency) because queries execute locally at endorsing peers without Raft consensus.
  - **Registration**: Achieved **~49 TPS** with single-peer endorsement, normalizing around 40–44 TPS under multi-peer quorum.
  - **Transfer**: Sustained **27 to 35 TPS** due to read-write lock validation across two accounts and consensus serialization.
- **Policy Latency Overhead**:
  - `ANY` $\rightarrow$ `MAJORITY`: $\approx +55\%$ latency increase due to secondary peer network round-trips.
  - `MAJORITY` $\rightarrow$ `ALL`: $\approx +60\%$ additional latency overhead for 3-way unanimous cryptographic verification.
- **Recommended Setup**:
  - **Case 14 (`MAJORITY / MAJORITY / MAJORITY`)** provides the optimal production baseline, balancing fault tolerance, multi-party governance, and low latency.

### 3. Showcase Links & Verification Proofs

- 📌 **GitHub Branch**: [d24it143/Summer_internship (branch: `securebank-3org-caliper`)](https://github.com/d24it143/Summer_internship/tree/securebank-3org-caliper)
- 📌 **Pull Request**: [Summer_internship PR #new](https://github.com/d24it143/Summer_internship/pull/new/securebank-3org-caliper)
- 📄 **Full Benchmark Results Report (with Tables & Charts)**: [`SecureBankLedger/caliper/BENCHMARK_RESULTS_REPORT.md`](https://github.com/d24it143/Summer_internship/blob/securebank-3org-caliper/SecureBankLedger/caliper/BENCHMARK_RESULTS_REPORT.md)
- 📖 **Caliper 3-Org Guide & Execution Docs**: [`SecureBankLedger/caliper/README.md`](https://github.com/d24it143/Summer_internship/blob/securebank-3org-caliper/SecureBankLedger/caliper/README.md)
- ⚙️ **27 Test Case Configs & Manifest**: [`SecureBankLedger/caliper/cases/cases-manifest.json`](https://github.com/d24it143/Summer_internship/blob/securebank-3org-caliper/SecureBankLedger/caliper/cases/cases-manifest.json)
- 🐳 **3-Org Network Topology Definition**: [`SecureBankLedger/network/docker-compose.yaml`](https://github.com/d24it143/Summer_internship/blob/securebank-3org-caliper/SecureBankLedger/network/docker-compose.yaml) | [`SecureBankLedger/network/configtx.yaml`](https://github.com/d24it143/Summer_internship/blob/securebank-3org-caliper/SecureBankLedger/network/configtx.yaml)

---

## 🚀 Key Features

*   **Atomic Fund Transfers**: Deducts from sender and credits receiver atomically in a single state validation write (no partial state changes).
*   **Go Smart Contract**: Emits `FundsTransferred` events and validates transfer amounts and account existence.
*   **Express REST API Client**: Exposes blockchain state and transaction entrypoints while handling gRPC errors (e.g. mapping "insufficient funds" to HTTP 400).
*   **Hyperledger Caliper Benchmarking**: Performance statistics on account seeding, transfer latency, and read throughput.

---

## 🛠️ Environment Setup & Installation

### 1. Prerequisites
Ensure you have Homebrew and the Docker/Go dependencies configured (using **Colima** for a lightweight macOS container VM):
```bash
# Install toolchains
brew install go colima docker docker-compose

# Start the Docker VM
colima start --cpu 2 --memory 4
```

### 2. Pull Fabric Binaries & Start Network
```bash
# Bootstrap Fabric Samples v2.5.15 and CA v1.5.12
curl -sSL https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/bootstrap.sh | bash -s -- 2.5.15 1.5.12

# Add binaries to environment path
export PATH=$PATH:$(pwd)/fabric-samples/bin

# Start test-network with CA containers
cd fabric-samples/test-network
export DOCKER_SOCK=$HOME/.colima/default/docker.sock
./network.sh up createChannel -c mychannel -ca
```

### 3. Deploy Smart Contract
Ensure the Go chaincode dependencies are prepared, and deploy the chaincode:
```bash
cd ../../banking-chaincode
go mod tidy

cd ../fabric-samples/test-network
./network.sh deployCC -ccn banking -ccp ../../banking-chaincode -ccl go -c mychannel
```

---

## 📡 REST API Client Usage

The Node.js Express server acts as a REST Gateway to the Fabric network.

### Start the Server
```bash
cd banking-client
npm install
PORT=5001 npm start
```

### Endpoints & Test Commands

#### 1. Query All Accounts
```bash
curl -s http://localhost:5001/accounts
```
*Expected Response:*
```json
[
  {"ID":"acc1","Owner":"Alice","Balance":800},
  {"ID":"acc2","Owner":"Bob","Balance":700},
  {"ID":"acc3","Owner":"Charlie","Balance":250}
]
```

#### 2. Query Single Account
```bash
curl -s http://localhost:5001/accounts/acc1
```

#### 3. Transfer Funds (Success Case)
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"senderID": "acc1", "receiverID": "acc3", "amount": 50}' \
  http://localhost:5001/transfer
```
*Expected Response:*
```json
{
  "success": true,
  "data": {
    "Message": "Successfully transferred 50.00 from acc1 to acc3",
    "Sender": { "ID": "acc1", "Owner": "Alice", "Balance": 750 },
    "Receiver": { "ID": "acc3", "Owner": "Charlie", "Balance": 300 }
  }
}
```

#### 4. Transfer Funds (Error: Insufficient Funds)
```bash
curl -i -s -X POST -H "Content-Type: application/json" \
  -d '{"senderID": "acc1", "receiverID": "acc3", "amount": 50000}' \
  http://localhost:5001/transfer
```
*Expected Response: (HTTP/1.1 400 Bad Request)*
```json
{
  "success": false,
  "error": "chaincode response 500, insufficient funds"
}
```

---

## 💻 Web Dashboard UI Portal

Once the REST API client server is started on port `5001`, you can access the interactive Web Dashboard directly in your web browser:

1.  Open your browser and navigate to: **`http://localhost:5001`**
2.  The portal features:
    *   **Live Ledgers Board**: View accounts list, owner names, and balances updated in real-time.
    *   **Interactive Transfer Panel**: A client interface to perform fund transfers instantly.
    *   **MVCC Stress Test Switch**: Toggle parallel execution submissions to dynamically trigger and verify `MVCC_READ_CONFLICT` validations.
    *   **Event & Ledger Stream**: A console monitoring all outgoing transactions, responses, latency, and detailed validation failures.

---

## 📊 Hyperledger Caliper Benchmarking Reports

### 1. Baseline Performance Runs (Pre-Optimization)
These runs targeted a restricted key space (collating transfers on a few account keys), resulting in massive Multi-Version Concurrency Control (MVCC) rollbacks under high-frequency writes:

* **10,000 Transaction Scale (100 TPS)**: Success rate of **6.24%** (624 / 10,000 commits successful).
* **100,000 Transaction Scale (250 TPS)**: Success rate of **0.00%** (0 / 100,000 commits successful) due to 100% block-level key collision rates on hot sender/receiver accounts.

### 2. Optimized Performance Run (Post-Optimization)
By randomizing sender and receiver key distributions across the entire seeded 1,000-account namespace in [transferFunds.js](file:///Users/dhavalvarvariya/Downloads/CHARUSAT/D/banking-caliper/workload/transferFunds.js), we resolved write lock contention, raising success rates to **98.3%**:

| Benchmark Round | Successfully Committed | Failed Transactions | Send Rate (TPS) | Max Latency (s) | Min Latency (s) | Avg Latency (s) | Throughput (TPS) | Success % |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`open-account`** | 1,000 | 0 | 50.2 | 0.18s | 0.04s | 0.10s | 50.1 | <span style="color:#22c55e">**100.0%**</span> |
| **`transfer-funds`** | 1,966 | 34 | 100.2 | 0.18s | 0.04s | 0.08s | 99.9 | <span style="color:#22c55e">**98.3%**</span> |
| **`approve-loan`** | 250 | 250 | 20.2 | 0.62s | 0.04s | 0.34s | 20.1 | <span style="color:#f59e0b">**50.0%**</span> |

---

## 📈 Scalability & Endorsement Analysis

1. **MVCC Mitigation**:
   - The transfer-funds success rate rose from **6.24%** to **98.3%** under a 100 TPS write load.
   - Using randomized key distribution ensures that parallel execution threads write to separate CouchDB state partitions, avoiding transaction overlaps inside the same block validation window.
2. **Attribute-Based Access Control (ABAC)**:
   - Exactly **50% of the loan approvals failed** in the Caliper test.
   - This represents correct security enforcement: the smart contract requires the signing peer certificate to possess the `role: branch_manager` attribute. Standard user identities attempting approvals were correctly rejected with `identity authorization failed`.
3. **Endorsement Rules Policy Map**:
   - `CreateAccount`: `OR('Org1MSP.peer', 'Org2MSP.peer')` (Signature from either Org1 or Org2 is valid).
   - `TransferFunds`: `AND('Org1MSP.peer', 'Org2MSP.peer')` (Requires dual simulation signatures from both organizations).
   - `ApproveLoan`: `AND('Org1MSP.peer', 'Org2MSP.peer')` (Requires dual endorsements + co-signers must hold `branch_manager` credentials).
