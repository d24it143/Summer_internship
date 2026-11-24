/*
 * SecureBank Ledger — backend/src/routes/transactions.ts
 */

import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { TransactionCC } from '../fabric/chaincodeHelper';

const router = Router();
router.use(authenticate);

const DepositSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number().positive(),
  reference: z.string().default(''),
});

const TransferSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amount: z.number().positive(),
  reference: z.string().default(''),
});

// POST /api/transactions/deposit
router.post('/deposit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = DepositSchema.parse(req.body);
    const txnId = `TXN-${uuidv4().slice(0, 12).toUpperCase()}`;
    const result = await TransactionCC.deposit(req.user!.userId, body.accountId, txnId, body.amount.toString(), body.reference);
    res.status(201).json(JSON.parse(result));
  } catch (err) { next(err); }
});

// POST /api/transactions/withdraw
router.post('/withdraw', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = DepositSchema.parse(req.body);
    const txnId = `TXN-${uuidv4().slice(0, 12).toUpperCase()}`;
    const result = await TransactionCC.withdraw(req.user!.userId, body.accountId, txnId, body.amount.toString(), body.reference);
    res.status(201).json(JSON.parse(result));
  } catch (err) { next(err); }
});

// POST /api/transactions/transfer
router.post('/transfer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = TransferSchema.parse(req.body);
    const txnId = `TXN-${uuidv4().slice(0, 12).toUpperCase()}`;
    const result = await TransactionCC.transfer(req.user!.userId, body.fromAccountId, body.toAccountId, txnId, body.amount.toString(), body.reference);
    res.status(201).json(JSON.parse(result));
  } catch (err) { next(err); }
});

// POST /api/transactions/:id/reverse
router.post('/:id/reverse', requireRole('ADMIN', 'TELLER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
    const reversalId = `REV-${uuidv4().slice(0, 12).toUpperCase()}`;
    const result = await TransactionCC.reverse(req.user!.userId, req.params.id, reversalId, reason);
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

// GET /api/transactions/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await TransactionCC.getTransaction(req.user!.userId, req.params.id);
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

export default router;
