/*
 * SecureBank Ledger — backend/src/routes/audit.ts
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { AuditCC } from '../fabric/chaincodeHelper';

const router = Router();
router.use(authenticate);
router.use(requireRole('ADMIN', 'AUDITOR'));

// GET /api/audit/:entityType/:entityId
router.get('/:entityType/:entityId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuditCC.getAuditTrail(req.user!.userId, req.params.entityType, req.params.entityId);
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

// GET /api/audit/user/:userId?startDate=&endDate=
router.get('/user/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }).parse(req.query);
    const result = await AuditCC.getAuditsByUser(req.user!.userId, req.params.userId, startDate, endDate);
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

// GET /api/audit/range?startDate=&endDate=
router.get('/range', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }).parse(req.query);
    const result = await AuditCC.getAuditsByDateRange(req.user!.userId, startDate, endDate);
    res.json(JSON.parse(result));
  } catch (err) { next(err); }
});

export default router;
