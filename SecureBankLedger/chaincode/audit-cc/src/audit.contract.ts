/*
 * SecureBank Ledger — audit-cc/src/audit.contract.ts
 * AuditContract: APPEND-ONLY audit trail for all bank entities
 *
 * State key: AUDIT::{auditId}
 * CouchDB index: entityType+entityId, userId, timestamp
 */

import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from 'fabric-contract-api';
import { AuditRecord } from './types';

@Info({
  title: 'AuditContract',
  description: 'Append-only audit trail for SecureBank Ledger',
})
export class AuditContract extends Contract {
  constructor() {
    super('AuditContract');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helper: get caller identity common name
  // ─────────────────────────────────────────────────────────────────────────
  private getCallerCN(ctx: Context): string {
    const id = ctx.clientIdentity.getX509Certificate();
    return id?.subject.commonName ?? 'unknown';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // createAuditRecord — called by other chaincodes via cross-chaincode invoke
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async createAuditRecord(
    ctx: Context,
    auditId: string,
    entityType: string,
    entityId: string,
    action: string,
    performedBy: string,
    oldValue: string,
    newValue: string,
  ): Promise<string> {
    // Validate: no duplicate audit records
    const existingBytes = await ctx.stub.getState(`AUDIT::${auditId}`);
    if (existingBytes && existingBytes.length > 0) {
      throw new Error(`Audit record ${auditId} already exists. Audit records are immutable.`);
    }

    // Validate required fields
    if (!auditId || !entityType || !entityId || !action || !newValue) {
      throw new Error('Missing required audit fields: auditId, entityType, entityId, action, newValue');
    }

    const txId = ctx.stub.getTxID();
    const timestamp = new Date(
      ctx.stub.getTxTimestamp().seconds.low * 1000,
    ).toISOString();
    const channel = ctx.stub.getChannelID();

    const auditRecord: AuditRecord = {
      auditId,
      entityType,
      entityId,
      action,
      performedBy,
      oldValue: oldValue || null,
      newValue,
      txnId: txId,
      timestamp,
      channel,
      docType: 'AUDIT_RECORD',
    };

    const stateKey = `AUDIT::${auditId}`;
    await ctx.stub.putState(stateKey, Buffer.from(JSON.stringify(auditRecord)));

    // Emit chaincode event
    ctx.stub.setEvent(
      'AuditRecordCreated',
      Buffer.from(JSON.stringify({ auditId, entityType, entityId, action })),
    );

    return JSON.stringify(auditRecord);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getAuditTrail — rich CouchDB query by entityType + entityId
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getAuditTrail(
    ctx: Context,
    entityType: string,
    entityId: string,
  ): Promise<string> {
    this.assertAuditorOrAdmin(ctx);

    const query = {
      selector: {
        docType: 'AUDIT_RECORD',
        entityType,
        entityId,
      },
      sort: [{ timestamp: 'asc' }],
    };

    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    const results: AuditRecord[] = [];

    let result = await iterator.next();
    while (!result.done) {
      const record = JSON.parse(result.value.value.toString()) as AuditRecord;
      results.push(record);
      result = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify(results);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getAuditsByUser — rich query by performedBy + date range
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getAuditsByUser(
    ctx: Context,
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<string> {
    this.assertAuditorOrAdmin(ctx);

    const query = {
      selector: {
        docType: 'AUDIT_RECORD',
        performedBy: userId,
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
      },
      sort: [{ timestamp: 'asc' }],
    };

    return this.executeRichQuery(ctx, query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getAuditsByDateRange — rich query across all entities in a date range
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getAuditsByDateRange(
    ctx: Context,
    startDate: string,
    endDate: string,
  ): Promise<string> {
    this.assertAuditorOrAdmin(ctx);

    const query = {
      selector: {
        docType: 'AUDIT_RECORD',
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
      },
      sort: [{ timestamp: 'asc' }],
    };

    return this.executeRichQuery(ctx, query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helper: execute CouchDB rich query and return JSON array
  // ─────────────────────────────────────────────────────────────────────────
  private async executeRichQuery(
    ctx: Context,
    query: object,
  ): Promise<string> {
    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    const results: AuditRecord[] = [];

    let result = await iterator.next();
    while (!result.done) {
      const record = JSON.parse(result.value.value.toString()) as AuditRecord;
      results.push(record);
      result = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify(results);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RBAC: Only AUDITOR or ADMIN can read audit records
  // ─────────────────────────────────────────────────────────────────────────
  private assertAuditorOrAdmin(ctx: Context): void {
    const isAuditor = ctx.clientIdentity.assertAttributeValue('role', 'AUDITOR');
    const isAdmin   = ctx.clientIdentity.assertAttributeValue('role', 'ADMIN');
    if (!isAuditor && !isAdmin) {
      throw new Error('Access denied: AUDITOR or ADMIN role required');
    }
  }
}
