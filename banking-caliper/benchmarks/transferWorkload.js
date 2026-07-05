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
        this.totalAccounts = this.roundArguments.totalAccounts || 1000;
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
            
            const totalCreatedPerWorker = Math.floor(this.totalAccounts / this.totalWorkers);
            const randomSenderWorker = Math.floor(Math.random() * this.totalWorkers);
            const randomSenderIdx = Math.floor(Math.random() * totalCreatedPerWorker) + 1;
            
            let randomReceiverWorker = Math.floor(Math.random() * this.totalWorkers);
            let randomReceiverIdx = Math.floor(Math.random() * totalCreatedPerWorker) + 1;
            
            // Ensure sender and receiver are different
            if (randomSenderWorker === randomReceiverWorker && randomSenderIdx === randomReceiverIdx) {
                randomReceiverIdx = (randomReceiverIdx % totalCreatedPerWorker) + 1;
            }
            
            const senderId = `work_acc_${randomSenderWorker}_${randomSenderIdx}`;
            const receiverId = `work_acc_${randomReceiverWorker}_${randomReceiverIdx}`;
            
            contractArguments = [senderId, receiverId, '1.00'];
            readOnly = false;
        } else {
            // query
            contractFunction = 'GetAccount';
            const totalCreatedPerWorker = Math.floor(this.totalAccounts / this.totalWorkers);
            const randomWorker = Math.floor(Math.random() * this.totalWorkers);
            const randomIdx = Math.floor(Math.random() * totalCreatedPerWorker) + 1;
            const accountId = `work_acc_${randomWorker}_${randomIdx}`;
            
            contractArguments = [accountId];
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
