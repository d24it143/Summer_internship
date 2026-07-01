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

## 📊 Hyperledger Caliper Benchmarking Report

The benchmark runs against our active test-network channel utilizing the Gateway API connector.

### Test Environment Parameters
*   **Target SDK**: `fabric-network@2.2.12`
*   **Concurrency**: 2 concurrent workers (isolated local processes)

### Performance Statistics

| Round Name | Total Transactions | Success | Fail | Send Rate (TPS) | Max Latency (s) | Min Latency (s) | Avg Latency (s) | Throughput (TPS) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Seed Accounts (Warmup)** | 100 | 80 | 20 | 10.2 | 0.85 | 0.04 | 0.45 | 10.2 |
| **2. Transfer Funds (Stress)** | 100 | 10 | 90 | 10.2 | 0.86 | 0.84 | 0.85 | 10.2 |
| **3. Query Accounts (Read Stress)** | 100 | 100 | 0 | 20.4 | 0.01 | 0.00 | 0.01 | 20.4 |

### Concurrency & Architectural Analysis

*   **Round 1 (Warmup)**: 80 transactions succeeded and 20 failed. The 20 failures occurred because the account keys (`work_acc_0_1` to `work_acc_0_10` and `work_acc_1_1` to `work_acc_1_10`) already existed in the ledger state from the previous benchmark run. The chaincode's duplicate validation check correctly rejected these duplicate accounts.
*   **Round 2 (Transfer Funds)**: A significant portion of transactions failed (**90 out of 100**). This is expected behavior showing Hyperledger Fabric's **Multi-Version Concurrency Control (MVCC)** mechanism under stress. 
    *   Since parallel threads are updating the *same keys* (`acc1` and `acc2`) simultaneously, they execute against the same world state version.
    *   When these transactions reach peer validation, only the first committed write in the block completes; subsequent concurrent updates are flagged as invalid due to reading stale keys (`MVCC_READ_CONFLICT`).
    *   *Mitigation*: To scale transfer transactions in Hyperledger Fabric, developers utilize transaction scheduling queues, balance grouping, or a UTXO-based ledger design.
*   **Round 3 (Query Accounts)**: Achieving a **100% success rate** with extremely low latency (10ms) at 20.4 TPS. Read-only queries do not modify the world state and thus bypass ordering validation, executing entirely local checks on the peer databases.