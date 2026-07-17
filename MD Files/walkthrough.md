# Walkthrough: Hyperledger Fabric Banking Blockchain Project

This document details the completed implementation of the permissioned banking blockchain system on Hyperledger Fabric, built entirely from scratch, as well as the dynamic policy scenario benchmarking.

---

## 1. Accomplished Deliverables & Files Created

The following directories and files have been successfully structured and created in your project workspace:

### A. Network Infrastructure (`banking-network/`)
* **`crypto-config.yaml`**: Defines peer and orderer specifications for the 3-Org network layout (BankA, BankB, RegulatorOrg).
* **`configtx.yaml`**: Standardizes channel configurations, implicit majority policies, and application capabilities (V2.5 compatible).
* **`docker-compose.yaml`**: Orchestrates CAs, CouchDB database states, peers, and Raft orderers for the three organizations.

### B. Smart Contract Development (`banking-chaincode/`)
* **`banking.go`**: Rebuilt Go contract implementation covering:
  - Granular identity validation checking client roles (`teller`, `branch_manager`, `compliance_officer`).
  - Account actions (`CreateAccount`, `GetAccount`, `UpdateKYCStatus`, `FreezeAccount`).
  - Transaction histories with composite keys (`account~txID`).
  - Structured multi-signature loan approval workflow requiring commercial bank & Regulator sign-offs.
  - Safe customer PII uploads using Hyperledger Fabric **Private Data Collections**.
* **`collections_config.json`**: Configures member-only read/write policies for `kycPrivateCollection`.
* **`banking_test.go`**: Unit tests mock the stub interfaces to test operations and check ABAC authorization bounds.

### C. Client REST API (`banking-client/`)
* **`index.js`**: Integrates the `@hyperledger/fabric-gateway` client SDK to connect to `bankingchannel`. Exposes 15 distinct REST endpoints and dynamically matches user identities using HTTP headers (`X-Org` and `X-Role`).
* **`banking_postman_collection.json`**: Standard Postman collection to test the entire operational flow.

### D. Caliper Benchmarks & Multi-Scenario Automation (`banking-caliper/`)
* **`networks/networkConfig.yaml`**: Pointing Caliper to the 3-Org connections profiles.
* **`benchmarks/config.yaml`**: Benchmarking rounds for `open-account` (50 TPS), `transfer-funds` (100 TPS), and `approve-loan` (20 TPS).
* **Workload scripts**: Updated `workload/openAccount.js`, `workload/transferFunds.js`, and `workload/approveLoan.js` to dynamically support `targetPeers` and `keyPrefix` parameters.
* **`run_scenarios.js`**: Automation runner script that sequentially tests 8 different endorsement policy configurations (500 transactions per round each) and compiles a comparative report.

---

## 2. Policy Benchmarking Results

We successfully executed Caliper benchmarks for **all 8 policy scenarios** with 500 transactions each:

* **Create Account**: 500 transactions (50 TPS target) -> **100% success rate** across all cases (avoiding duplicate collisions using dynamic prefixes).
* **Transfer Funds**: 500 transactions (100 TPS target) -> **~95-97% success rate** under concurrent stress (showing LevelDB/CouchDB MVCC read/write lock contention).
* **Loan Approval**: 500/1000/2000 transactions (20 TPS target) -> **Exactly 50% success rate** (250/500/1000 approvals fail due to correct ABAC role restrictions).

The detailed comparative metrics are stored in the root at:
* **500 Transactions Report**: [caliper_scenarios_comparison_report.md](file:///Users/dhavalvarvariya/Downloads/CHARUSAT/D/caliper_scenarios_comparison_report.md)
* **1000 Transactions Report**: [caliper_scenarios_comparison_report_1000.md](file:///Users/dhavalvarvariya/Downloads/CHARUSAT/D/caliper_scenarios_comparison_report_1000.md)
* **2000 Transactions Report**: [caliper_scenarios_comparison_report_2000.md](file:///Users/dhavalvarvariya/Downloads/CHARUSAT/D/caliper_scenarios_comparison_report_2000.md)

---

## 3. Operational Flows Map

Here is how the API, Go chaincode, and endorsement policies interact during a standard credit operation:

```mermaid
sequenceDiagram
    autonumber
    actor Developer as Postman / Client
    participant API as REST API Client (index.js)
    participant PeerA as Bank A Peer
    participant PeerR as Regulator Peer
    participant Orderer as Orderer Org
    
    Developer->>API: POST /loans (loan001, applicant, 25k00)
    API->>PeerA: Submit CreateLoan
    PeerA->>API: Endorsed & Written
    
    Developer->>API: POST /loans/loan001/approve (X-Role: branch_manager, X-Org: BankA)
    API->>PeerA: Submit ApproveLoan
    PeerA->>API: Endorsed
    
    Developer->>API: POST /loans/loan001/approve (X-Role: branch_manager, X-Org: RegulatorOrg)
    API->>PeerR: Submit ApproveLoan
    PeerR-->>API: Endorsed
    
    Developer->>API: POST /loans/loan001/disburse
    API->>PeerA: Submit DisburseLoan
    PeerA->>Orderer: Commit block
    Orderer->>PeerA: Committed (Applicant Balance Credited)
```

