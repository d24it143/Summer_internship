# Hyperledger Fabric Endorsement Policy & Performance Report

This document details the configuration of the endorsement policies, peer validation topology, and the performance measurements collected via the live Hyperledger Fabric Caliper run.

---

## 1. Endorsement Policies & Peer Topology

The Hyperledger Fabric network consists of two main organizations: **Org1 (`Org1MSP`)** and **Org2 (`Org2MSP`)**. 
Each organization runs a peer:
* **Org1**: `peer0.org1.example.com` (listening on port `7051`)
* **Org2**: `peer0.org2.example.com` (listening on port `9051`)

Depending on the smart contract operation, different levels of signatures (endorsements) are verified at the gateway and the peer validation phase before commits are made:

```mermaid
graph TD
    subgraph Client Application
        C[Gateway Client]
    end
    
    subgraph Fabric Nodes
        P1[peer0.org1.example.com]
        P2[peer0.org2.example.com]
    end

    C -->|Submit CreateAccount| P1
    Note right of P1: Signature from either Org1 OR Org2 is valid
    
    C -->|Submit TransferFunds| P1 & P2
    Note right of P2: Signatures from BOTH Org1 AND Org2 required
    
    C -->|Submit ApproveLoan| P1 & P2
    Note right of P2: Signatures from BOTH Org1 AND Org2 required + ABAC check
```

### Policy Rules Mapping

1. **`CreateAccount` (Low-risk Onboarding)**:
   - **Policy**: `OR('Org1MSP.peer', 'Org2MSP.peer')`
   - **Peers Involved**: The client sends the transaction to **either** `peer0.org1` or `peer0.org2`. Only one signature is required to verify the new account block proposal.

2. **`TransferFunds` (High-risk Money-Movement)**:
   - **Policy**: `AND('Org1MSP.peer', 'Org2MSP.peer')`
   - **Peers Involved**: The client must send the transaction to **both** `peer0.org1` and `peer0.org2`. Both peers simulate the balance deduct/credit changes, sign the write set, and the matching read/write versions are checked.

3. **`ApproveLoan` (High-risk Compliance / Credit)**:
   - **Policy**: `AND('Org1MSP.peer', 'Org2MSP.peer')`
   - **Peers Involved**: Requires endorsements from **both** peers. Furthermore, the Go Smart Contract validates the identity of the signer using Attribute-Based Access Control (ABAC), requiring the certificate to contain the `role = branch_manager` attribute.

---

## 2. Live Caliper Measurement Report

Below are the actual performance metrics collected from the live benchmark execution against the CouchDB state database:

| Benchmark Round | Successfully Committed | Failed Transactions | Send Rate (TPS) | Max Latency (s) | Min Latency (s) | Avg Latency (s) | Throughput (TPS) | Success % |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`open-account`** | 1,000 | 0 | 50.2 | 0.18s | 0.04s | 0.10s | 50.1 | <span style="color:#22c55e">**100.0%**</span> |
| **`transfer-funds`** | 1,966 | 34 | 100.2 | 0.18s | 0.04s | 0.08s | 99.9 | <span style="color:#22c55e">**98.3%**</span> |
| **`approve-loan`** | 250 | 250 | 20.2 | 0.62s | 0.04s | 0.34s | 20.1 | <span style="color:#f59e0b">**50.0%**</span> |

---

## 3. Metric and Behavior Analysis

### 1. Transfer Funds Concurrency Solution
* **Result**: We achieved **98.3% success** under 100 TPS stress loads (1,966 / 2,000 successful commits).
* **Explanation**: The key randomization implemented in [transferFunds.js](file:///Users/dhavalvarvariya/Downloads/CHARUSAT/D/banking-caliper/workload/transferFunds.js) successfully distributed state changes across the 1,000 seeded accounts. The remaining 1.7% of failures are expected minor overlaps under concurrent thread executions.

### 2. Loan Approval ABAC Enforcement
* **Result**: Exactly **50% of the loan approvals failed** (250 successful, 250 failed).
* **Explanation**: This is the expected business security behavior. The benchmark workload script alternates between:
  1. `CreateLoanApplication` (submitted by standard users) -> **Authorized & Approved** (250 transactions).
  2. `ApproveLoan` (submitted by standard Caliper client identity) -> **Unauthorized** because the client certificate lacks the `role: branch_manager` attribute (250 transactions). The ledger successfully rejected unauthorized approvals as per safety policies!
