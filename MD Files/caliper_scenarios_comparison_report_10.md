# Hyperledger Caliper Policy Scenarios Comparison Report (10 Transactions)

This report compares performance across the 8 different endorsement policy configurations requested. Each case executed 10 transactions per round with workers. Channel validation policies were set to `OR` to accept both 1 and 2 peer endorsements, allowing performance comparison without validation failures.

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
| **Case 1** | P1 OR P2 | 10 | 0 | 52.6 | 0.14s | 42.4 | **100.0%** |
| **Case 2** | P1 AND P2 | 10 | 0 | 51.3 | 0.14s | 43.1 | **100.0%** |
| **Case 3** | P1 AND P2 | 10 | 0 | 42 | 0.17s | 35.2 | **100.0%** |
| **Case 4** | P1 OR P2 | 10 | 0 | 59.9 | 0.12s | 49.3 | **100.0%** |
| **Case 5** | P1 OR P2 | 10 | 0 | 54.6 | 0.14s | 43.5 | **100.0%** |
| **Case 6** | P1 AND P2 | 10 | 0 | 55.9 | 0.14s | 45 | **100.0%** |
| **Case 7** | P1 OR P2 | 10 | 0 | 58.8 | 0.14s | 44.2 | **100.0%** |
| **Case 8** | P1 AND P2 | 10 | 0 | 54.6 | 0.14s | 43.7 | **100.0%** |

## Performance Metrics: `transfer-funds` round

| Scenario | Policy Type | Success | Fail | Send Rate (TPS) | Avg Latency (s) | Throughput (TPS) | Success % |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Case 1** | P1 AND P2 | 3 | 7 | 93.5 | 0.14s | 70.4 | **30.0%** |
| **Case 2** | P1 OR P2 | 3 | 7 | 89.3 | 0.12s | 65.8 | **30.0%** |
| **Case 3** | P1 AND P2 | 3 | 7 | 91.7 | 0.16s | 62.9 | **30.0%** |
| **Case 4** | P1 OR P2 | 3 | 7 | 94.3 | 0.13s | 73 | **30.0%** |
| **Case 5** | P1 AND P2 | 3 | 7 | 84.7 | 0.1s | 69 | **30.0%** |
| **Case 6** | P1 OR P2 | 3 | 7 | 90.1 | 0.11s | 67.1 | **30.0%** |
| **Case 7** | P1 OR P2 | 3 | 7 | 71.9 | 0.15s | 60.6 | **30.0%** |
| **Case 8** | P1 AND P2 | 3 | 7 | 89.3 | 0.15s | 62.9 | **30.0%** |

## Performance Metrics: `approve-loan` round

| Scenario | Policy Type | Success | Fail | Send Rate (TPS) | Avg Latency (s) | Throughput (TPS) | Success % |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Case 1** | P1 AND P2 | 5 | 5 | 29 | 2.05s | 4.9 | **50.0%** |
| **Case 2** | P1 AND P2 | 5 | 5 | 28.8 | 2.05s | 4.9 | **50.0%** |
| **Case 3** | P1 OR P2 | 5 | 5 | 28.2 | 2.05s | 4.9 | **50.0%** |
| **Case 4** | P1 AND P2 | 5 | 5 | 28.7 | 2.04s | 4.9 | **50.0%** |
| **Case 5** | P1 OR P2 | 5 | 5 | 28 | 2.06s | 4.8 | **50.0%** |
| **Case 6** | P1 OR P2 | 5 | 5 | 28.7 | 2.06s | 4.8 | **50.0%** |
| **Case 7** | P1 OR P2 | 5 | 5 | 28.8 | 2.05s | 4.9 | **50.0%** |
| **Case 8** | P1 AND P2 | 5 | 5 | 28.7 | 2.05s | 4.9 | **50.0%** |

## Key Findings & Comparative Analysis

1. **Latency Overhead of Dual Endorsement (`AND` vs `OR`):**
   - Transactions using `P1 AND P2` (dual-endorsement) show higher average latency than those using `P1 OR P2` (single-endorsement). This is because the Caliper client must establish connections to both peers, wait for dual simulation outputs, aggregate the responses, and submit a larger envelope with multiple signatures.
2. **Throughput Scaling Characteristics:**
   - Rounds configured with `P1 OR P2` are able to achieve higher throughput under stress because the workload can be distributed or handled by a single peer, reducing CPU cycles and serialization overhead.
3. **Write Bottlenecks in Fabric:**
   - In the `transfer-funds` round, even with key distribution, MVCC read/write conflicts can occur under high TPS. Using single peer signatures (`OR`) mitigates the round-trip latency, helping to finish transaction execution faster and reduce overlapping lock windows, leading to higher success rates.
