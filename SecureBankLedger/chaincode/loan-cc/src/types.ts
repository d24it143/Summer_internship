/*
 * SecureBank Ledger — loan-cc/src/types.ts
 */

export type LoanStatus =
  | 'APPLIED'
  | 'APPROVED'
  | 'DISBURSED'
  | 'CLOSED'
  | 'DEFAULTED';

export interface LoanState {
  loanId: string;
  customerId: string;
  accountId: string;
  principal: number;
  interestRate: number;
  termMonths: number;
  emiAmount: number;
  disbursedAt: string | null;
  nextDueDate: string | null;
  paidInstallments: number;
  outstandingBalance: number;
  status: LoanStatus;
  collateral: string | null;     // JSON string
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  docType: 'LOAN';
}

export interface RepaymentRecord {
  repaymentId: string;
  loanId: string;
  amount: number;
  interestPortion: number;
  principalPortion: number;
  timestamp: string;
}
