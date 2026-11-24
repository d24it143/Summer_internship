'use strict';

/**
 * SecureBank Ledger — Caliper Workload Script
 * Transaction Type: TRANSFER (cross-org fund transfer)
 *
 * Flow (cross-organization):
 *   Org1 → Org2  (BankOrg sends to InsuranceOrg)
 *   Org2 → Org3  (InsuranceOrg sends to AuditOrg)
 *   Org3 → Org1  (AuditOrg sends back to BankOrg)
 *
 * Uses submitTransaction (state-changing).
 * Each transfer has a unique txnId to avoid MVCC conflicts.
 */

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

const TRANSFER_PAIRS = [
  { fromOrg: 'Org1', toOrg: 'Org2' },   // Org1 → Org2
  { fromOrg: 'Org2', toOrg: 'Org3' },   // Org2 → Org3
  { fromOrg: 'Org3', toOrg: 'Org1' },   // Org3 → Org1
];

const MAX_SEED_ACCOUNTS = 500;
const BASE_TRANSFER_AMOUNT = 100; // base in smallest currency unit

class TransferWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
    this.chaincodeID = 'transaction-cc';
    this.contractID = 'TransactionContract';
  }

  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
    this.workerIndex = workerIndex;
    this.totalWorkers = totalWorkers;
    this.roundArgs = roundArguments;
  }

  async submitTransaction() {
    const globalTxIdx = this.workerIndex * 1000000 + this.txIndex++;
    const pair = TRANSFER_PAIRS[globalTxIdx % TRANSFER_PAIRS.length];

    const fromOrg = pair.fromOrg;
    const toOrg   = pair.toOrg;

    // Pick source/destination account from seeded pool
    const fromAccountId = `ACC-${fromOrg}-seed-${globalTxIdx % MAX_SEED_ACCOUNTS}`;
    const toAccountId   = `ACC-${toOrg}-seed-${globalTxIdx % MAX_SEED_ACCOUNTS}`;

    // Unique transaction ID: timestamp + worker + index
    const txnId    = `TXN-${Date.now()}-W${this.workerIndex}-${globalTxIdx}`;
    const amount   = String(BASE_TRANSFER_AMOUNT + (globalTxIdx % 900)); // ₹100 – ₹999
    const reference = `Cross-Org Transfer ${fromOrg}→${toOrg} Round:${this.roundArgs?.roundLabel ?? 'N/A'}`;

    const request = {
      contractId: this.chaincodeID,
      contractFunction: `${this.contractID}:transfer`,
      contractArguments: [fromAccountId, toAccountId, txnId, amount, reference],
      timeout: 60,
      readOnly: false,
    };

    await this.sutAdapter.sendRequests(request);
  }

  async cleanupWorkloadModule() {}
}

function createWorkloadModule() {
  return new TransferWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
