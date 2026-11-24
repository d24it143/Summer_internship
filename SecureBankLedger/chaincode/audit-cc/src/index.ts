/*
 * SecureBank Ledger — audit-cc/src/index.ts
 * Chaincode entry point
 */

import { AuditContract } from './audit.contract';

export { AuditContract };
export const contracts: any[] = [AuditContract];
