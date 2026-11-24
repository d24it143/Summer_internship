/*
 * SecureBank Ledger — account-cc/src/account.contract.ts
 * AccountContract: manages bank account lifecycle
 *
 * State key: ACCOUNT::{accountId}
 * CouchDB: supports getAccountsByCustomer rich query
 */

import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from 'fabric-contract-api';
import {
  AccountState,
  AccountType,
  AccountStatus,
  KYCStatus,
  HistoryRecord,
} from './types';

@Info({
  title: 'AccountContract',
  description: 'Bank account lifecycle management for SecureBank Ledger',
})
export class AccountContract extends Contract {
  constructor() {
    super('AccountContract');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RBAC helpers
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

  private assertRole(ctx: Context, ...allowedRoles: string[]): void {
    const role = this.getCallerRole(ctx);
    if (!allowedRoles.includes(role)) {
      throw new Error(`Access denied: requires one of [${allowedRoles.join(', ')}], got '${role}'`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal: write audit record via cross-chaincode call
  // ─────────────────────────────────────────────────────────────────────────
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
        'ACCOUNT',
        entityId,
        action,
        caller,
        oldValue ?? '',
        newValue,
      ],
      ctx.stub.getChannelID(),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // createAccount
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async createAccount(
    ctx: Context,
    accountId: string,
    customerId: string,
    accountType: string,
    initialDeposit: string,
    currency: string,
  ): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER');

    // Validate inputs
    if (!accountId || !customerId || !accountType || !currency) {
      throw new Error('accountId, customerId, accountType, currency are required');
    }
    const validTypes: AccountType[] = ['SAVINGS', 'CURRENT', 'FIXED'];
    if (!validTypes.includes(accountType as AccountType)) {
      throw new Error(`Invalid accountType. Must be one of: ${validTypes.join(', ')}`);
    }
    const deposit = parseFloat(initialDeposit);
    if (isNaN(deposit) || deposit < 0) {
      throw new Error('initialDeposit must be a non-negative number');
    }

    // Check duplicate
    const existing = await ctx.stub.getState(`ACCOUNT::${accountId}`);
    if (existing && existing.length > 0) {
      throw new Error(`Account ${accountId} already exists`);
    }

    const now = new Date(
      ctx.stub.getTxTimestamp().seconds.low * 1000,
    ).toISOString();

    const account: AccountState = {
      accountId,
      customerId,
      accountType: accountType as AccountType,
      balance: deposit,
      currency: currency.toUpperCase(),
      status: 'ACTIVE',
      kycStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
      version: 1,
      docType: 'ACCOUNT',
    };

    await ctx.stub.putState(`ACCOUNT::${accountId}`, Buffer.from(JSON.stringify(account)));

    // Emit event
    ctx.stub.setEvent('AccountCreated', Buffer.from(JSON.stringify({ accountId, customerId, accountType })));

    // Write audit
    await this.writeAudit(ctx, accountId, 'CREATE_ACCOUNT', null, JSON.stringify(account));

    return JSON.stringify(account);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getAccount
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getAccount(ctx: Context, accountId: string): Promise<string> {
    const account = await this.mustGetAccount(ctx, accountId);

    // CUSTOMER can only see their own accounts
    const role = this.getCallerRole(ctx);
    if (role === 'CUSTOMER') {
      const myCustomerId = this.getCallerCustomerId(ctx);
      if (account.customerId !== myCustomerId) {
        throw new Error('Access denied: you can only view your own accounts');
      }
    }

    return JSON.stringify(account);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // updateKYCStatus — TELLER or ADMIN
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async updateKYCStatus(
    ctx: Context,
    accountId: string,
    kycStatus: string,
  ): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER');

    const validStatuses: KYCStatus[] = ['PENDING', 'VERIFIED', 'REJECTED'];
    if (!validStatuses.includes(kycStatus as KYCStatus)) {
      throw new Error(`Invalid kycStatus. Must be one of: ${validStatuses.join(', ')}`);
    }

    const account = await this.mustGetAccount(ctx, accountId);
    const oldValue = JSON.stringify(account);
    account.kycStatus = kycStatus as KYCStatus;
    account.updatedAt = new Date(ctx.stub.getTxTimestamp().seconds.low * 1000).toISOString();
    account.version++;

    await ctx.stub.putState(`ACCOUNT::${accountId}`, Buffer.from(JSON.stringify(account)));
    await this.writeAudit(ctx, accountId, 'UPDATE_KYC', oldValue, JSON.stringify(account));

    return JSON.stringify(account);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // freezeAccount — ADMIN only
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async freezeAccount(
    ctx: Context,
    accountId: string,
    reason: string,
  ): Promise<string> {
    this.assertRole(ctx, 'ADMIN');

    const account = await this.mustGetAccount(ctx, accountId);
    if (account.status === 'CLOSED') {
      throw new Error('Cannot freeze a closed account');
    }
    if (account.status === 'FROZEN') {
      throw new Error('Account is already frozen');
    }

    const oldValue = JSON.stringify(account);
    account.status = 'FROZEN';
    account.updatedAt = new Date(ctx.stub.getTxTimestamp().seconds.low * 1000).toISOString();
    account.version++;

    await ctx.stub.putState(`ACCOUNT::${accountId}`, Buffer.from(JSON.stringify(account)));
    ctx.stub.setEvent('AccountFrozen', Buffer.from(JSON.stringify({ accountId, reason })));
    await this.writeAudit(ctx, accountId, 'FREEZE_ACCOUNT', oldValue, JSON.stringify({ ...account, reason }));

    return JSON.stringify(account);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // closeAccount — ADMIN only
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async closeAccount(ctx: Context, accountId: string): Promise<string> {
    this.assertRole(ctx, 'ADMIN');

    const account = await this.mustGetAccount(ctx, accountId);
    if (account.status === 'CLOSED') {
      throw new Error('Account is already closed');
    }
    if (account.balance > 0) {
      throw new Error(`Cannot close account with positive balance: ${account.balance}`);
    }

    const oldValue = JSON.stringify(account);
    account.status = 'CLOSED';
    account.updatedAt = new Date(ctx.stub.getTxTimestamp().seconds.low * 1000).toISOString();
    account.version++;

    await ctx.stub.putState(`ACCOUNT::${accountId}`, Buffer.from(JSON.stringify(account)));
    ctx.stub.setEvent('AccountClosed', Buffer.from(JSON.stringify({ accountId })));
    await this.writeAudit(ctx, accountId, 'CLOSE_ACCOUNT', oldValue, JSON.stringify(account));

    return JSON.stringify(account);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getAccountsByCustomer — CouchDB rich query
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getAccountsByCustomer(ctx: Context, customerId: string): Promise<string> {
    const role = this.getCallerRole(ctx);
    // CUSTOMER can only query their own accounts
    if (role === 'CUSTOMER') {
      const myCustomerId = this.getCallerCustomerId(ctx);
      if (customerId !== myCustomerId) {
        throw new Error('Access denied: CUSTOMER can only query own accounts');
      }
    } else {
      this.assertRole(ctx, 'ADMIN', 'TELLER', 'AUDITOR', 'LOAN_OFFICER', 'CUSTOMER');
    }

    const query = {
      selector: {
        docType: 'ACCOUNT',
        customerId,
      },
    };

    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    const accounts: AccountState[] = [];

    let result = await iterator.next();
    while (!result.done) {
      accounts.push(JSON.parse(result.value.value.toString()) as AccountState);
      result = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify(accounts);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getAccountHistory — Fabric GetHistoryForKey
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getAccountHistory(ctx: Context, accountId: string): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER', 'AUDITOR');

    const iterator = await ctx.stub.getHistoryForKey(`ACCOUNT::${accountId}`);
    const history: HistoryRecord[] = [];

    let result = await iterator.next();
    while (!result.done) {
      const item = result.value;
      const ts = new Date(item.timestamp!.seconds.low * 1000).toISOString();
      history.push({
        txId: item.txId,
        timestamp: ts,
        isDelete: item.isDelete,
        value: item.isDelete ? null : JSON.parse(item.value.toString()) as AccountState,
      });
      result = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify(history);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal: updateBalance — called by transaction-cc
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async updateBalance(
    ctx: Context,
    accountId: string,
    newBalance: string,
    action: string,
  ): Promise<string> {
    // Only internal chaincode calls from transaction-cc / loan-cc
    this.assertRole(ctx, 'ADMIN', 'TELLER', 'CUSTOMER', 'LOAN_OFFICER');

    const balance = parseFloat(newBalance);
    if (isNaN(balance) || balance < 0) {
      throw new Error('Invalid balance value');
    }

    const account = await this.mustGetAccount(ctx, accountId);
    if (account.status !== 'ACTIVE') {
      throw new Error(`Account ${accountId} is ${account.status}. Transactions not allowed.`);
    }

    const oldValue = JSON.stringify(account);
    account.balance = balance;
    account.updatedAt = new Date(ctx.stub.getTxTimestamp().seconds.low * 1000).toISOString();
    account.version++;

    await ctx.stub.putState(`ACCOUNT::${accountId}`, Buffer.from(JSON.stringify(account)));
    await this.writeAudit(ctx, accountId, action, oldValue, JSON.stringify(account));

    return JSON.stringify(account);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helper: get account or throw
  // ─────────────────────────────────────────────────────────────────────────
  private async mustGetAccount(ctx: Context, accountId: string): Promise<AccountState> {
    const bytes = await ctx.stub.getState(`ACCOUNT::${accountId}`);
    if (!bytes || bytes.length === 0) {
      throw new Error(`Account ${accountId} does not exist`);
    }
    return JSON.parse(bytes.toString()) as AccountState;
  }
}
