'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

class ApproveLoanWorkload extends WorkloadModuleBase {
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
        const loanId = `${this.keyPrefix}loan_${this.workerIndex}_${this.txIndex}`;
        const applicantId = `${this.keyPrefix}caliper_acc_${this.workerIndex}_1`; // Use first created account as applicant
        
        let contractFunction = 'CreateLoanApplication';
        let contractArguments = [loanId, applicantId, '5000.00'];

        // To simulate different steps in the round (e.g. creating vs. approving)
        // Alternating between Create and Approve based on index
        if (this.txIndex % 2 === 0) {
            contractFunction = 'ApproveLoan';
            const targetLoanIdx = Math.floor(this.txIndex / 2);
            const targetLoanId = `${this.keyPrefix}loan_${this.workerIndex}_${targetLoanIdx}`;
            contractArguments = [targetLoanId];
        }

        const request = {
            contractId: 'banking',
            contractFunction,
            contractArguments,
            readOnly: false
        };

        if (this.targetPeers && this.targetPeers.length > 0) {
            request.targetPeers = this.targetPeers;
        }

        await this.sutAdapter.sendRequests(request);
    }
}

function createWorkloadModule() {
    return new ApproveLoanWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
