'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

class OpenAccountWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.txIndex = 0;
    }

    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        this.targetPeers = (roundArguments && roundArguments.targetPeers) || [];
        this.keyPrefix = (roundArguments && roundArguments.keyPrefix) || '';
    }

    async submitTransaction() {
        this.txIndex++;
        const accountId = `${this.keyPrefix}caliper_acc_${this.workerIndex}_${this.txIndex}`;
        const owner = `${this.keyPrefix}CaliperUser_${this.workerIndex}_${this.txIndex}`;
        
        const request = {
            contractId: 'banking',
            contractFunction: 'CreateAccount',
            contractArguments: [accountId, owner, '1000.00'],
            readOnly: false
        };

        if (this.targetPeers && this.targetPeers.length > 0) {
            request.targetPeers = this.targetPeers;
        }

        await this.sutAdapter.sendRequests(request);
    }
}

function createWorkloadModule() {
    return new OpenAccountWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
