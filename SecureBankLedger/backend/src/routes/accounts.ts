/*
 * SecureBank Ledger — backend/src/routes/accounts.ts
 * All account REST endpoints
 */

import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { AccountCC, TransactionCC } from '../fabric/chaincodeHelper';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

// GET /api/accounts
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, role } = req.user!;
    let accounts: any[] = [];
    const useMockMode = process.env.MOCK_FABRIC === 'true' || !process.env.FABRIC_WALLET_PATH;

    if (useMockMode) {
      const { MockAccount } = require('../fabric/mockChaincode');
      if (role === 'ADMIN' || role === 'TELLER' || role === 'AUDITOR') {
        accounts = await MockAccount.findAll();
      } else {
        accounts = await MockAccount.findAll({ where: { customerId: userId } });
      }
    } else {
      if (role === 'ADMIN' || role === 'TELLER' || role === 'AUDITOR') {
        const result = await AccountCC.getAccountsByCustomer(userId, 'ALL');
        accounts = JSON.parse(result);
      } else {
        const result = await AccountCC.getAccountsByCustomer(userId, userId);
        accounts = JSON.parse(result);
      }
    }

    const mapped = accounts.map((acc: any) => {
      const data = acc.toJSON ? acc.toJSON() : acc;
      return {
        accountId: data.id || data.accountId,
        customerId: data.customerId,
        accountType: data.accountType,
        balance: data.balance,
        kycStatus: data.kycStatus,
        status: data.status,
      };
    });

    res.json(mapped);
  } catch (err) { next(err); }
});

const CreateAccountSchema = z.object({
  customerId: z.string().min(1),
  accountType: z.enum(['SAVINGS', 'CURRENT', 'FIXED']),
  initialDeposit: z.number().min(0).default(0),
  currency: z.string().length(3).default('INR'),
});

// POST /api/accounts
router.post('/', requireRole('ADMIN', 'TELLER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateAccountSchema.parse(req.body);
    const accountId = `ACC-${uuidv4().slice(0, 8).toUpperCase()}`;
    const result = await AccountCC.createAccount(
      req.user!.userId,
      accountId,
      body.customerId,
      body.accountType,
      body.initialDeposit.toString(),
      body.currency,
    );
    res.status(201).json(JSON.parse(result));
  } catch (err) { next(err); }
});

// GET /api/accounts/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AccountCC.getAccount(req.user!.userId, req.params.id);
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

// GET /api/accounts/:id/history
router.get('/:id/history', requireRole('ADMIN', 'TELLER', 'AUDITOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AccountCC.getAccountHistory(req.user!.userId, req.params.id);
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

// GET /api/accounts/:id/transactions
router.get('/:id/transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    const result = await TransactionCC.getAccountTransactions(
      req.user!.userId,
      req.params.id,
      startDate,
      endDate,
    );
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

// PATCH /api/accounts/:id/freeze
router.patch('/:id/freeze', requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
    const result = await AccountCC.freezeAccount(req.user!.userId, req.params.id, reason);
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

// PATCH /api/accounts/:id/kyc
router.patch('/:id/kyc', requireRole('ADMIN', 'TELLER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = z.object({ status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']) }).parse(req.body);
    const result = await AccountCC.updateKYC(req.user!.userId, req.params.id, status);
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

export default router;
