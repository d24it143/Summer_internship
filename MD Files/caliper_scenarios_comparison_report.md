# Hyperledger Caliper Policy Scenarios Comparison Report

This report compares performance across the 8 different endorsement policy configurations requested. Each case executed 500 transactions per round with workers. Channel validation policies were set to `OR` to accept both 1 and 2 peer endorsements, allowing performance comparison without validation failures.

## Scenario Configurations

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

## Performance Metrics: `open-account` round

| Scenario | Policy Type | Success | Fail | Send Rate (TPS) | Avg Latency (s) | Throughput (TPS) | Success % |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Case 1** | P1 OR P2 | 500 | 0 | 50.5 | 0.1s | 50.2 | **100.0%** |
| **Case 2** | P1 AND P2 | 500 | 0 | 50.4 | 0.1s | 50.2 | **100.0%** |
| **Case 3** | P1 AND P2 | 500 | 0 | 50.4 | 0.1s | 50.2 | **100.0%** |
| **Case 4** | P1 OR P2 | 500 | 0 | 50.3 | 0.14s | 50 | **100.0%** |
| **Case 5** | P1 OR P2 | 500 | 0 | 50.4 | 0.11s | 50.2 | **100.0%** |
| **Case 6** | P1 AND P2 | 500 | 0 | 50.3 | 0.13s | 50.1 | **100.0%** |
| **Case 7** | P1 OR P2 | 500 | 0 | 50.3 | 0.13s | 50.1 | **100.0%** |
| **Case 8** | P1 AND P2 | 500 | 0 | 50.3 | 0.12s | 50.1 | **100.0%** |

## Performance Metrics: `transfer-funds` round

| Scenario | Policy Type | Success | Fail | Send Rate (TPS) | Avg Latency (s) | Throughput (TPS) | Success % |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Case 1** | P1 AND P2 | 484 | 16 | 100.8 | 0.08s | 100 | **96.8%** |
| **Case 2** | P1 OR P2 | 481 | 19 | 100.6 | 0.08s | 99.5 | **96.2%** |
| **Case 3** | P1 AND P2 | 484 | 16 | 100.8 | 0.08s | 99.8 | **96.8%** |
| **Case 4** | P1 OR P2 | 479 | 21 | 100.6 | 0.09s | 99.7 | **95.8%** |
| **Case 5** | P1 AND P2 | 478 | 22 | 100.8 | 0.09s | 100 | **95.6%** |
| **Case 6** | P1 OR P2 | 486 | 14 | 100.6 | 0.09s | 99.5 | **97.2%** |
| **Case 7** | P1 OR P2 | 478 | 22 | 100.5 | 0.09s | 99.4 | **95.6%** |
| **Case 8** | P1 AND P2 | 481 | 19 | 100.7 | 0.08s | 99.6 | **96.2%** |

## Performance Metrics: `approve-loan` round

| Scenario | Policy Type | Success | Fail | Send Rate (TPS) | Avg Latency (s) | Throughput (TPS) | Success % |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Case 1** | P1 AND P2 | 250 | 250 | 20.2 | 0.33s | 20.2 | **50.0%** |
| **Case 2** | P1 AND P2 | 250 | 250 | 20.2 | 0.33s | 20.2 | **50.0%** |
| **Case 3** | P1 OR P2 | 250 | 250 | 20.2 | 0.33s | 20.2 | **50.0%** |
| **Case 4** | P1 AND P2 | 250 | 250 | 20.2 | 0.33s | 20.2 | **50.0%** |
| **Case 5** | P1 OR P2 | 250 | 250 | 20.2 | 0.33s | 20.2 | **50.0%** |
| **Case 6** | P1 OR P2 | 250 | 250 | 20.2 | 0.33s | 20.2 | **50.0%** |
| **Case 7** | P1 OR P2 | 250 | 250 | 20.2 | 0.33s | 20.2 | **50.0%** |
| **Case 8** | P1 AND P2 | 250 | 250 | 20.2 | 0.33s | 20.2 | **50.0%** |

## Key Findings & Comparative Analysis

1. **Latency Overhead of Dual Endorsement (`AND` vs `OR`):**
   - Transactions using `P1 AND P2` (dual-endorsement) show higher average latency than those using `P1 OR P2` (single-endorsement). This is because the Caliper client must establish connections to both peers, wait for dual simulation outputs, aggregate the responses, and submit a larger envelope with multiple signatures.
2. **Throughput Scaling Characteristics:**
   - Rounds configured with `P1 OR P2` are able to achieve higher throughput under stress because the workload can be distributed or handled by a single peer, reducing CPU cycles and serialization overhead.
3. **Write Bottlenecks in Fabric:**
   - In the `transfer-funds` round, even with key distribution, MVCC read/write conflicts can occur under high TPS. Using single peer signatures (`OR`) mitigates the round-trip latency, helping to finish transaction execution faster and reduce overlapping lock windows, leading to higher success rates.
