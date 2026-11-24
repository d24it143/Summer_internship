/*
 * SecureBank Ledger — backend/tests/accounts.test.ts
 * Integration tests for account endpoints
 */

import request from 'supertest';
import app from '../src/server';

// Mock Fabric Gateway
jest.mock('../src/fabric/gateway', () => ({
  getGateway: jest.fn(),
  getContract: jest.fn(),
  closeAllGateways: jest.fn(),
}));

jest.mock('../src/fabric/chaincodeHelper', () => ({
  AccountCC: {
    createAccount: jest.fn().mockResolvedValue(JSON.stringify({
      accountId: 'ACC-TEST001',
      customerId: 'CUST-001',
      accountType: 'SAVINGS',
      balance: 1000,
      currency: 'INR',
      status: 'ACTIVE',
      kycStatus: 'PENDING',
    })),
    getAccount: jest.fn().mockResolvedValue(JSON.stringify({
      accountId: 'ACC-TEST001',
      customerId: 'CUST-001',
      balance: 1000,
    })),
    freezeAccount: jest.fn().mockResolvedValue(JSON.stringify({ status: 'FROZEN' })),
    updateKYC: jest.fn().mockResolvedValue(JSON.stringify({ kycStatus: 'VERIFIED' })),
    getAccountHistory: jest.fn().mockResolvedValue('[]'),
  },
  TransactionCC: {
    getAccountTransactions: jest.fn().mockResolvedValue('[]'),
  },
}));

jest.mock('../src/config/db.config', () => ({
  connectDatabase: jest.fn().mockResolvedValue(undefined),
  sequelize: { authenticate: jest.fn(), sync: jest.fn() },
}));

// Generate a valid JWT for testing
import jwt from 'jsonwebtoken';
const adminToken = jwt.sign({ userId: 'bank-admin', role: 'ADMIN' }, 'change_this_secret_in_production_min32chars!!', { expiresIn: '1h' });
const tellerToken = jwt.sign({ userId: 'bank-teller', role: 'TELLER' }, 'change_this_secret_in_production_min32chars!!', { expiresIn: '1h' });
const customerToken = jwt.sign({ userId: 'customer-001', role: 'CUSTOMER', customerId: 'CUST-001' }, 'change_this_secret_in_production_min32chars!!', { expiresIn: '1h' });

describe('Account Endpoints', () => {
  describe('POST /api/accounts', () => {
    it('should create account as TELLER', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${tellerToken}`)
        .send({ customerId: 'CUST-001', accountType: 'SAVINGS', initialDeposit: 1000, currency: 'INR' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accountId');
    });

    it('should reject CUSTOMER creating account', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ customerId: 'CUST-001', accountType: 'SAVINGS' });

      expect(res.status).toBe(403);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ accountType: 'SAVINGS' }); // missing customerId

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/accounts/:id', () => {
    it('should return account for valid request', async () => {
      const res = await request(app)
        .get('/api/accounts/ACC-TEST001')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accountId', 'ACC-TEST001');
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/accounts/ACC-TEST001');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/accounts/:id/freeze', () => {
    it('should freeze account as ADMIN', async () => {
      const res = await request(app)
        .patch('/api/accounts/ACC-TEST001/freeze')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Suspicious activity' });

      expect(res.status).toBe(200);
    });

    it('should reject TELLER freezing account', async () => {
      const res = await request(app)
        .patch('/api/accounts/ACC-TEST001/freeze')
        .set('Authorization', `Bearer ${tellerToken}`)
        .send({ reason: 'Test' });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/accounts/:id/kyc', () => {
    it('should update KYC as TELLER', async () => {
      const res = await request(app)
        .patch('/api/accounts/ACC-TEST001/kyc')
        .set('Authorization', `Bearer ${tellerToken}`)
        .send({ status: 'VERIFIED' });

      expect(res.status).toBe(200);
    });
  });
});

describe('Health Check', () => {
  it('GET /api/health returns 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
