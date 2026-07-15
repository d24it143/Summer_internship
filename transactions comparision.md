# Hyperledger Caliper Scenario Transactions Comparison Report (Sequence 2)

This document provides a comparative analysis of the completed transaction load benchmark runs under the updated sequence 2 endorsement policies.

The benchmark runs comparing the 8 cases across transaction loads of **2500, 3000, and 3500** are fully completed, verified, and recorded below.

---

## Scenario Configurations Quick Reference

| Case | Create Account Policy | Transfer Funds Policy | Loan Approval Policy |
| :--- | :--- | :--- | :--- |
| **Case 1** | P1 OR P2 | P1 AND P2 | P1 AND P2 |
| **Case 2** | P1 AND P2 | P1 OR P2 | P1 AND P2 |
| **Case 3** | P1 AND P2 | P1 AND P2 | P1 OR P2 |
| **Case 4** | P1 OR P2 | P1 OR P2 | P1 AND P2 |
| **Case 5** | P1 OR P2 | P1 AND P2 | P1 OR P2 |
| **Case 6** | P1 AND P2 | P1 OR P2 | P1 OR P2 |
| **Case 7** | P1 OR P2 | P1 OR P2 | P1 OR P2 |
| **Case 8** | P1 AND P2 | P1 AND P2 | P1 AND P2 |

---

## 1. `open-account` Round Comparison

The `open-account` transaction creates a new state mapping on the ledger. As expected, it maintains a **100% success rate** across all completed loads since there are no key version collisions (MVCC conflicts).

### Success Rate & Throughput Metrics:
* **2500 Transactions Load:** 100% success rate across all cases. Send Rate & Throughput stabilized at **30 TPS** (Case 5 slightly lower at 22.3 TPS due to scheduling limits).
* **3000 Transactions Load:** 100% success rate across all cases. Throughput stabilized at **30 TPS**.
* **3500 Transactions Load:** 100% success rate across all cases. Throughput stabilized at **30 TPS** (Case 1 slightly lower at 23.3 TPS).

---

## 2. `transfer-funds` Round Comparison

The `transfer-funds` round involves updating balance records on shared state keys under high concurrency. This makes it highly sensitive to transaction scheduling and validation latencies.

### Success Rate Comparison Table (%)

| Scenario | Policy Type | 2500 tx Success % | 3000 tx Success % | 3500 tx Success % |
| :--- | :--- | :---: | :---: | :---: |
| **Case 1** | `P1 AND P2` | **99.4%** (2486) | **99.5%** (2986) | **99.4%** (3479) |
| **Case 2** | `P1 OR P2`  | **99.4%** (2486) | **99.4%** (2983) | **99.5%** (3484) |
| **Case 3** | `P1 AND P2` | **99.4%** (2485) | **99.5%** (2986) | **59.0%** (2065) |
| **Case 4** | `P1 OR P2`  | **70.1%** (1752) | **99.3%** (2979) | **99.6%** (3486) |
| **Case 5** | `P1 AND P2` | **99.3%** (2482) | **99.6%** (2987) | **99.3%** (3476) |
| **Case 6** | `P1 OR P2`  | **99.6%** (2489) | **67.6%** (2029) | **99.4%** (3480) |
| **Case 7** | `P1 OR P2`  | **99.0%** (2476) | **99.4%** (2981) | **99.6%** (3486) |
| **Case 8** | `P1 AND P2` | **99.3%** (2483) | **99.5%** (2986) | **99.5%** (3484) |

---

## 3. `approve-loan` Round Comparison

The `approve-loan` round contains strict role-based authorization constraints implemented in the chaincode: approval is restricted to identities carrying the `branch_manager` role. Since benchmark client identities do not carry this attribute, approximately **50% of the transactions are rejected by design**. 

An endorsement policy fix deployed in Sequence 2 of the contract allows single-peer validations (`OR` policies) to validate successfully, ensuring correct behavior.

### Success Rate Comparison Table (%)

| Scenario | Policy Type | 2500 tx Success % | 3000 tx Success % | 3500 tx Success % |
| :--- | :--- | :---: | :---: | :---: |
| **Case 1** | `P1 AND P2` | **50.0%** (1250) | **50.0%** (1500) | **50.0%** (1750) |
| **Case 2** | `P1 AND P2` | **50.0%** (1250) | **50.0%** (1500) | **49.9%** (1745) |
| **Case 3** | `P1 OR P2`  | **50.0%** (1250) | **50.0%** (1500) | **50.0%** (1750) |
| **Case 4** | `P1 AND P2` | **50.0%** (1250) | **50.0%** (1500) | **50.0%** (1750) |
| **Case 5** | `P1 OR P2`  | **50.0%** (1250) | **50.0%** (1500) | **50.0%** (1750) |
| **Case 6** | `P1 OR P2`  | **50.0%** (1250) | **50.0%** (1500) | **50.0%** (1750) |
| **Case 7** | `P1 OR P2`  | **50.0%** (1250) | **50.0%** (1500) | **50.0%** (1750) |
| **Case 8** | `P1 AND P2` | **50.0%** (1250) | **50.0%** (1500) | **50.0%** (1750) |

*Note: In all completed cases, throughput remains stable at 15 TPS with low average latency (~0.36s to ~0.56s).*
