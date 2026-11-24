/*
 * SecureBank Ledger — backend/src/middleware/error.middleware.ts
 * Centralized error handling middleware
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation Error',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
    return;
  }

  // Fabric / chaincode errors
  const fabricError = err.message?.match(/Error: (.+)/)?.[1] ?? err.message;
  const isFabricError = err.message?.includes('Error:') || err.message?.includes('chaincode');

  const statusCode = err.statusCode ?? (isFabricError ? 400 : 500);

  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  });

  res.status(statusCode).json({
    error: isFabricError ? fabricError : (err.message ?? 'Internal server error'),
    code: err.code,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}
