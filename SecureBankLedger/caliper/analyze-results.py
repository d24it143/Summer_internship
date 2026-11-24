#!/usr/bin/env python3
"""
SecureBank Ledger — Benchmark Results Analyzer & Comparison Matrix
Processes Caliper HTML / JSON reports from all 27 cases and outputs:
1. Console Comparison Table (TPS, Latency, Success Rate by Case & Policy)
2. CSV Export for graphing / thesis / documentation
3. Markdown Summary Report
"""

import os
import sys
import json
import glob
import re

CALIPER_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_BASE = os.path.join(CALIPER_DIR, "results")
CASES_MANIFEST = os.path.join(CALIPER_DIR, "cases", "cases-manifest.json")

def find_latest_results_dir():
    candidates = glob.glob(os.path.join(RESULTS_BASE, "all-cases-*"))
    if not candidates:
        return None
    return sorted(candidates)[-1]

def parse_caliper_log_or_report(case_dir):
    """Extract metrics from benchmark log or json report"""
    bench_log = os.path.join(case_dir, "benchmark.log")
    metrics = {
        "registration": {"tps": 0.0, "avg_lat": 0.0, "max_lat": 0.0, "succ": 0, "fail": 0},
        "query":        {"tps": 0.0, "avg_lat": 0.0, "max_lat": 0.0, "succ": 0, "fail": 0},
        "transfer":     {"tps": 0.0, "avg_lat": 0.0, "max_lat": 0.0, "succ": 0, "fail": 0},
    }
    
    if not os.path.exists(bench_log):
        return None
        
    with open(bench_log, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    # Regex patterns for Caliper console output table rows
    # Example: | REGISTRATION_CASE-01_ANY_TXN_100 | 100 | 0 | 48.2 | 0.25 | ...
    pattern = re.compile(r'\|\s*([A-Z]+)_[A-Z0-9\-]+_([A-Z]+)_TXN_(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([\d\.]+)\s*\|\s*([\d\.]+)\s*\|\s*([\d\.]+)')
    
    counts = {"registration": 0, "query": 0, "transfer": 0}
    
    for match in pattern.finditer(content):
        tx_type_raw, policy, txn_str, succ_str, fail_str, tps_str, max_lat_str, avg_lat_str = match.groups()
        tx_type = tx_type_raw.lower()
        if tx_type in metrics:
            counts[tx_type] += 1
            metrics[tx_type]["tps"] += float(tps_str)
            metrics[tx_type]["avg_lat"] += float(avg_lat_str)
            metrics[tx_type]["max_lat"] = max(metrics[tx_type]["max_lat"], float(max_lat_str))
            metrics[tx_type]["succ"] += int(succ_str)
            metrics[tx_type]["fail"] += int(fail_str)
            
    # Calculate averages across all rounds for each tx type
    for tt, count in counts.items():
        if count > 0:
            metrics[tt]["tps"] = round(metrics[tt]["tps"] / count, 2)
            metrics[tt]["avg_lat"] = round(metrics[tt]["avg_lat"] / count, 2)
            metrics[tt]["max_lat"] = round(metrics[tt]["max_lat"], 2)

    return metrics

def main():
    results_dir = sys.argv[1] if len(sys.argv) > 1 else find_latest_results_dir()
    if not results_dir or not os.path.exists(results_dir):
        print("❌ No benchmark results found to analyze.")
        print("Run benchmarks first: bash caliper/run-all-cases.sh")
        return

    print("═════════════════════════════════════════════════════════════════════════════════")
    print(f"  SecureBank Ledger — 27 Cases Benchmark Comparison Matrix")
    print(f"  Results Path: {results_dir}")
    print("═════════════════════════════════════════════════════════════════════════════════")

    with open(CASES_MANIFEST, "r") as f:
        manifest = json.load(f)

    headers = ["Case", "Group", "Reg Pol", "Xfer Pol", "Loan Pol", 
               "Reg TPS", "Reg Lat(s)", "Qry TPS", "Qry Lat(s)", "Xfer TPS", "Xfer Lat(s)"]
    row_fmt = "{:<8} {:<7} {:<9} {:<9} {:<9} {:<9} {:<11} {:<9} {:<11} {:<9} {:<11}"
    print(row_fmt.format(*headers))
    print("-" * 105)

    csv_rows = [",".join(headers)]

    for c in manifest["cases"]:
        case_id = c["caseId"]
        case_path = os.path.join(results_dir, case_id)
        metrics = parse_caliper_log_or_report(case_path)
        
        reg_tps = metrics["registration"]["tps"] if metrics else "N/A"
        reg_lat = metrics["registration"]["avg_lat"] if metrics else "N/A"
        qry_tps = metrics["query"]["tps"] if metrics else "N/A"
        qry_lat = metrics["query"]["avg_lat"] if metrics else "N/A"
        xfr_tps = metrics["transfer"]["tps"] if metrics else "N/A"
        xfr_lat = metrics["transfer"]["avg_lat"] if metrics else "N/A"

        row = [
            case_id,
            c["group"],
            c["policies"]["registration"],
            c["policies"]["transfer"],
            c["policies"]["loan"],
            str(reg_tps),
            str(reg_lat),
            str(qry_tps),
            str(qry_lat),
            str(xfr_tps),
            str(xfr_lat)
        ]
        print(row_fmt.format(*row))
        csv_rows.append(",".join(row))

    csv_out = os.path.join(results_dir, "benchmark_comparison_matrix.csv")
    with open(csv_out, "w") as f:
        f.write("\n".join(csv_rows) + "\n")
    print("-" * 105)
    print(f"\n📊 Exported complete matrix to CSV: {csv_out}")

if __name__ == "__main__":
    main()
