/*
 * SecureBank Ledger — backend/src/config/fabric.config.ts
 * Fabric Gateway connection configuration
 */

import path from 'path';
import fs from 'fs';

export const fabricConfig = {
  channelName: process.env.FABRIC_CHANNEL ?? 'banking-channel',
  mspId: process.env.FABRIC_MSP_ID ?? 'BankOrgMSP',
  peerEndpoint: process.env.FABRIC_PEER_ENDPOINT ?? 'localhost:7051',
  walletPath: path.resolve(process.env.FABRIC_WALLET_PATH ?? '../network/wallet'),
  tlsRootCertPath: path.resolve(
    process.env.FABRIC_PEER_TLS_ROOT_CERT ??
      '../network/organizations/peerOrganizations/bank.com/peers/peer0.bank.com/tls/ca.crt',
  ),
  get tlsRootCert(): Buffer {
    return fs.readFileSync(this.tlsRootCertPath);
  },
  chaincodes: {
    account: 'account-cc',
    transaction: 'transaction-cc',
    loan: 'loan-cc',
    audit: 'audit-cc',
    config: 'config-cc',
  },
};
