'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

class BankingWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.txIndex = 0;
    }

    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        this.action = this.roundArguments.action;
    }

    async submitTransaction() {
        this.txIndex++;
        
        let contractFunction = '';
        let contractArguments = [];
        let readOnly = false;

        if (this.action === 'create') {
            contractFunction = 'CreateAccount';
            const accountId = `work_acc_${this.workerIndex}_${this.txIndex}`;
            const owner = `WorkerOwner_${this.workerIndex}_${this.txIndex}`;
            contractArguments = [accountId, owner, '1000'];
            readOnly = false;
        } else if (this.action === 'transfer') {
            contractFunction = 'TransferFunds';
            // Transfer from acc1 to acc2 (seeded accounts)
            contractArguments = ['acc1', 'acc2', '1.00'];
            readOnly = false;
        } else {
            // query
            contractFunction = 'GetAccount';
            contractArguments = ['acc1'];
            readOnly = true;
        }

        const request = {
            contractId: 'banking',
            contractFunction,
            contractArguments,
            readOnly
        };

        await this.sutAdapter.sendRequests(request);
    }
}

function createWorkloadModule() {
    return new BankingWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
