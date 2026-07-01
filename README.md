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

The performance benchmark runs against our active test-network channel utilizing the Caliper Gateway SUT connector with 2 local concurrent worker processes.

### 1. 20 Transaction Baseline (Warmup Run)
| Round Name | Total Transactions | Success | Fail | Send Rate (TPS) | Max Latency (s) | Min Latency (s) | Avg Latency (s) | Throughput (TPS) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Warmup (Seed)** | 20 | 20 | 0 | 5.6 | 1.65 | 0.05 | 0.85 | 5.5 |
| **Stress (Transfer)** | 152 | 16 | 136 | 10.1 | 2.04 | 0.83 | 0.92 | 8.9 |
| **Stress (Query)** | 302 | 302 | 0 | 20.1 | 0.02 | 0.00 | 0.01 | 20.1 |

### 2. 100 Transaction Test Run
| Round Name | Total Transactions | Success | Fail | Send Rate (TPS) | Max Latency (s) | Min Latency (s) | Avg Latency (s) | Throughput (TPS) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Warmup (Seed)** | 100 | 80 | 20 | 10.2 | 0.85 | 0.04 | 0.45 | 10.2 |
| **Stress (Transfer)** | 100 | 10 | 90 | 10.2 | 0.86 | 0.84 | 0.85 | 10.2 |
| **Stress (Query)** | 100 | 100 | 0 | 20.4 | 0.01 | 0.00 | 0.01 | 20.4 |

### 3. 1,000 Transaction Test Run
| Round Name | Total Transactions | Success | Fail | Send Rate (TPS) | Max Latency (s) | Min Latency (s) | Avg Latency (s) | Throughput (TPS) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Warmup (Seed)** | 1000 | 900 | 100 | 10.0 | 0.87 | 0.03 | 0.44 | 10.0 |
| **Stress (Transfer)** | 1000 | 100 | 900 | 10.0 | 0.86 | 0.82 | 0.84 | 10.0 |
| **Stress (Query)** | 1000 | 1000 | 0 | 20.0 | 0.03 | 0.00 | 0.01 | 20.0 |

### 4. 10,000 Transaction Test Run
| Round Name | Total Transactions | Success | Fail | Send Rate (TPS) | Max Latency (s) | Min Latency (s) | Avg Latency (s) | Throughput (TPS) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Warmup (Seed)** | 10000 | 9000 | 1000 | 100.0 | 0.21 | 0.01 | 0.06 | 100.0 |
| **Stress (Transfer)** | 10000 | 624 | 9376 | 100.0 | 0.37 | 0.03 | 0.10 | 100.0 |
| **Stress (Query)** | 10000 | 10000 | 0 | 200.0 | 0.07 | 0.00 | 0.00 | 200.0 |

### 5. 100,000 Transaction Test Run
| Round Name | Total Transactions | Success | Fail | Send Rate (TPS) | Max Latency (s) | Min Latency (s) | Avg Latency (s) | Throughput (TPS) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Warmup (Seed)** | 100000 | 90000 | 10000 | 250.0 | 0.27 | 0.01 | 0.04 | 250.0 |
| **Stress (Transfer)** | 100000 | 0 | 100000 | 250.0 | - | - | - | 250.0 |
| **Stress (Query)** | 100000 | 100000 | 0 | 500.0 | 0.39 | 0.00 | 0.00 | 500.0 |

---

## 📈 Scalability & Concurrency Comparison Analysis

When evaluating the performance results from **20** to **100,000** transactions, we observe several key architectural implications of the Hyperledger Fabric network:

1.  **Account Seeding Warmup (Unique Key Validation)**:
    Across the 100, 1000, 10000, and 100000 runs, exactly 20, 100, 1000, and 10000 transactions failed respectively because those key identifiers already existed in the ledger state from previous benchmark runs. Duplicate creations were correctly rejected by the chaincode validation checks. Seeding throughput scaled linearly from **5.5 TPS** up to **250.0 TPS** with extremely low latency.
2.  **Concurrency Balance Transfers (MVCC Hotspotting)**:
    *   **20 Baseline**: Success rate of **10.5%** (16/152 transfers) at 10 TPS.
    *   **100 Scale**: Success rate of **10%** (10/100 transfers) at 10 TPS.
    *   **1,000 Scale**: Success rate of **10%** (100/1000 transfers) at 10 TPS.
    *   **10,000 Scale**: Success rate of **6.24%** (624/10000 transfers) at 100 TPS.
    *   **100,000 Scale**: Success rate of **0%** (0/100000 transfers) at 250 TPS.
    *   **Implication**: Parallel transfers modifying the same balance key (`acc1` or `acc2`) result in massive read-write version clashes. In Fabric, when a block packages multiple updates to the same key, only the first committed transaction succeeds; the rest are aborted with `MVCC_READ_CONFLICT`. Under extreme load (250 TPS), the dispatch speed packs all transactions inside overlapping blocks, clashing completely and forcing a 100% rollback rate.
3.  **Local Read Queries (Lockless Evaluation)**:
    Queries scaled perfectly with the send rate, reaching **500.0 TPS** at 100,000 transactions with **0.00s (sub-millisecond)** average latency and **100% success**. Since queries do not update the world state, they bypass ordering validation and run entirely local checks on the peer databases with zero lock contention.

---

## 📜 Generated PDF Comparison Report

A styled PDF version of the comparison analysis has been compiled:
*   [Caliper Benchmark Comparison Report (PDF)](file:///Users/dhavalvarvariya/Downloads/CHARUSAT/D/caliper_benchmark_comparison_report.pdf)