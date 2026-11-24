/*
 * SecureBank Ledger — transaction-cc/src/transaction.contract.ts
 * TransactionContract: deposit, withdraw, transfer, reverse
 *
 * State key: TXN::{txnId}
 * Rules:
 *   - Insufficient-balance check before debit
 *   - Frozen/closed account rejects all txns
 *   - transfer is atomic (debit+credit in same invoke)
 *   - Daily withdrawal limit enforced via config-cc
 *   - reverseTransaction only works within 24h on COMPLETED txns
 */

import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from 'fabric-contract-api';
import {
  TransactionState,
  AccountState,
  TxnType,
  TxnStatus,
  DailySummary,
} from './types';

const SECONDS_24H = 86400;

@Info({
  title: 'TransactionContract',
  description: 'Deposit, withdraw, transfer, and reverse transactions',
})
export class TransactionContract extends Contract {
  constructor() {
    super('TransactionContract');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RBAC & helpers
  // ─────────────────────────────────────────────────────────────────────────
  private getCallerCN(ctx: Context): string {
    return ctx.clientIdentity.getX509Certificate()?.subject.commonName ?? 'unknown';
  }
  private getCallerRole(ctx: Context): string {
    return ctx.clientIdentity.getAttributeValue('role') ?? '';
  }
  private getCallerCustomerId(ctx: Context): string {
    return ctx.clientIdentity.getAttributeValue('customerId') ?? '';
  }
  private assertRole(ctx: Context, ...roles: string[]): void {
    const role = this.getCallerRole(ctx);
    if (!roles.includes(role)) {
      throw new Error(`Access denied: requires [${roles.join(', ')}], got '${role}'`);
    }
  }

  private async getAccount(ctx: Context, accountId: string): Promise<AccountState> {
    const result = await ctx.stub.invokeChaincode(
      'account-cc',
      ['AccountContract:getAccount', accountId],
      ctx.stub.getChannelID(),
    );
    if (!result.payload || result.payload.length === 0) {
      throw new Error(`Account ${accountId} not found`);
    }
    return JSON.parse(result.payload.toString()) as AccountState;
  }

  private async getConfigValue(ctx: Context, key: string): Promise<string> {
    const result = await ctx.stub.invokeChaincode(
      'config-cc',
      ['ConfigContract:getConfig', key],
      ctx.stub.getChannelID(),
    );
    return result.payload.toString();
  }

  private async updateAccountBalance(
    ctx: Context,
    accountId: string,
    newBalance: number,
    action: string,
  ): Promise<void> {
    await ctx.stub.invokeChaincode(
      'account-cc',
      ['AccountContract:updateBalance', accountId, newBalance.toString(), action],
      ctx.stub.getChannelID(),
    );
  }

  private async writeAudit(
    ctx: Context,
    entityId: string,
    action: string,
    oldValue: string | null,
    newValue: string,
  ): Promise<void> {
    const auditId = `${entityId}-${ctx.stub.getTxID()}`;
    const caller = this.getCallerCN(ctx);
    await ctx.stub.invokeChaincode(
      'audit-cc',
      [
        'AuditContract:createAuditRecord',
        auditId,
        'TRANSACTION',
        entityId,
        action,
        caller,
        oldValue ?? '',
        newValue,
      ],
      ctx.stub.getChannelID(),
    );
  }

  private async saveTxn(ctx: Context, txn: TransactionState): Promise<void> {
    await ctx.stub.putState(`TXN::${txn.txnId}`, Buffer.from(JSON.stringify(txn)));
  }

  private nowISO(ctx: Context): string {
    return new Date(ctx.stub.getTxTimestamp().seconds.low * 1000).toISOString();
  }

  private async mustGetTxn(ctx: Context, txnId: string): Promise<TransactionState> {
    const bytes = await ctx.stub.getState(`TXN::${txnId}`);
    if (!bytes || bytes.length === 0) {
      throw new Error(`Transaction ${txnId} does not exist`);
    }
    return JSON.parse(bytes.toString()) as TransactionState;
  }

  private assertAccountActive(account: AccountState): void {
    if (account.status !== 'ACTIVE') {
      throw new Error(`Account ${account.accountId} is ${account.status}. Transactions not allowed.`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getDailyWithdrawnAmount — sum of DEBIT transactions today
  // ─────────────────────────────────────────────────────────────────────────
  private async getDailyWithdrawnAmount(
    ctx: Context,
    accountId: string,
    todayDate: string,
  ): Promise<number> {
    const query = {
      selector: {
        docType: 'TRANSACTION',
        fromAccount: accountId,
        txnType: { $in: ['DEBIT', 'TRANSFER'] },
        status: 'COMPLETED',
        timestamp: { $gte: todayDate + 'T00:00:00.000Z', $lte: todayDate + 'T23:59:59.999Z' },
      },
    };
    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    let total = 0;
    let result = await iterator.next();
    while (!result.done) {
      const t = JSON.parse(result.value.value.toString()) as TransactionState;
      total += t.amount;
      result = await iterator.next();
    }
    await iterator.close();
    return total;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // deposit
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async deposit(
    ctx: Context,
    accountId: string,
    txnId: string,
    amount: string,
    reference: string,
  ): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER', 'CUSTOMER');

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) throw new Error('amount must be positive');

    const account = await this.getAccount(ctx, accountId);
    this.assertAccountActive(account);

    // CUSTOMER can only deposit into own account
    const role = this.getCallerRole(ctx);
    if (role === 'CUSTOMER') {
      const myId = this.getCallerCustomerId(ctx);
      if (account.customerId !== myId) throw new Error('CUSTOMER can only deposit to own account');
    }

    const newBalance = account.balance + amt;
    const txn: TransactionState = {
      txnId,
      fromAccount: null,
      toAccount: accountId,
      amount: amt,
      currency: account.currency,
      txnType: 'CREDIT',
      status: 'COMPLETED',
      reference,
      timestamp: this.nowISO(ctx),
      docType: 'TRANSACTION',
    };

    await this.saveTxn(ctx, txn);
    await this.updateAccountBalance(ctx, accountId, newBalance, 'BALANCE_CREDIT');
    ctx.stub.setEvent('TransactionCompleted', Buffer.from(JSON.stringify({ txnId, type: 'DEPOSIT', amount: amt })));
    await this.writeAudit(ctx, txnId, 'DEPOSIT', null, JSON.stringify(txn));

    return JSON.stringify(txn);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // withdraw
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async withdraw(
    ctx: Context,
    accountId: string,
    txnId: string,
    amount: string,
    reference: string,
  ): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER', 'CUSTOMER');

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) throw new Error('amount must be positive');

    const account = await this.getAccount(ctx, accountId);
    this.assertAccountActive(account);

    // CUSTOMER can only withdraw from own account
    const role = this.getCallerRole(ctx);
    if (role === 'CUSTOMER') {
      const myId = this.getCallerCustomerId(ctx);
      if (account.customerId !== myId) throw new Error('CUSTOMER can only withdraw from own account');
    }

    // Insufficient balance check
    if (account.balance < amt) {
      throw new Error(`Insufficient balance: available ${account.balance}, requested ${amt}`);
    }

    // Daily limit check
    const today = this.nowISO(ctx).substring(0, 10);
    const limitKey = `daily_withdrawal_limit_${account.accountType}`;
    let dailyLimit = 50000; // default
    try {
      const limitStr = await this.getConfigValue(ctx, limitKey);
      dailyLimit = parseFloat(limitStr);
    } catch (_) {
      /* use default */
    }

    const alreadyWithdrawn = await this.getDailyWithdrawnAmount(ctx, accountId, today);
    if (alreadyWithdrawn + amt > dailyLimit) {
      throw new Error(
        `Daily withdrawal limit exceeded: limit=${dailyLimit}, already withdrawn=${alreadyWithdrawn}, requested=${amt}`,
      );
    }

    const newBalance = account.balance - amt;
    const txn: TransactionState = {
      txnId,
      fromAccount: accountId,
      toAccount: null,
      amount: amt,
      currency: account.currency,
      txnType: 'DEBIT',
      status: 'COMPLETED',
      reference,
      timestamp: this.nowISO(ctx),
      docType: 'TRANSACTION',
    };

    await this.saveTxn(ctx, txn);
    await this.updateAccountBalance(ctx, accountId, newBalance, 'BALANCE_DEBIT');
    ctx.stub.setEvent('TransactionCompleted', Buffer.from(JSON.stringify({ txnId, type: 'WITHDRAW', amount: amt })));
    await this.writeAudit(ctx, txnId, 'WITHDRAW', null, JSON.stringify(txn));

    return JSON.stringify(txn);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // transfer — atomic debit+credit
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async transfer(
    ctx: Context,
    fromAccountId: string,
    toAccountId: string,
    txnId: string,
    amount: string,
    reference: string,
  ): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER', 'CUSTOMER');

    if (fromAccountId === toAccountId) throw new Error('Cannot transfer to same account');

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) throw new Error('amount must be positive');

    const fromAccount = await this.getAccount(ctx, fromAccountId);
    const toAccount = await this.getAccount(ctx, toAccountId);

    this.assertAccountActive(fromAccount);
    this.assertAccountActive(toAccount);

    // CUSTOMER can only transfer from own account
    const role = this.getCallerRole(ctx);
    if (role === 'CUSTOMER') {
      const myId = this.getCallerCustomerId(ctx);
      if (fromAccount.customerId !== myId) throw new Error('CUSTOMER can only transfer from own account');
    }

    if (fromAccount.balance < amt) {
      throw new Error(`Insufficient balance: available ${fromAccount.balance}, requested ${amt}`);
    }

    // Daily limit check
    const today = this.nowISO(ctx).substring(0, 10);
    const limitKey = `daily_withdrawal_limit_${fromAccount.accountType}`;
    let dailyLimit = 50000;
    try {
      const limitStr = await this.getConfigValue(ctx, limitKey);
      dailyLimit = parseFloat(limitStr);
    } catch (_) { /* default */ }

    const alreadyWithdrawn = await this.getDailyWithdrawnAmount(ctx, fromAccountId, today);
    if (alreadyWithdrawn + amt > dailyLimit) {
      throw new Error(`Daily transfer limit exceeded: limit=${dailyLimit}, already withdrawn=${alreadyWithdrawn}, requested=${amt}`);
    }

    // Atomic update: debit + credit
    const newFromBalance = fromAccount.balance - amt;
    const newToBalance = toAccount.balance + amt;

    const txn: TransactionState = {
      txnId,
      fromAccount: fromAccountId,
      toAccount: toAccountId,
      amount: amt,
      currency: fromAccount.currency,
      txnType: 'TRANSFER',
      status: 'COMPLETED',
      reference,
      timestamp: this.nowISO(ctx),
      docType: 'TRANSACTION',
    };

    await this.saveTxn(ctx, txn);
    await this.updateAccountBalance(ctx, fromAccountId, newFromBalance, 'BALANCE_DEBIT');
    await this.updateAccountBalance(ctx, toAccountId, newToBalance, 'BALANCE_CREDIT');

    ctx.stub.setEvent('TransactionCompleted', Buffer.from(JSON.stringify({ txnId, type: 'TRANSFER', amount: amt })));
    await this.writeAudit(ctx, txnId, 'TRANSFER', null, JSON.stringify(txn));

    return JSON.stringify(txn);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // reverseTransaction — only COMPLETED, within 24h, TELLER/ADMIN
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async reverseTransaction(
    ctx: Context,
    txnId: string,
    reversalTxnId: string,
    reason: string,
  ): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER');

    const original = await this.mustGetTxn(ctx, txnId);
    if (original.status !== 'COMPLETED') {
      throw new Error(`Cannot reverse transaction with status: ${original.status}`);
    }

    // 24h window check
    const originalTs = new Date(original.timestamp).getTime();
    const now = ctx.stub.getTxTimestamp().seconds.low * 1000;
    if (now - originalTs > SECONDS_24H * 1000) {
      throw new Error('Reversal window expired: transaction is older than 24 hours');
    }

    // Mark original as REVERSED
    const oldValue = JSON.stringify(original);
    original.status = 'REVERSED';
    await this.saveTxn(ctx, original);

    // Create reversal transaction
    const reversalTxn: TransactionState = {
      txnId: reversalTxnId,
      fromAccount: original.toAccount,
      toAccount: original.fromAccount,
      amount: original.amount,
      currency: original.currency,
      txnType: original.txnType === 'CREDIT' ? 'DEBIT' : 'CREDIT',
      status: 'COMPLETED',
      reference: `REVERSAL of ${txnId}: ${reason}`,
      timestamp: this.nowISO(ctx),
      reversalOf: txnId,
      reversalReason: reason,
      docType: 'TRANSACTION',
    };

    await this.saveTxn(ctx, reversalTxn);

    // Reverse balances
    if (original.txnType === 'CREDIT' && original.toAccount) {
      const acct = await this.getAccount(ctx, original.toAccount);
      await this.updateAccountBalance(ctx, original.toAccount, acct.balance - original.amount, 'BALANCE_DEBIT');
    } else if (original.txnType === 'DEBIT' && original.fromAccount) {
      const acct = await this.getAccount(ctx, original.fromAccount);
      await this.updateAccountBalance(ctx, original.fromAccount, acct.balance + original.amount, 'BALANCE_CREDIT');
    } else if (original.txnType === 'TRANSFER') {
      const fromAcct = await this.getAccount(ctx, original.fromAccount!);
      const toAcct = await this.getAccount(ctx, original.toAccount!);
      await this.updateAccountBalance(ctx, original.fromAccount!, fromAcct.balance + original.amount, 'BALANCE_CREDIT');
      await this.updateAccountBalance(ctx, original.toAccount!, toAcct.balance - original.amount, 'BALANCE_DEBIT');
    }

    ctx.stub.setEvent('TransactionReversed', Buffer.from(JSON.stringify({ txnId, reversalTxnId, reason })));
    await this.writeAudit(ctx, txnId, 'REVERSE_TRANSACTION', oldValue, JSON.stringify(reversalTxn));

    return JSON.stringify(reversalTxn);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getTransaction
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getTransaction(ctx: Context, txnId: string): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER', 'CUSTOMER', 'AUDITOR', 'LOAN_OFFICER');
    const txn = await this.mustGetTxn(ctx, txnId);
    return JSON.stringify(txn);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getAccountTransactions — rich CouchDB query with optional date filter
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getAccountTransactions(
    ctx: Context,
    accountId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER', 'CUSTOMER', 'AUDITOR');

    // CUSTOMER can only query own account
    const role = this.getCallerRole(ctx);
    if (role === 'CUSTOMER') {
      const account = await this.getAccount(ctx, accountId);
      const myId = this.getCallerCustomerId(ctx);
      if (account.customerId !== myId) throw new Error('CUSTOMER can only query own account transactions');
    }

    const selector: Record<string, unknown> = {
      docType: 'TRANSACTION',
      $or: [{ fromAccount: accountId }, { toAccount: accountId }],
    };

    if (startDate && endDate) {
      selector.timestamp = { $gte: startDate, $lte: endDate };
    }

    const query = { selector, sort: [{ timestamp: 'desc' }] };
    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    const results: TransactionState[] = [];
    let result = await iterator.next();
    while (!result.done) {
      results.push(JSON.parse(result.value.value.toString()) as TransactionState);
      result = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify(results);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getDailyTransactionSummary — aggregate view for a given date
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getDailyTransactionSummary(
    ctx: Context,
    accountId: string,
    date: string,
  ): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER', 'CUSTOMER', 'AUDITOR');

    const query = {
      selector: {
        docType: 'TRANSACTION',
        $or: [{ fromAccount: accountId }, { toAccount: accountId }],
        timestamp: { $gte: `${date}T00:00:00.000Z`, $lte: `${date}T23:59:59.999Z` },
        status: 'COMPLETED',
      },
    };

    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    let totalDebit = 0;
    let totalCredit = 0;
    let count = 0;

    let result = await iterator.next();
    while (!result.done) {
      const t = JSON.parse(result.value.value.toString()) as TransactionState;
      if (t.fromAccount === accountId && (t.txnType === 'DEBIT' || t.txnType === 'TRANSFER')) {
        totalDebit += t.amount;
      }
      if (t.toAccount === accountId && (t.txnType === 'CREDIT' || t.txnType === 'TRANSFER')) {
        totalCredit += t.amount;
      }
      count++;
      result = await iterator.next();
    }
    await iterator.close();

    const summary: DailySummary = { accountId, date, totalDebit, totalCredit, transactionCount: count };
    return JSON.stringify(summary);
  }
}
