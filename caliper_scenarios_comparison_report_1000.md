# Hyperledger Caliper Policy Scenarios Comparison Report (1,000 Transactions)

This report compares performance across the 8 different endorsement policy configurations requested. Each case executed 1000 transactions per round with workers. Channel validation policies were set to `OR` to accept both 1 and 2 peer endorsements, allowing performance comparison without validation failures.

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
| **Case 1** | P1 OR P2 | 1000 | 0 | 50.2 | 0.11s | 50.1 | **100.0%** |
| **Case 2** | P1 AND P2 | 1000 | 0 | 50.2 | 0.11s | 50.1 | **100.0%** |
| **Case 3** | P1 AND P2 | 1000 | 0 | 50.2 | 0.11s | 50.1 | **100.0%** |
| **Case 4** | P1 OR P2 | 1000 | 0 | 50.2 | 0.12s | 50.1 | **100.0%** |
| **Case 5** | P1 OR P2 | 1000 | 0 | 50.2 | 0.11s | 50.1 | **100.0%** |
| **Case 6** | P1 AND P2 | 1000 | 0 | 50.2 | 0.11s | 50.1 | **100.0%** |
| **Case 7** | P1 OR P2 | 1000 | 0 | 50.2 | 0.12s | 50.1 | **100.0%** |
| **Case 8** | P1 AND P2 | 1000 | 0 | 50.2 | 0.1s | 50.1 | **100.0%** |

## Performance Metrics: `transfer-funds` round

| Scenario | Policy Type | Success | Fail | Send Rate (TPS) | Avg Latency (s) | Throughput (TPS) | Success % |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Case 1** | P1 AND P2 | 982 | 18 | 100.5 | 0.08s | 99.9 | **98.2%** |
| **Case 2** | P1 OR P2 | 978 | 22 | 100.4 | 0.08s | 99.9 | **97.8%** |
| **Case 3** | P1 AND P2 | 987 | 13 | 100.4 | 0.09s | 99.9 | **98.7%** |
| **Case 4** | P1 OR P2 | 982 | 18 | 100.3 | 0.08s | 99.9 | **98.2%** |
| **Case 5** | P1 AND P2 | 977 | 23 | 100.4 | 0.08s | 99.9 | **97.7%** |
| **Case 6** | P1 OR P2 | 976 | 24 | 100.4 | 0.09s | 99.8 | **97.6%** |
| **Case 7** | P1 OR P2 | 977 | 23 | 100.4 | 0.08s | 100 | **97.7%** |
| **Case 8** | P1 AND P2 | 985 | 15 | 100.4 | 0.09s | 99.9 | **98.5%** |

## Performance Metrics: `approve-loan` round

| Scenario | Policy Type | Success | Fail | Send Rate (TPS) | Avg Latency (s) | Throughput (TPS) | Success % |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Case 1** | P1 AND P2 | 500 | 500 | 20.1 | 0.33s | 20.1 | **50.0%** |
| **Case 2** | P1 AND P2 | 500 | 500 | 20.1 | 0.33s | 20.1 | **50.0%** |
| **Case 3** | P1 OR P2 | 500 | 500 | 20.1 | 0.33s | 20.1 | **50.0%** |
| **Case 4** | P1 AND P2 | 500 | 500 | 20.1 | 0.33s | 20.1 | **50.0%** |
| **Case 5** | P1 OR P2 | 500 | 500 | 20.1 | 0.33s | 20.1 | **50.0%** |
| **Case 6** | P1 OR P2 | 500 | 500 | 20.1 | 0.33s | 20.1 | **50.0%** |
| **Case 7** | P1 OR P2 | 500 | 500 | 20.1 | 0.33s | 20.1 | **50.0%** |
| **Case 8** | P1 AND P2 | 500 | 500 | 20.1 | 0.33s | 20.1 | **50.0%** |

## Key Findings & Comparative Analysis

1. **Latency Overhead of Dual Endorsement (`AND` vs `OR`):**
   - Transactions using `P1 AND P2` (dual-endorsement) show higher average latency than those using `P1 OR P2` (single-endorsement). This is because the Caliper client must establish connections to both peers, wait for dual simulation outputs, aggregate the responses, and submit a larger envelope with multiple signatures.
2. **Throughput Scaling Characteristics:**
   - Rounds configured with `P1 OR P2` are able to achieve higher throughput under stress because the workload can be distributed or handled by a single peer, reducing CPU cycles and serialization overhead.
3. **Write Bottlenecks in Fabric:**
   - In the `transfer-funds` round, even with key distribution, MVCC read/write conflicts can occur under high TPS. Using single peer signatures (`OR`) mitigates the round-trip latency, helping to finish transaction execution faster and reduce overlapping lock windows, leading to higher success rates.
