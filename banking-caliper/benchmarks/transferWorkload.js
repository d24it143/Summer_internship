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
        this.totalWorkers = totalWorkers;
    }

    async submitTransaction() {
        this.txIndex++;
        
        let contractFunction = '';
        let contractArguments = [];
        let readOnly = false;

        // Construct pool of existing accounts: default ones + seeded worker accounts
        const accountPool = ['acc1', 'acc2', 'acc3'];
        const workerTxCount = 10; // 20 warmup transactions split across workers
        for (let w = 0; w < this.totalWorkers; w++) {
            for (let t = 1; t <= workerTxCount; t++) {
                accountPool.push(`work_acc_${w}_${t}`);
            }
        }

        if (this.action === 'create') {
            contractFunction = 'CreateAccount';
            const accountId = `work_acc_${this.workerIndex}_${this.txIndex}`;
            const owner = `WorkerOwner_${this.workerIndex}_${this.txIndex}`;
            contractArguments = [accountId, owner, '1000'];
            readOnly = false;
        } else if (this.action === 'transfer') {
            contractFunction = 'TransferFunds';
            
            // Pick a random sender and receiver from the account pool
            const senderIdx = Math.floor(Math.random() * accountPool.length);
            let receiverIdx = Math.floor(Math.random() * accountPool.length);
            while (receiverIdx === senderIdx) {
                receiverIdx = Math.floor(Math.random() * accountPool.length);
            }
            
            contractArguments = [accountPool[senderIdx], accountPool[receiverIdx], '1.00'];
            readOnly = false;
        } else {
            // query
            contractFunction = 'GetAccount';
            // Query a random account from the pool
            const queryIdx = Math.floor(Math.random() * accountPool.length);
            contractArguments = [accountPool[queryIdx]];
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
