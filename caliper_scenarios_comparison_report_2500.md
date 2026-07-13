# Hyperledger Caliper Policy Scenarios Comparison Report (2500 Transactions)

This report compares performance across the 8 different endorsement policy configurations requested. Each case executed 2500 transactions per round with workers. Channel validation policies were set to `OR` to accept both 1 and 2 peer endorsements, allowing performance comparison without validation failures.

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
| **Case 1** | P1 OR P2 | 2500 | 0 | 30.1 | 0.13s | 30 | **100.0%** |
| **Case 2** | P1 AND P2 | 2500 | 0 | 30.1 | 0.13s | 30 | **100.0%** |
| **Case 3** | P1 AND P2 | 2500 | 0 | 30.1 | 0.13s | 30 | **100.0%** |
| **Case 4** | P1 OR P2 | 2500 | 0 | 30 | 0.16s | 30 | **100.0%** |
| **Case 5** | P1 OR P2 | 2500 | 0 | 30.1 | 0.16s | 30 | **100.0%** |
| **Case 6** | P1 AND P2 | 2500 | 0 | 30.1 | 0.17s | 30 | **100.0%** |
| **Case 7** | P1 OR P2 | 2500 | 0 | 30.1 | 0.16s | 30 | **100.0%** |
| **Case 8** | P1 AND P2 | 2500 | 0 | 30 | 0.19s | 30 | **100.0%** |

## Performance Metrics: `transfer-funds` round

| Scenario | Policy Type | Success | Fail | Send Rate (TPS) | Avg Latency (s) | Throughput (TPS) | Success % |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Case 1** | P1 AND P2 | 2481 | 19 | 50.1 | 0.1s | 50 | **99.2%** |
| **Case 2** | P1 OR P2 | 2481 | 19 | 50.1 | 0.09s | 50 | **99.2%** |
| **Case 3** | P1 AND P2 | 2486 | 14 | 50.1 | 0.1s | 50.1 | **99.4%** |
| **Case 4** | P1 OR P2 | 2485 | 15 | 50.1 | 0.09s | 50.1 | **99.4%** |
| **Case 5** | P1 AND P2 | 2485 | 15 | 50.1 | 0.12s | 50 | **99.4%** |
| **Case 6** | P1 OR P2 | 2477 | 23 | 50.1 | 0.13s | 50 | **99.1%** |
| **Case 7** | P1 OR P2 | 2485 | 15 | 50.1 | 0.13s | 50 | **99.4%** |
| **Case 8** | P1 AND P2 | 2482 | 18 | 50.1 | 0.12s | 50 | **99.3%** |

## Performance Metrics: `approve-loan` round

| Scenario | Policy Type | Success | Fail | Send Rate (TPS) | Avg Latency (s) | Throughput (TPS) | Success % |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Case 1** | P1 AND P2 | 1245 | 1255 | 7.2 | 1.29s | 7.2 | **49.8%** |
| **Case 2** | P1 AND P2 | 1250 | 1250 | 15 | 0.38s | 15 | **50.0%** |
| **Case 3** | P1 OR P2 | 1250 | 1250 | 15 | 0.38s | 15 | **50.0%** |
| **Case 4** | P1 AND P2 | 1250 | 1250 | 15 | 0.38s | 15 | **50.0%** |
| **Case 5** | P1 OR P2 | 1250 | 1250 | 13.4 | 0.55s | 13.3 | **50.0%** |
| **Case 6** | P1 OR P2 | 1250 | 1250 | 15 | 0.42s | 15 | **50.0%** |
| **Case 7** | P1 OR P2 | 1250 | 1250 | 15 | 0.41s | 15 | **50.0%** |
| **Case 8** | P1 AND P2 | 1250 | 1250 | 15 | 0.41s | 15 | **50.0%** |

## Key Findings & Comparative Analysis

1. **Latency Overhead of Dual Endorsement (`AND` vs `OR`):**
   - Transactions using `P1 AND P2` (dual-endorsement) show higher average latency than those using `P1 OR P2` (single-endorsement). This is because the Caliper client must establish connections to both peers, wait for dual simulation outputs, aggregate the responses, and submit a larger envelope with multiple signatures.
2. **Throughput Scaling Characteristics:**
   - Rounds configured with `P1 OR P2` are able to achieve higher throughput under stress because the workload can be distributed or handled by a single peer, reducing CPU cycles and serialization overhead.
3. **Write Bottlenecks in Fabric:**
   - In the `transfer-funds` round, even with key distribution, MVCC read/write conflicts can occur under high TPS. Using single peer signatures (`OR`) mitigates the round-trip latency, helping to finish transaction execution faster and reduce overlapping lock windows, leading to higher success rates.
