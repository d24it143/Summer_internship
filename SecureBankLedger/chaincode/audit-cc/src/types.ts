/*
 * SecureBank Ledger — audit-cc/src/types.ts
 * Shared type definitions for Audit chaincode
 */

export interface AuditRecord {
  auditId: string;
  entityType: string;        // 'ACCOUNT' | 'TRANSACTION' | 'LOAN' | 'CONFIG' | 'USER'
  entityId: string;
  action: string;            // e.g., 'CREATE_ACCOUNT', 'FREEZE_ACCOUNT', 'DEPOSIT'
  performedBy: string;       // X.509 common name / userId
  oldValue: string | null;   // JSON stringified previous state
  newValue: string;          // JSON stringified new state
  txnId: string;             // Fabric transaction ID
  timestamp: string;         // ISO-8601
  channel: string;
  docType: 'AUDIT_RECORD';
}
