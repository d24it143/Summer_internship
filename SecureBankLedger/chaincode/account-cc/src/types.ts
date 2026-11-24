/*
 * SecureBank Ledger — account-cc/src/types.ts
 */

export type AccountType = 'SAVINGS' | 'CURRENT' | 'FIXED';
export type AccountStatus = 'ACTIVE' | 'FROZEN' | 'CLOSED';
export type KYCStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface AccountState {
  accountId: string;
  customerId: string;
  accountType: AccountType;
  balance: number;
  currency: string;
  status: AccountStatus;
  kycStatus: KYCStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
  docType: 'ACCOUNT';
}

export interface HistoryRecord {
  txId: string;
  timestamp: string;
  isDelete: boolean;
  value: AccountState | null;
}
