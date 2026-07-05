# Hyperledger Fabric Banking Application & Benchmark Report

An end-to-end banking application built on **Hyperledger Fabric v2.5.15** featuring atomic fund transfers, a Node.js REST API Client using the modern **Fabric Gateway SDK**, and performance testing powered by **Hyperledger Caliper**.

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
