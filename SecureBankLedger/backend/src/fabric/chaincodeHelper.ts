/*
 * SecureBank Ledger — backend/src/fabric/chaincodeHelper.ts
 * Wrapper helpers that seamlessly toggle between real Fabric Gateway and SQLite Mock Mode
 */

import { Contract } from '@hyperledger/fabric-gateway';
import { getContract } from './gateway';
import { fabricConfig } from '../config/fabric.config';
import { logger } from '../utils/logger';
import {
  MockAccount,
  MockTransaction,
  MockLoan,
  MockAudit,
  MockConfig,
  seedMockDataIfEmpty
} from './mockChaincode';

// Automatically seed mock data on boot
seedMockDataIfEmpty().catch(err => logger.error('Mock seeding failed', { err }));

// Toggle mock mode if Fabric is not available or if explicitly enabled
const useMockMode = process.env.MOCK_FABRIC === 'true' || !process.env.FABRIC_WALLET_PATH;

if (useMockMode) {
  logger.info('🚀 RUNNING IN OFFLINE MOCK MODE. All transactions are persisted locally in SQLite.');
}

// ─────────────────────────────────────────────────────────────────────────────
// submitTransaction — for state-changing operations
// ─────────────────────────────────────────────────────────────────────────────
export async function submitTransaction(
  userId: string,
  chaincodeName: string,
  fcn: string,
  ...args: string[]
): Promise<string> {
  if (useMockMode) {
    logger.debug(`[MOCK submitTransaction] ${chaincodeName}.${fcn}`, { args, userId });
    return handleMockTransaction(userId, fcn, args);
  }

  const contract = await getContract(userId, chaincodeName);
  logger.debug(`Submit: ${chaincodeName}.${fcn}`, { args, userId });
  const resultBytes = await contract.submitTransaction(fcn, ...args);
  return Buffer.from(resultBytes).toString('utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// evaluateTransaction — for read-only queries
// ─────────────────────────────────────────────────────────────────────────────
export async function evaluateTransaction(
  userId: string,
  chaincodeName: string,
  fcn: string,
  ...args: string[]
): Promise<string> {
  if (useMockMode) {
    logger.debug(`[MOCK evaluateTransaction] ${chaincodeName}.${fcn}`, { args, userId });
    return handleMockEvaluation(userId, fcn, args);
  }

  const contract = await getContract(userId, chaincodeName);
  logger.debug(`Evaluate: ${chaincodeName}.${fcn}`, { args, userId });
  const resultBytes = await contract.evaluateTransaction(fcn, ...args);
  return Buffer.from(resultBytes).toString('utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// SQLite Mock Handlers (Replicates Smart Contract behavior in local SQLite)
// ─────────────────────────────────────────────────────────────────────────────

async function handleMockTransaction(userId: string, fcn: string, args: string[]): Promise<string> {
  const method = fcn.split(':')[1];

  switch (method) {
    case 'createAccount': {
      // args: [accountId, customerId, accountType, initialDeposit, currency]
      const [accountId, customerId, accountType, initialDepositStr, currency] = args;
      const initialDeposit = parseFloat(initialDepositStr || '0');
      
      const exists = await MockAccount.findByPk(accountId);
      if (exists) throw new Error(`Account ${accountId} already exists`);

      const account = await MockAccount.create({
        id: accountId,
        customerId,
        accountType,
        balance: initialDeposit,
        status: 'ACTIVE',
        currency: currency || 'INR',
        kycStatus: 'PENDING',
        createdBy: userId,
      });

      if (initialDeposit > 0) {
        await MockTransaction.create({
          id: `TXN-${Date.now()}`,
          accountId,
          transactionType: 'DEPOSIT',
          amount: initialDeposit,
          balanceAfter: initialDeposit,
          status: 'COMPLETED',
          reference: 'Initial Deposit',
          performedBy: userId,
        });
      }

      await MockAudit.create({
        entityType: 'ACCOUNT',
        entityId: accountId,
        action: 'CREATE',
        performedBy: userId,
        oldValue: '',
        newValue: JSON.stringify(account),
      });

      return JSON.stringify(account);
    }

    case 'updateKYCStatus': {
      const [accountId, status] = args;
      const account = await MockAccount.findByPk(accountId);
      if (!account) throw new Error(`Account ${accountId} not found`);

      const oldValue = JSON.stringify(account);
      account.kycStatus = status;
      await account.save();

      await MockAudit.create({
        entityType: 'ACCOUNT',
        entityId: accountId,
        action: 'UPDATE_KYC',
        performedBy: userId,
        oldValue,
        newValue: JSON.stringify(account),
      });

      return JSON.stringify(account);
    }

    case 'freezeAccount': {
      const [accountId, reason] = args;
      const account = await MockAccount.findByPk(accountId);
      if (!account) throw new Error(`Account ${accountId} not found`);

      const oldValue = JSON.stringify(account);
      account.status = 'FROZEN';
      await account.save();

      await MockAudit.create({
        entityType: 'ACCOUNT',
        entityId: accountId,
        action: 'FREEZE',
        performedBy: userId,
        oldValue,
        newValue: JSON.stringify({ ...account.toJSON(), freezeReason: reason }),
      });

      return JSON.stringify(account);
    }

    case 'closeAccount': {
      const [accountId] = args;
      const account = await MockAccount.findByPk(accountId);
      if (!account) throw new Error(`Account ${accountId} not found`);

      const oldValue = JSON.stringify(account);
      account.status = 'CLOSED';
      account.balance = 0;
      await account.save();

      await MockAudit.create({
        entityType: 'ACCOUNT',
        entityId: accountId,
        action: 'CLOSE',
        performedBy: userId,
        oldValue,
        newValue: JSON.stringify(account),
      });

      return JSON.stringify(account);
    }

    case 'deposit': {
      const [accountId, txnId, amountStr, reference] = args;
      const amount = parseFloat(amountStr);
      
      const account = await MockAccount.findByPk(accountId);
      if (!account) throw new Error(`Account ${accountId} not found`);
      if (account.status !== 'ACTIVE') throw new Error(`Account status is ${account.status}`);

      account.balance += amount;
      await account.save();

      const txn = await MockTransaction.create({
        id: txnId,
        accountId,
        transactionType: 'DEPOSIT',
        amount,
        balanceAfter: account.balance,
        status: 'COMPLETED',
        reference,
        performedBy: userId,
      });

      await MockAudit.create({
        entityType: 'TRANSACTION',
        entityId: txnId,
        action: 'DEPOSIT',
        performedBy: userId,
        oldValue: '',
        newValue: JSON.stringify(txn),
      });

      return JSON.stringify(txn);
    }

    case 'withdraw': {
      const [accountId, txnId, amountStr, reference] = args;
      const amount = parseFloat(amountStr);
      
      const account = await MockAccount.findByPk(accountId);
      if (!account) throw new Error(`Account ${accountId} not found`);
      if (account.status !== 'ACTIVE') throw new Error(`Account status is ${account.status}`);
      if (account.balance < amount) throw new Error('Insufficient balance');

      account.balance -= amount;
      await account.save();

      const txn = await MockTransaction.create({
        id: txnId,
        accountId,
        transactionType: 'WITHDRAW',
        amount,
        balanceAfter: account.balance,
        status: 'COMPLETED',
        reference,
        performedBy: userId,
      });

      await MockAudit.create({
        entityType: 'TRANSACTION',
        entityId: txnId,
        action: 'WITHDRAW',
        performedBy: userId,
        oldValue: '',
        newValue: JSON.stringify(txn),
      });

      return JSON.stringify(txn);
    }

    case 'transfer': {
      const [fromId, toId, txnId, amountStr, reference] = args;
      const amount = parseFloat(amountStr);

      const fromAccount = await MockAccount.findByPk(fromId);
      const toAccount = await MockAccount.findByPk(toId);

      if (!fromAccount || !toAccount) throw new Error('Source or Destination account not found');
      if (fromAccount.status !== 'ACTIVE' || toAccount.status !== 'ACTIVE') throw new Error('Accounts must be active');
      if (fromAccount.balance < amount) throw new Error('Insufficient balance');

      fromAccount.balance -= amount;
      toAccount.balance += amount;

      await fromAccount.save();
      await toAccount.save();

      const txn = await MockTransaction.create({
        id: txnId,
        accountId: fromId,
        transactionType: 'TRANSFER',
        amount,
        balanceAfter: fromAccount.balance,
        status: 'COMPLETED',
        reference,
        performedBy: userId,
        destinationAccountId: toId,
      });

      await MockAudit.create({
        entityType: 'TRANSACTION',
        entityId: txnId,
        action: 'TRANSFER',
        performedBy: userId,
        oldValue: '',
        newValue: JSON.stringify(txn),
      });

      return JSON.stringify(txn);
    }

    case 'applyLoan': {
      // args: [loanId, customerId, accountId, principal, termMonths, collateral]
      const [loanId, customerId, accountId, principalStr, termMonthsStr, collateral] = args;
      
      const loan = await MockLoan.create({
        id: loanId,
        customerId,
        accountId,
        principal: parseFloat(principalStr),
        balance: parseFloat(principalStr),
        termMonths: parseInt(termMonthsStr, 10),
        status: 'APPLIED',
        collateral,
      });

      await MockAudit.create({
        entityType: 'LOAN',
        entityId: loanId,
        action: 'APPLY',
        performedBy: userId,
        oldValue: '',
        newValue: JSON.stringify(loan),
      });

      return JSON.stringify(loan);
    }

    case 'approveLoan': {
      const [loanId, approvedBy, rateStr] = args;
      const loan = await MockLoan.findByPk(loanId);
      if (!loan) throw new Error(`Loan ${loanId} not found`);

      const rate = parseFloat(rateStr);
      const monthlyRate = (rate / 100) / 12;
      const emi = (loan.principal * monthlyRate * Math.pow(1 + monthlyRate, loan.termMonths)) /
                  (Math.pow(1 + monthlyRate, loan.termMonths) - 1);

      const oldValue = JSON.stringify(loan);
      loan.status = 'APPROVED';
      loan.interestRate = rate;
      loan.emiAmount = Math.round(emi * 100) / 100;
      loan.approvedBy = approvedBy;
      await loan.save();

      await MockAudit.create({
        entityType: 'LOAN',
        entityId: loanId,
        action: 'APPROVE',
        performedBy: userId,
        oldValue,
        newValue: JSON.stringify(loan),
      });

      return JSON.stringify(loan);
    }

    case 'disburseLoan': {
      const [loanId] = args;
      const loan = await MockLoan.findByPk(loanId);
      if (!loan) throw new Error(`Loan ${loanId} not found`);
      if (loan.status !== 'APPROVED') throw new Error('Loan must be APPROVED to disburse');

      const account = await MockAccount.findByPk(loan.accountId);
      if (!account) throw new Error('Disbursal account not found');

      const oldValue = JSON.stringify(loan);
      loan.status = 'DISBURSED';
      
      const nextDue = new Date();
      nextDue.setMonth(nextDue.getMonth() + 1);
      loan.nextDueDate = nextDue.toISOString();
      await loan.save();

      // Credit the user's account
      account.balance += loan.principal;
      await account.save();

      // Generate deposit transaction for the loan amount
      await MockTransaction.create({
        id: `TXN-LOAN-DISB-${loanId}`,
        accountId: loan.accountId,
        transactionType: 'DEPOSIT',
        amount: loan.principal,
        balanceAfter: account.balance,
        status: 'COMPLETED',
        reference: `Disbursal of Loan ${loanId}`,
        performedBy: userId,
      });

      await MockAudit.create({
        entityType: 'LOAN',
        entityId: loanId,
        action: 'DISBURSE',
        performedBy: userId,
        oldValue,
        newValue: JSON.stringify(loan),
      });

      return JSON.stringify(loan);
    }

    case 'makeRepayment': {
      const [loanId, amountStr] = args;
      const amount = parseFloat(amountStr);

      const loan = await MockLoan.findByPk(loanId);
      if (!loan) throw new Error(`Loan ${loanId} not found`);

      const oldValue = JSON.stringify(loan);
      loan.balance = Math.max(0, loan.balance - amount);
      if (loan.balance === 0) {
        loan.status = 'REPAID';
      } else {
        const nextDue = new Date();
        nextDue.setMonth(nextDue.getMonth() + 1);
        loan.nextDueDate = nextDue.toISOString();
      }
      await loan.save();

      await MockAudit.create({
        entityType: 'LOAN',
        entityId: loanId,
        action: 'REPAY',
        performedBy: userId,
        oldValue,
        newValue: JSON.stringify(loan),
      });

      return JSON.stringify(loan);
    }

    default:
      throw new Error(`Mock Transaction for method ${method} not implemented`);
  }
}

async function handleMockEvaluation(userId: string, fcn: string, args: string[]): Promise<string> {
  const method = fcn.split(':')[1];

  switch (method) {
    case 'getAccount': {
      const [accountId] = args;
      const account = await MockAccount.findByPk(accountId);
      if (!account) throw new Error(`Account ${accountId} not found`);
      return JSON.stringify(account);
    }

    case 'getAccountsByCustomer': {
      const [customerId] = args;
      const accounts = await MockAccount.findAll({ where: { customerId } });
      return JSON.stringify(accounts);
    }

    case 'getAccountTransactions': {
      const [accountId] = args;
      const txns = await MockTransaction.findAll({ where: { accountId }, order: [['createdAt', 'DESC']] });
      return JSON.stringify(txns);
    }

    case 'getTransaction': {
      const [txnId] = args;
      const txn = await MockTransaction.findByPk(txnId);
      if (!txn) throw new Error(`Transaction ${txnId} not found`);
      return JSON.stringify(txn);
    }

    case 'getLoan': {
      const [loanId] = args;
      const loan = await MockLoan.findByPk(loanId);
      if (!loan) throw new Error(`Loan ${loanId} not found`);
      return JSON.stringify(loan);
    }

    case 'getLoansByCustomer': {
      const [customerId] = args;
      const loans = await MockLoan.findAll({ where: { customerId } });
      return JSON.stringify(loans);
    }

    case 'getOverdueLoans': {
      const loans = await MockLoan.findAll({ where: { status: 'DISBURSED' } });
      return JSON.stringify(loans);
    }

    case 'getAuditTrail': {
      const [entityType, entityId] = args;
      const audits = await MockAudit.findAll({ where: { entityType, entityId }, order: [['createdAt', 'DESC']] });
      return JSON.stringify(audits);
    }

    default:
      throw new Error(`Mock Evaluation for method ${method} not implemented`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: account chaincode helpers
// ─────────────────────────────────────────────────────────────────────────────
export const AccountCC = {
  createAccount: (uid: string, ...args: string[]) =>
    submitTransaction(uid, fabricConfig.chaincodes.account, 'AccountContract:createAccount', ...args),
  getAccount: (uid: string, accountId: string) =>
    evaluateTransaction(uid, fabricConfig.chaincodes.account, 'AccountContract:getAccount', accountId),
  updateKYC: (uid: string, accountId: string, status: string) =>
    submitTransaction(uid, fabricConfig.chaincodes.account, 'AccountContract:updateKYCStatus', accountId, status),
  freezeAccount: (uid: string, accountId: string, reason: string) =>
    submitTransaction(uid, fabricConfig.chaincodes.account, 'AccountContract:freezeAccount', accountId, reason),
  closeAccount: (uid: string, accountId: string) =>
    submitTransaction(uid, fabricConfig.chaincodes.account, 'AccountContract:closeAccount', accountId),
  getAccountsByCustomer: (uid: string, customerId: string) =>
    evaluateTransaction(uid, fabricConfig.chaincodes.account, 'AccountContract:getAccountsByCustomer', customerId),
  getAccountHistory: (uid: string, accountId: string) =>
    evaluateTransaction(uid, fabricConfig.chaincodes.account, 'AccountContract:getAccountHistory', accountId),
};

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: transaction chaincode helpers
// ─────────────────────────────────────────────────────────────────────────────
export const TransactionCC = {
  deposit: (uid: string, accountId: string, txnId: string, amount: string, reference: string) =>
    submitTransaction(uid, fabricConfig.chaincodes.transaction, 'TransactionContract:deposit', accountId, txnId, amount, reference),
  withdraw: (uid: string, accountId: string, txnId: string, amount: string, reference: string) =>
    submitTransaction(uid, fabricConfig.chaincodes.transaction, 'TransactionContract:withdraw', accountId, txnId, amount, reference),
  transfer: (uid: string, from: string, to: string, txnId: string, amount: string, ref: string) =>
    submitTransaction(uid, fabricConfig.chaincodes.transaction, 'TransactionContract:transfer', from, to, txnId, amount, ref),
  reverse: (uid: string, txnId: string, reversalId: string, reason: string) =>
    submitTransaction(uid, fabricConfig.chaincodes.transaction, 'TransactionContract:reverseTransaction', txnId, reversalId, reason),
  getTransaction: (uid: string, txnId: string) =>
    evaluateTransaction(uid, fabricConfig.chaincodes.transaction, 'TransactionContract:getTransaction', txnId),
  getAccountTransactions: (uid: string, accountId: string, start?: string, end?: string) =>
    evaluateTransaction(uid, fabricConfig.chaincodes.transaction, 'TransactionContract:getAccountTransactions', accountId, start ?? '', end ?? ''),
  getDailySummary: (uid: string, accountId: string, date: string) =>
    evaluateTransaction(uid, fabricConfig.chaincodes.transaction, 'TransactionContract:getDailyTransactionSummary', accountId, date),
};

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: loan chaincode helpers
// ─────────────────────────────────────────────────────────────────────────────
export const LoanCC = {
  applyLoan: (uid: string, ...args: string[]) =>
    submitTransaction(uid, fabricConfig.chaincodes.loan, 'LoanContract:applyLoan', ...args),
  approveLoan: (uid: string, loanId: string, approvedBy: string, rate: string) =>
    submitTransaction(uid, fabricConfig.chaincodes.loan, 'LoanContract:approveLoan', loanId, approvedBy, rate),
  disburseLoan: (uid: string, loanId: string) =>
    submitTransaction(uid, fabricConfig.chaincodes.loan, 'LoanContract:disburseLoan', loanId),
  makeRepayment: (uid: string, loanId: string, amount: string) =>
    submitTransaction(uid, fabricConfig.chaincodes.loan, 'LoanContract:makeRepayment', loanId, amount),
  markDefault: (uid: string, loanId: string) =>
    submitTransaction(uid, fabricConfig.chaincodes.loan, 'LoanContract:markDefault', loanId),
  getLoan: (uid: string, loanId: string) =>
    evaluateTransaction(uid, fabricConfig.chaincodes.loan, 'LoanContract:getLoan', loanId),
  getLoansByCustomer: (uid: string, customerId: string) =>
    evaluateTransaction(uid, fabricConfig.chaincodes.loan, 'LoanContract:getLoansByCustomer', customerId),
  getOverdueLoans: (uid: string) =>
    evaluateTransaction(uid, fabricConfig.chaincodes.loan, 'LoanContract:getOverdueLoans'),
};

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: audit chaincode helpers
// ─────────────────────────────────────────────────────────────────────────────
export const AuditCC = {
  getAuditTrail: (uid: string, entityType: string, entityId: string) =>
    evaluateTransaction(uid, fabricConfig.chaincodes.audit, 'AuditContract:getAuditTrail', entityType, entityId),
  getAuditsByUser: (uid: string, userId: string, start: string, end: string) =>
    evaluateTransaction(uid, fabricConfig.chaincodes.audit, 'AuditContract:getAuditsByUser', userId, start, end),
  getAuditsByDateRange: (uid: string, start: string, end: string) =>
    evaluateTransaction(uid, fabricConfig.chaincodes.audit, 'AuditContract:getAuditsByDateRange', start, end),
};
