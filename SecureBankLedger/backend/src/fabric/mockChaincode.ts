/*
 * SecureBank Ledger — backend/src/fabric/mockChaincode.ts
 * Clean SQLite-backed Mock Chaincode implementation for local preview
 */

import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/db.config';
import { logger } from '../utils/logger';

// ── Models ───────────────────────────────────────────────────────────────────

export class MockAccount extends Model {
  public id!: string; // accountId
  public customerId!: string;
  public accountType!: string;
  public balance!: number;
  public status!: string;
  public currency!: string;
  public kycStatus!: string;
  public createdBy!: string;
}
MockAccount.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  customerId: { type: DataTypes.STRING, allowNull: false },
  accountType: { type: DataTypes.STRING, allowNull: false },
  balance: { type: DataTypes.DOUBLE, defaultValue: 0 },
  status: { type: DataTypes.STRING, defaultValue: 'ACTIVE' },
  currency: { type: DataTypes.STRING, defaultValue: 'INR' },
  kycStatus: { type: DataTypes.STRING, defaultValue: 'PENDING' },
  createdBy: { type: DataTypes.STRING, allowNull: false },
}, { sequelize, modelName: 'mock_account' });

export class MockTransaction extends Model {
  public id!: string; // txnId
  public accountId!: string;
  public transactionType!: string; // DEPOSIT | WITHDRAW | TRANSFER
  public amount!: number;
  public balanceAfter!: number;
  public status!: string; // COMPLETED | REVERSED
  public reference!: string;
  public performedBy!: string;
  public destinationAccountId!: string | null;
}
MockTransaction.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  accountId: { type: DataTypes.STRING, allowNull: false },
  transactionType: { type: DataTypes.STRING, allowNull: false },
  amount: { type: DataTypes.DOUBLE, allowNull: false },
  balanceAfter: { type: DataTypes.DOUBLE, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'COMPLETED' },
  reference: { type: DataTypes.STRING },
  performedBy: { type: DataTypes.STRING, allowNull: false },
  destinationAccountId: { type: DataTypes.STRING },
}, { sequelize, modelName: 'mock_transaction' });

export class MockLoan extends Model {
  public id!: string; // loanId
  public customerId!: string;
  public accountId!: string;
  public principal!: number;
  public balance!: number;
  public termMonths!: number;
  public interestRate!: number;
  public status!: string; // APPLIED | APPROVED | DISBURSED | REPAID | DEFAULTED
  public emiAmount!: number;
  public collateral!: string;
  public approvedBy!: string | null;
  public nextDueDate!: string | null;
}
MockLoan.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  customerId: { type: DataTypes.STRING, allowNull: false },
  accountId: { type: DataTypes.STRING, allowNull: false },
  principal: { type: DataTypes.DOUBLE, allowNull: false },
  balance: { type: DataTypes.DOUBLE, defaultValue: 0 },
  termMonths: { type: DataTypes.INTEGER, allowNull: false },
  interestRate: { type: DataTypes.DOUBLE, defaultValue: 0 },
  status: { type: DataTypes.STRING, defaultValue: 'APPLIED' },
  emiAmount: { type: DataTypes.DOUBLE, defaultValue: 0 },
  collateral: { type: DataTypes.TEXT },
  approvedBy: { type: DataTypes.STRING },
  nextDueDate: { type: DataTypes.STRING },
}, { sequelize, modelName: 'mock_loan' });

export class MockAudit extends Model {
  public id!: string;
  public entityType!: string;
  public entityId!: string;
  public action!: string;
  public performedBy!: string;
  public oldValue!: string;
  public newValue!: string;
}
MockAudit.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  entityType: { type: DataTypes.STRING, allowNull: false },
  entityId: { type: DataTypes.STRING, allowNull: false },
  action: { type: DataTypes.STRING, allowNull: false },
  performedBy: { type: DataTypes.STRING, allowNull: false },
  oldValue: { type: DataTypes.TEXT },
  newValue: { type: DataTypes.TEXT },
}, { sequelize, modelName: 'mock_audit' });

export class MockConfig extends Model {
  public id!: string; // key
  public value!: string;
}
MockConfig.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  value: { type: DataTypes.STRING, allowNull: false },
}, { sequelize, modelName: 'mock_config' });

// ── Helpers for Auto-seeding ────────────────────────────────────────────────

export async function seedMockDataIfEmpty() {
  await sequelize.sync();
  const accountCount = await MockAccount.count();
  if (accountCount === 0) {
    logger.info('Pre-seeding mock accounts, transactions, and configs for preview mode...');
    
    // Seed configs
    await MockConfig.bulkCreate([
      { id: 'DAILY_WITHDRAWAL_LIMIT', value: '50000' },
      { id: 'MIN_LOAN_COLLATERAL_VALUE', value: '10000' },
      { id: 'BANK_STATUS', value: 'OPERATIONAL' },
    ]);

    // Seed admin/customer mock accounts
    await MockAccount.create({
      id: 'ACC-ADMIN-001',
      customerId: 'CUST-ADMIN-001',
      accountType: 'SAVINGS',
      balance: 1000000,
      status: 'ACTIVE',
      currency: 'USD',
      kycStatus: 'VERIFIED',
      createdBy: 'bank-admin',
    });

    await MockAccount.create({
      id: 'ACC-CUST-001',
      customerId: 'CUST-001',
      accountType: 'SAVINGS',
      balance: 25000,
      status: 'ACTIVE',
      currency: 'INR',
      kycStatus: 'VERIFIED',
      createdBy: 'bank-teller',
    });

    // Seed mock transaction
    await MockTransaction.create({
      id: 'TXN-INITIAL-001',
      accountId: 'ACC-CUST-001',
      transactionType: 'DEPOSIT',
      amount: 25000,
      balanceAfter: 25000,
      status: 'COMPLETED',
      reference: 'Initial Deposit',
      performedBy: 'bank-teller',
    });

    // Seed mock audit trail
    await MockAudit.create({
      entityType: 'ACCOUNT',
      entityId: 'ACC-CUST-001',
      action: 'CREATE',
      performedBy: 'bank-teller',
      oldValue: '',
      newValue: JSON.stringify({ id: 'ACC-CUST-001', customerId: 'CUST-001', balance: 25000 }),
    });

    logger.info('Mock seed completed successfully!');
  }
}
