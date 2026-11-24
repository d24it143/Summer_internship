/*
 * SecureBank Ledger — transaction-cc/src/types.ts
 */

export type TxnType = 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'FEE' | 'INTEREST';
export type TxnStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED';

export interface TransactionState {
  txnId: string;
  fromAccount: string | null;
  toAccount: string | null;
  amount: number;
  currency: string;
  txnType: TxnType;
  status: TxnStatus;
  reference: string;
  timestamp: string;
  reversalOf?: string;
  reversalReason?: string;
  docType: 'TRANSACTION';
}

export interface AccountState {
  accountId: string;
  customerId: string;
  accountType: string;
  balance: number;
  currency: string;
  status: string;
  kycStatus: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  docType: 'ACCOUNT';
}

export interface DailySummary {
  accountId: string;
  date: string;
  totalDebit: number;
  totalCredit: number;
  transactionCount: number;
}
