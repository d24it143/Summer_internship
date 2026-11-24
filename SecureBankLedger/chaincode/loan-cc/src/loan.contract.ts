/*
 * SecureBank Ledger — loan-cc/src/loan.contract.ts
 * LoanContract: apply, approve, disburse, repay, default detection
 *
 * State key: LOAN::{loanId}
 * EMI formula: EMI = P * r * (1+r)^n / ((1+r)^n - 1)
 *   where r = monthly rate = interestRate/(12*100), n = termMonths
 */

import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from 'fabric-contract-api';
import { LoanState, LoanStatus, RepaymentRecord } from './types';

@Info({
  title: 'LoanContract',
  description: 'Loan lifecycle management for SecureBank Ledger',
})
export class LoanContract extends Contract {
  constructor() {
    super('LoanContract');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RBAC
  // ─────────────────────────────────────────────────────────────────────────
  private getCallerCN(ctx: Context): string {
    return ctx.clientIdentity.getX509Certificate()?.subject.commonName ?? 'unknown';
  }
  private getCallerRole(ctx: Context): string {
    return ctx.clientIdentity.getAttributeValue('role') ?? '';
  }
  private assertRole(ctx: Context, ...roles: string[]): void {
    const role = this.getCallerRole(ctx);
    if (!roles.includes(role)) {
      throw new Error(`Access denied: requires [${roles.join(', ')}], got '${role}'`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EMI calculator
  // ─────────────────────────────────────────────────────────────────────────
  private calculateEMI(principal: number, annualRate: number, termMonths: number): number {
    const r = annualRate / (12 * 100);
    if (r === 0) return principal / termMonths;
    const emi = (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
    return Math.round(emi * 100) / 100;
  }

  private addMonths(isoDate: string, months: number): string {
    const d = new Date(isoDate);
    d.setMonth(d.getMonth() + months);
    return d.toISOString();
  }

  private nowISO(ctx: Context): string {
    return new Date(ctx.stub.getTxTimestamp().seconds.low * 1000).toISOString();
  }

  private async mustGetLoan(ctx: Context, loanId: string): Promise<LoanState> {
    const bytes = await ctx.stub.getState(`LOAN::${loanId}`);
    if (!bytes || bytes.length === 0) {
      throw new Error(`Loan ${loanId} does not exist`);
    }
    return JSON.parse(bytes.toString()) as LoanState;
  }

  private async writeAudit(
    ctx: Context,
    entityId: string,
    action: string,
    oldValue: string | null,
    newValue: string,
  ): Promise<void> {
    const auditId = `${entityId}-${ctx.stub.getTxID()}`;
    await ctx.stub.invokeChaincode(
      'audit-cc',
      [
        'AuditContract:createAuditRecord',
        auditId,
        'LOAN',
        entityId,
        action,
        this.getCallerCN(ctx),
        oldValue ?? '',
        newValue,
      ],
      ctx.stub.getChannelID(),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // applyLoan — CUSTOMER or TELLER
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async applyLoan(
    ctx: Context,
    loanId: string,
    customerId: string,
    accountId: string,
    principal: string,
    termMonths: string,
    collateral: string,
  ): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER', 'CUSTOMER');

    const principalAmt = parseFloat(principal);
    const term = parseInt(termMonths, 10);
    if (isNaN(principalAmt) || principalAmt <= 0) throw new Error('Invalid principal amount');
    if (isNaN(term) || term <= 0) throw new Error('Invalid term months');

    // Check max principal from config
    const maxPrincipalResult = await ctx.stub.invokeChaincode(
      'config-cc',
      ['ConfigContract:getConfig', 'loan_max_principal'],
      ctx.stub.getChannelID(),
    );
    const maxPrincipal = parseFloat(maxPrincipalResult.payload.toString());
    if (principalAmt > maxPrincipal) {
      throw new Error(`Loan principal ${principalAmt} exceeds max allowed: ${maxPrincipal}`);
    }

    // Check no duplicate
    const existing = await ctx.stub.getState(`LOAN::${loanId}`);
    if (existing && existing.length > 0) throw new Error(`Loan ${loanId} already exists`);

    const now = this.nowISO(ctx);
    const loan: LoanState = {
      loanId,
      customerId,
      accountId,
      principal: principalAmt,
      interestRate: 0,  // set at approval
      termMonths: term,
      emiAmount: 0,     // calculated at approval
      disbursedAt: null,
      nextDueDate: null,
      paidInstallments: 0,
      outstandingBalance: principalAmt,
      status: 'APPLIED',
      collateral: collateral || null,
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
      docType: 'LOAN',
    };

    await ctx.stub.putState(`LOAN::${loanId}`, Buffer.from(JSON.stringify(loan)));
    ctx.stub.setEvent('LoanApplied', Buffer.from(JSON.stringify({ loanId, customerId, principal: principalAmt })));
    await this.writeAudit(ctx, loanId, 'APPLY_LOAN', null, JSON.stringify(loan));

    return JSON.stringify(loan);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // approveLoan — LOAN_OFFICER only
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async approveLoan(
    ctx: Context,
    loanId: string,
    approvedBy: string,
    interestRate: string,
  ): Promise<string> {
    this.assertRole(ctx, 'LOAN_OFFICER', 'ADMIN');

    const rate = parseFloat(interestRate);
    if (isNaN(rate) || rate < 0 || rate > 100) throw new Error('Invalid interest rate');

    const loan = await this.mustGetLoan(ctx, loanId);
    if (loan.status !== 'APPLIED') {
      throw new Error(`Cannot approve loan with status: ${loan.status}`);
    }

    const oldValue = JSON.stringify(loan);
    loan.status = 'APPROVED';
    loan.approvedBy = approvedBy;
    loan.interestRate = rate;
    loan.emiAmount = this.calculateEMI(loan.principal, rate, loan.termMonths);
    loan.updatedAt = this.nowISO(ctx);

    await ctx.stub.putState(`LOAN::${loanId}`, Buffer.from(JSON.stringify(loan)));
    ctx.stub.setEvent('LoanApproved', Buffer.from(JSON.stringify({ loanId, approvedBy, interestRate: rate })));
    await this.writeAudit(ctx, loanId, 'APPROVE_LOAN', oldValue, JSON.stringify(loan));

    return JSON.stringify(loan);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // disburseLoan — LOAN_OFFICER, credits accountId
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async disburseLoan(ctx: Context, loanId: string): Promise<string> {
    this.assertRole(ctx, 'LOAN_OFFICER', 'ADMIN');

    const loan = await this.mustGetLoan(ctx, loanId);
    if (loan.status !== 'APPROVED') {
      throw new Error(`Cannot disburse loan with status: ${loan.status}`);
    }

    // Credit principal to account via transaction-cc
    const disbursalTxnId = `DISB-${loanId}-${ctx.stub.getTxID()}`;
    await ctx.stub.invokeChaincode(
      'transaction-cc',
      [
        'TransactionContract:deposit',
        loan.accountId,
        disbursalTxnId,
        loan.principal.toString(),
        `Loan disbursement: ${loanId}`,
      ],
      ctx.stub.getChannelID(),
    );

    const now = this.nowISO(ctx);
    const oldValue = JSON.stringify(loan);
    loan.status = 'DISBURSED';
    loan.disbursedAt = now;
    loan.nextDueDate = this.addMonths(now, 1);
    loan.updatedAt = now;

    await ctx.stub.putState(`LOAN::${loanId}`, Buffer.from(JSON.stringify(loan)));
    ctx.stub.setEvent('LoanDisbursed', Buffer.from(JSON.stringify({ loanId, accountId: loan.accountId, amount: loan.principal })));
    await this.writeAudit(ctx, loanId, 'DISBURSE_LOAN', oldValue, JSON.stringify(loan));

    return JSON.stringify(loan);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // makeRepayment — auto-allocate interest/principal
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async makeRepayment(
    ctx: Context,
    loanId: string,
    amount: string,
  ): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER', 'CUSTOMER', 'LOAN_OFFICER');

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) throw new Error('Invalid repayment amount');

    const loan = await this.mustGetLoan(ctx, loanId);
    if (loan.status !== 'DISBURSED') {
      throw new Error(`Cannot repay loan with status: ${loan.status}`);
    }

    // Calculate interest portion
    const monthlyRate = loan.interestRate / (12 * 100);
    const interestPortion = Math.round(loan.outstandingBalance * monthlyRate * 100) / 100;
    const principalPortion = Math.min(amt - interestPortion, loan.outstandingBalance);

    if (amt < interestPortion) {
      throw new Error(`Repayment amount ${amt} is less than minimum interest due: ${interestPortion}`);
    }

    // Debit from account
    const repayTxnId = `REPAY-${loanId}-${ctx.stub.getTxID()}`;
    await ctx.stub.invokeChaincode(
      'transaction-cc',
      [
        'TransactionContract:withdraw',
        loan.accountId,
        repayTxnId,
        amt.toString(),
        `Loan repayment: ${loanId}`,
      ],
      ctx.stub.getChannelID(),
    );

    const oldValue = JSON.stringify(loan);
    loan.outstandingBalance = Math.max(0, loan.outstandingBalance - principalPortion);
    loan.paidInstallments++;
    loan.nextDueDate = this.addMonths(loan.nextDueDate!, 1);
    loan.updatedAt = this.nowISO(ctx);

    if (loan.outstandingBalance <= 0) {
      loan.status = 'CLOSED';
      loan.outstandingBalance = 0;
      ctx.stub.setEvent('LoanClosed', Buffer.from(JSON.stringify({ loanId })));
    }

    await ctx.stub.putState(`LOAN::${loanId}`, Buffer.from(JSON.stringify(loan)));
    await this.writeAudit(ctx, loanId, 'MAKE_REPAYMENT', oldValue, JSON.stringify(loan));

    const record: RepaymentRecord = {
      repaymentId: repayTxnId,
      loanId,
      amount: amt,
      interestPortion,
      principalPortion,
      timestamp: this.nowISO(ctx),
    };

    return JSON.stringify({ loan, repayment: record });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // markDefault — LOAN_OFFICER or ADMIN
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async markDefault(ctx: Context, loanId: string): Promise<string> {
    this.assertRole(ctx, 'LOAN_OFFICER', 'ADMIN');

    const loan = await this.mustGetLoan(ctx, loanId);
    if (loan.status !== 'DISBURSED') {
      throw new Error(`Cannot mark default for loan with status: ${loan.status}`);
    }

    const oldValue = JSON.stringify(loan);
    loan.status = 'DEFAULTED';
    loan.updatedAt = this.nowISO(ctx);

    await ctx.stub.putState(`LOAN::${loanId}`, Buffer.from(JSON.stringify(loan)));
    ctx.stub.setEvent('LoanDefaulted', Buffer.from(JSON.stringify({ loanId })));
    await this.writeAudit(ctx, loanId, 'MARK_DEFAULT', oldValue, JSON.stringify(loan));

    return JSON.stringify(loan);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getLoan
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getLoan(ctx: Context, loanId: string): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER', 'CUSTOMER', 'AUDITOR', 'LOAN_OFFICER');
    const loan = await this.mustGetLoan(ctx, loanId);
    return JSON.stringify(loan);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getLoansByCustomer — CouchDB rich query
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getLoansByCustomer(ctx: Context, customerId: string): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'TELLER', 'CUSTOMER', 'AUDITOR', 'LOAN_OFFICER');

    const query = {
      selector: { docType: 'LOAN', customerId },
      sort: [{ createdAt: 'desc' }],
    };

    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    const loans: LoanState[] = [];
    let result = await iterator.next();
    while (!result.done) {
      loans.push(JSON.parse(result.value.value.toString()) as LoanState);
      result = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify(loans);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getOverdueLoans — DISBURSED loans past nextDueDate
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getOverdueLoans(ctx: Context): Promise<string> {
    this.assertRole(ctx, 'ADMIN', 'AUDITOR', 'LOAN_OFFICER');

    const now = this.nowISO(ctx);
    const query = {
      selector: {
        docType: 'LOAN',
        status: 'DISBURSED',
        nextDueDate: { $lt: now },
      },
    };

    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    const loans: LoanState[] = [];
    let result = await iterator.next();
    while (!result.done) {
      loans.push(JSON.parse(result.value.value.toString()) as LoanState);
      result = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify(loans);
  }
}
