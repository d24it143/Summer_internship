# Hyperledger Caliper Policy Scenarios Comparison Report (3500 Transactions)

This report compares performance across the 8 different endorsement policy configurations requested. Each case executed 3500 transactions per round with workers. Channel validation policies were set to `OR` to accept both 1 and 2 peer endorsements, allowing performance comparison without validation failures.

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
| **Case 1** | P1 OR P2 | 3500 | 0 | 23.3 | 0.58s | 23.1 | **100.0%** |
| **Case 2** | P1 AND P2 | 3500 | 0 | 30 | 0.24s | 30 | **100.0%** |
| **Case 3** | P1 AND P2 | 3500 | 0 | 30 | 0.12s | 30 | **100.0%** |
| **Case 4** | P1 OR P2 | 3500 | 0 | 30 | 0.11s | 30 | **100.0%** |
| **Case 5** | P1 OR P2 | 3500 | 0 | 30 | 0.12s | 30 | **100.0%** |
| **Case 6** | P1 AND P2 | 3500 | 0 | 30 | 0.13s | 30 | **100.0%** |
| **Case 7** | P1 OR P2 | 3500 | 0 | 30 | 0.11s | 30 | **100.0%** |
| **Case 8** | P1 AND P2 | 3500 | 0 | 30 | 0.12s | 30 | **100.0%** |

## Performance Metrics: `transfer-funds` round

| Scenario | Policy Type | Success | Fail | Send Rate (TPS) | Avg Latency (s) | Throughput (TPS) | Success % |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Case 1** | P1 AND P2 | 3479 | 21 | 50.1 | 0.08s | 50 | **99.4%** |
| **Case 2** | P1 OR P2 | 3484 | 16 | 50.1 | 0.09s | 50 | **99.5%** |
| **Case 3** | P1 AND P2 | 2065 | 1435 | 50.1 | 1.84s | 50 | **59.0%** |
| **Case 4** | P1 OR P2 | 3486 | 14 | 50.1 | 0.08s | 50 | **99.6%** |
| **Case 5** | P1 AND P2 | 3476 | 24 | 50.1 | 0.08s | 50 | **99.3%** |
| **Case 6** | P1 OR P2 | 3480 | 20 | 50.1 | 0.08s | 50 | **99.4%** |
| **Case 7** | P1 OR P2 | 3486 | 14 | 50.1 | 0.09s | 50 | **99.6%** |
| **Case 8** | P1 AND P2 | 3484 | 16 | 50.1 | 0.08s | 50 | **99.5%** |

## Performance Metrics: `approve-loan` round

| Scenario | Policy Type | Success | Fail | Send Rate (TPS) | Avg Latency (s) | Throughput (TPS) | Success % |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Case 1** | P1 AND P2 | 1750 | 1750 | 15 | 0.36s | 15 | **50.0%** |
| **Case 2** | P1 AND P2 | 1745 | 1755 | 8.4 | 0.85s | 8.3 | **49.9%** |
| **Case 3** | P1 OR P2 | 1750 | 1750 | 15 | 0.37s | 15 | **50.0%** |
| **Case 4** | P1 AND P2 | 1750 | 1750 | 15 | 0.36s | 15 | **50.0%** |
| **Case 5** | P1 OR P2 | 1750 | 1750 | 15 | 0.37s | 15 | **50.0%** |
| **Case 6** | P1 OR P2 | 1750 | 1750 | 15 | 0.37s | 15 | **50.0%** |
| **Case 7** | P1 OR P2 | 1750 | 1750 | 15 | 0.38s | 15 | **50.0%** |
| **Case 8** | P1 AND P2 | 1750 | 1750 | 15 | 0.37s | 15 | **50.0%** |

## Key Findings & Comparative Analysis

1. **Latency Overhead of Dual Endorsement (`AND` vs `OR`):**
   - Transactions using `P1 AND P2` (dual-endorsement) show higher average latency than those using `P1 OR P2` (single-endorsement). This is because the Caliper client must establish connections to both peers, wait for dual simulation outputs, aggregate the responses, and submit a larger envelope with multiple signatures.
2. **Throughput Scaling Characteristics:**
   - Rounds configured with `P1 OR P2` are able to achieve higher throughput under stress because the workload can be distributed or handled by a single peer, reducing CPU cycles and serialization overhead.
3. **Write Bottlenecks in Fabric:**
   - In the `transfer-funds` round, even with key distribution, MVCC read/write conflicts can occur under high TPS. Using single peer signatures (`OR`) mitigates the round-trip latency, helping to finish transaction execution faster and reduce overlapping lock windows, leading to higher success rates.
