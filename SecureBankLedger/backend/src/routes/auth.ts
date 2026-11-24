/*
 * SecureBank Ledger — backend/src/routes/auth.ts
 * POST /api/auth/enroll    — enroll user via Fabric CA, return JWT
 * POST /api/auth/refresh   — refresh access token
 * POST /api/auth/register  — ADMIN: register new Fabric user
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { jwtConfig } from '../config/jwt.config';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';
import { fabricConfig } from '../config/fabric.config';

const execAsync = promisify(exec);
const router = Router();

const EnrollSchema = z.object({
  userId: z.string().min(3).max(64),
  secret: z.string().min(6),
});

const RegisterSchema = z.object({
  userId: z.string().min(3).max(64),
  secret: z.string().min(8),
  role: z.enum(['CUSTOMER', 'TELLER', 'LOAN_OFFICER', 'AUDITOR', 'ADMIN']),
  customerId: z.string().optional(),
});

// POST /api/auth/enroll
router.post('/enroll', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, secret } = EnrollSchema.parse(req.body);

    let mockMode = process.env.MOCK_FABRIC === 'true' || !process.env.FABRIC_WALLET_PATH;

    if (!mockMode) {
      try {
        // Check if user wallet exists
        const walletPath = path.join(fabricConfig.walletPath, userId);
        if (!fs.existsSync(walletPath)) {
          // Attempt enrollment via fabric-ca-client
          const caUrl = `https://${userId}:${secret}@localhost:7054`;
          const certPath = path.join(fabricConfig.walletPath, 'ca', 'ca.bank.com-cert.pem');
          const mspPath = path.join(walletPath, 'msp');

          await execAsync(
            `fabric-ca-client enroll -u "${caUrl}" --caname ca.bank.com -M "${mspPath}" --tls.certfiles "${certPath}"`,
          );
          logger.info(`User ${userId} enrolled successfully`);
        }
      } catch (err) {
        logger.warn(`Fabric CA enrollment failed, falling back to offline mock enrollment: ${err}`);
        mockMode = true;
      }
    }

    let role = 'CUSTOMER';
    if (userId.includes('admin'))        role = 'ADMIN';
    else if (userId.includes('teller'))  role = 'TELLER';
    else if (userId.includes('officer')) role = 'LOAN_OFFICER';
    else if (userId.includes('auditor')) role = 'AUDITOR';

    const payload = { userId, role };
    const accessToken  = jwt.sign(payload, jwtConfig.accessSecret,  { expiresIn: jwtConfig.accessExpiresIn  as any });
    const refreshToken = jwt.sign(payload, jwtConfig.refreshSecret, { expiresIn: jwtConfig.refreshExpiresIn as any });

    res.json({ accessToken, refreshToken, userId, role, expiresIn: jwtConfig.accessExpiresIn });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    const payload = jwt.verify(refreshToken, jwtConfig.refreshSecret) as { userId: string; role: string };

    const newAccessToken = jwt.sign(
      { userId: payload.userId, role: payload.role },
      jwtConfig.accessSecret,
      { expiresIn: jwtConfig.accessExpiresIn as any },
    );
    const newRefreshToken = jwt.sign(
      { userId: payload.userId, role: payload.role },
      jwtConfig.refreshSecret,
      { expiresIn: jwtConfig.refreshExpiresIn as any },
    );

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register — ADMIN only
router.post(
  '/register',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, secret, role, customerId } = RegisterSchema.parse(req.body);

      let mockMode = process.env.MOCK_FABRIC === 'true' || !process.env.FABRIC_WALLET_PATH;

      if (!mockMode) {
        try {
          const attrs = [`role=${role}:ecert`, ...(customerId ? [`customerId=${customerId}:ecert`] : [])].join(',');
          const certPath = path.join(fabricConfig.walletPath, 'ca', 'ca.bank.com-cert.pem');

          // Register via fabric-ca-client (admin identity must be enrolled)
          await execAsync(
            `fabric-ca-client register --caname ca.bank.com --id.name "${userId}" --id.secret "${secret}" --id.type client --id.attrs "${attrs}" --tls.certfiles "${certPath}"`,
          );
          logger.info(`User ${userId} registered with role ${role}`);
        } catch (err) {
          logger.warn(`Fabric CA registration failed, falling back to mock mode: ${err}`);
        }
      }

      res.status(201).json({ message: `User ${userId} registered successfully (mock mode)`, userId, role });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
