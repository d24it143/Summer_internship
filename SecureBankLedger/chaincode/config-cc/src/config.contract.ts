/*
 * SecureBank Ledger — config-cc/src/config.contract.ts
 * ConfigContract: bank-wide configuration key-value store
 * ADMIN only for setConfig; all roles can getConfig
 *
 * State key: CONFIG::{key}
 */

import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from 'fabric-contract-api';

interface ConfigEntry {
  key: string;
  value: string;
  updatedAt: string;
  updatedBy: string;
  docType: 'CONFIG';
}

@Info({
  title: 'ConfigContract',
  description: 'Bank-wide configuration management',
})
export class ConfigContract extends Contract {
  constructor() {
    super('ConfigContract');
  }

  private getCallerCN(ctx: Context): string {
    return ctx.clientIdentity.getX509Certificate()?.subject.commonName ?? 'unknown';
  }
  private assertAdmin(ctx: Context): void {
    const isAdmin = ctx.clientIdentity.assertAttributeValue('role', 'ADMIN');
    if (!isAdmin) throw new Error('Access denied: ADMIN role required for setConfig');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // setConfig — ADMIN only
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction()
  async setConfig(ctx: Context, key: string, value: string): Promise<string> {
    this.assertAdmin(ctx);

    if (!key || !value) throw new Error('key and value are required');

    const entry: ConfigEntry = {
      key,
      value,
      updatedAt: new Date(ctx.stub.getTxTimestamp().seconds.low * 1000).toISOString(),
      updatedBy: this.getCallerCN(ctx),
      docType: 'CONFIG',
    };

    await ctx.stub.putState(`CONFIG::${key}`, Buffer.from(JSON.stringify(entry)));

    // Audit
    const auditId = `CONFIG-${key}-${ctx.stub.getTxID()}`;
    await ctx.stub.invokeChaincode(
      'audit-cc',
      [
        'AuditContract:createAuditRecord',
        auditId,
        'CONFIG',
        key,
        'SET_CONFIG',
        this.getCallerCN(ctx),
        '',
        JSON.stringify(entry),
      ],
      ctx.stub.getChannelID(),
    );

    ctx.stub.setEvent('ConfigUpdated', Buffer.from(JSON.stringify({ key, value })));
    return JSON.stringify(entry);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getConfig — all roles
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getConfig(ctx: Context, key: string): Promise<string> {
    const bytes = await ctx.stub.getState(`CONFIG::${key}`);
    if (!bytes || bytes.length === 0) {
      throw new Error(`Config key '${key}' not found`);
    }
    const entry = JSON.parse(bytes.toString()) as ConfigEntry;
    return entry.value;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getAllConfig — ADMIN or AUDITOR
  // ─────────────────────────────────────────────────────────────────────────
  @Transaction(false)
  @Returns('string')
  async getAllConfig(ctx: Context): Promise<string> {
    const role = ctx.clientIdentity.getAttributeValue('role') ?? '';
    if (role !== 'ADMIN' && role !== 'AUDITOR') {
      throw new Error('Access denied: ADMIN or AUDITOR required');
    }

    const query = { selector: { docType: 'CONFIG' } };
    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    const configs: ConfigEntry[] = [];

    let result = await iterator.next();
    while (!result.done) {
      configs.push(JSON.parse(result.value.value.toString()) as ConfigEntry);
      result = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify(configs);
  }
}
