/*
 * SecureBank Ledger — backend/src/middleware/rbac.middleware.ts
 * Role-based access control middleware
 */

import { Request, Response, NextFunction } from 'express';

export type Role = 'ADMIN' | 'TELLER' | 'LOAN_OFFICER' | 'AUDITOR' | 'CUSTOMER';

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.user?.role as Role | undefined;
    if (!userRole || !roles.includes(userRole)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `This endpoint requires one of: [${roles.join(', ')}]. Your role: ${userRole ?? 'none'}`,
      });
      return;
    }
    next();
  };
}
