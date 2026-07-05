'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

class TransferFundsWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.txIndex = 0;
    }

    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        this.totalAccounts = (roundArguments && roundArguments.totalAccounts) || 1000;
    }

    async submitTransaction() {
        this.txIndex++;
        
        // Distribute accounts across workers
        const totalCreatedPerWorker = Math.floor(this.totalAccounts / this.totalWorkers);
        
        // Randomly select sender from any worker's pool
        const randomSenderWorker = Math.floor(Math.random() * this.totalWorkers);
        const randomSenderIdx = Math.floor(Math.random() * totalCreatedPerWorker) + 1;
        
        // Randomly select receiver from any worker's pool
        const randomReceiverWorker = Math.floor(Math.random() * this.totalWorkers);
        let randomReceiverIdx = Math.floor(Math.random() * totalCreatedPerWorker) + 1;
        
        // Ensure sender and receiver are different
        if (randomSenderWorker === randomReceiverWorker && randomSenderIdx === randomReceiverIdx) {
            randomReceiverIdx = (randomReceiverIdx % totalCreatedPerWorker) + 1;
        }
        
        const senderId = `caliper_acc_${randomSenderWorker}_${randomSenderIdx}`;
        const receiverId = `caliper_acc_${randomReceiverWorker}_${randomReceiverIdx}`;

        const request = {
            contractId: 'banking',
            contractFunction: 'TransferFunds',
            contractArguments: [senderId, receiverId, '1.00'],
            readOnly: false
        };

        await this.sutAdapter.sendRequests(request);
    }
}

function createWorkloadModule() {
    return new TransferFundsWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
