'use strict';

/**
 * SecureBank Ledger — Caliper Workload Script
 * Transaction Type: QUERY (getAccount / getAccountsByCustomer)
 *
 * Uses evaluate (read-only) transactions.
 * Each org queries its own accounts — cross-org query isolation enforced.
 *
 * Org1 → queries BankOrg accounts
 * Org2 → queries InsuranceOrg accounts
 * Org3 → queries AuditOrg accounts
 */

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

const ORGS = ['Org1', 'Org2', 'Org3'];

// Pre-seeded account IDs that must exist before the query round.
// These are created during the Registration round (or seed step).
// Format: ACC-{Org}-0 .. ACC-{Org}-{maxSeedAccounts-1}
const MAX_SEED_ACCOUNTS = 500;

class QueryWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
    this.chaincodeID = 'account-cc';
    this.contractID = 'AccountContract';
  }

  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
    this.workerIndex = workerIndex;
    this.totalWorkers = totalWorkers;
    this.roundArgs = roundArguments;
  }

  async submitTransaction() {
    const globalTxIdx = this.workerIndex * 1000000 + this.txIndex++;
    const orgIdx = globalTxIdx % 3;
    const orgName = ORGS[orgIdx];

    // Alternate between getAccount (by ID) and getAccountsByCustomer
    const useCustomerQuery = globalTxIdx % 2 === 0;

    let request;

    if (useCustomerQuery) {
      // Rich query: getAccountsByCustomer (CouchDB)
      const customerId = `CUST-${orgName}-${globalTxIdx % MAX_SEED_ACCOUNTS}`;
      request = {
        contractId: this.chaincodeID,
        contractFunction: `${this.contractID}:getAccountsByCustomer`,
        contractArguments: [customerId],
        timeout: 30,
        readOnly: true,
      };
    } else {
      // Point query: getAccount
      const accountId = `ACC-${orgName}-seed-${globalTxIdx % MAX_SEED_ACCOUNTS}`;
      request = {
        contractId: this.chaincodeID,
        contractFunction: `${this.contractID}:getAccount`,
        contractArguments: [accountId],
        timeout: 30,
        readOnly: true,
      };
    }

    await this.sutAdapter.sendRequests(request);
  }

  async cleanupWorkloadModule() {}
}

function createWorkloadModule() {
  return new QueryWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
