'use strict';

/**
 * SecureBank Ledger — Caliper Workload Script
 * Transaction Type: REGISTRATION (createAccount)
 *
 * Each worker registers unique accounts distributed across Org1, Org2, Org3.
 * Org assignment is round-robin: txIdx % 3 → Org1 / Org2 / Org3
 *
 * Measured metrics: TPS, avg latency, max latency, success rate
 */

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

const ORGS = ['Org1', 'Org2', 'Org3'];
const ACCOUNT_TYPES = ['SAVINGS', 'CURRENT', 'FIXED'];
const CURRENCIES = ['INR', 'USD', 'EUR'];

class RegistrationWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
    this.chaincodeID = 'account-cc';
    this.contractID = 'AccountContract';
  }

  /**
   * Called once per worker before the round starts.
   */
  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
    this.workerIndex = workerIndex;
    this.totalWorkers = totalWorkers;
    this.roundIndex = roundIndex;
    this.roundArgs = roundArguments;
  }

  /**
   * Called for every single transaction submission.
   */
  async submitTransaction() {
    const globalTxIdx = this.workerIndex * 1000000 + this.txIndex++;
    const orgIdx = globalTxIdx % 3;           // 0=Org1, 1=Org2, 2=Org3
    const orgName = ORGS[orgIdx];

    const accountId  = `ACC-${orgName}-${Date.now()}-${globalTxIdx}`;
    const customerId = `CUST-${orgName}-${globalTxIdx}`;
    const accountType = ACCOUNT_TYPES[globalTxIdx % ACCOUNT_TYPES.length];
    const initialDeposit = String(1000 + (globalTxIdx % 50000));     // ₹1,000 – ₹51,000
    const currency = CURRENCIES[orgIdx];

    const request = {
      contractId: this.chaincodeID,
      contractFunction: `${this.contractID}:createAccount`,
      contractArguments: [accountId, customerId, accountType, initialDeposit, currency],
      timeout: 60,
      readOnly: false,
    };

    await this.sutAdapter.sendRequests(request);
  }

  async cleanupWorkloadModule() {
    // No cleanup needed
  }
}

function createWorkloadModule() {
  return new RegistrationWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
