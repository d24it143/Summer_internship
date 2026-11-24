/*
 * SecureBank Ledger — backend/src/routes/loans.ts
 */

import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { LoanCC } from '../fabric/chaincodeHelper';

const router = Router();
router.use(authenticate);

const ApplyLoanSchema = z.object({
  customerId: z.string().min(1),
  accountId: z.string().min(1),
  principal: z.number().positive(),
  termMonths: z.number().int().min(1).max(360),
  collateral: z.string().optional().default(''),
});

// POST /api/loans
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ApplyLoanSchema.parse(req.body);
    const loanId = `LOAN-${uuidv4().slice(0, 8).toUpperCase()}`;
    const result = await LoanCC.applyLoan(
      req.user!.userId,
      loanId,
      body.customerId,
      body.accountId,
      body.principal.toString(),
      body.termMonths.toString(),
      body.collateral ?? '',
    );
    res.status(201).json(JSON.parse(result));
  } catch (err) { next(err); }
});

// PATCH /api/loans/:id/approve
router.patch('/:id/approve', requireRole('LOAN_OFFICER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { interestRate } = z.object({ interestRate: z.number().min(0).max(100) }).parse(req.body);
    const result = await LoanCC.approveLoan(req.user!.userId, req.params.id, req.user!.userId, interestRate.toString());
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

// PATCH /api/loans/:id/disburse
router.patch('/:id/disburse', requireRole('LOAN_OFFICER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await LoanCC.disburseLoan(req.user!.userId, req.params.id);
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

// POST /api/loans/:id/repay
router.post('/:id/repay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount } = z.object({ amount: z.number().positive() }).parse(req.body);
    const result = await LoanCC.makeRepayment(req.user!.userId, req.params.id, amount.toString());
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

// GET /api/loans/overdue
router.get('/overdue', requireRole('ADMIN', 'AUDITOR', 'LOAN_OFFICER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await LoanCC.getOverdueLoans(req.user!.userId);
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

// GET /api/loans/customer/:customerId
router.get('/customer/:customerId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await LoanCC.getLoansByCustomer(req.user!.userId, req.params.customerId);
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

// GET /api/loans/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await LoanCC.getLoan(req.user!.userId, req.params.id);
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

export default router;
