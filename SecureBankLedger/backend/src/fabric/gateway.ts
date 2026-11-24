/*
 * SecureBank Ledger — backend/src/fabric/gateway.ts
 * Fabric Gateway connection pool — reuses Gateway instances per identity
 */

import * as grpc from '@grpc/grpc-js';
import {
  connect,
  Gateway,
  Network,
  Contract,
  Identity,
  Signer,
  signers,
} from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fabricConfig } from '../config/fabric.config';
import { logger } from '../utils/logger';

// Connection pool: userId → Gateway instance
const gatewayPool: Map<string, Gateway> = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// getGateway — returns (or creates) a Gateway for the given identity
// ─────────────────────────────────────────────────────────────────────────────
export async function getGateway(userId: string): Promise<Gateway> {
  if (gatewayPool.has(userId)) {
    return gatewayPool.get(userId)!;
  }

  const walletPath = path.join(fabricConfig.walletPath, userId);
  const certPath = path.join(walletPath, 'msp', 'signcerts', 'cert.pem');
  const keyDirPath = path.join(walletPath, 'msp', 'keystore');

  if (!fs.existsSync(certPath)) {
    throw new Error(`Identity for user '${userId}' not found in wallet at ${walletPath}`);
  }

  const credentials = fs.readFileSync(certPath);
  const keyFiles = fs.readdirSync(keyDirPath);
  if (keyFiles.length === 0) {
    throw new Error(`No private key found for user '${userId}'`);
  }
  const privateKeyPem = fs.readFileSync(path.join(keyDirPath, keyFiles[0]));
  const privateKey = crypto.createPrivateKey(privateKeyPem);

  const identity: Identity = {
    mspId: fabricConfig.mspId,
    credentials,
  };

  const signer: Signer = signers.newPrivateKeySigner(privateKey);

  // gRPC client with mTLS
  const grpcClient = new grpc.Client(fabricConfig.peerEndpoint, grpc.credentials.createSsl(fabricConfig.tlsRootCert));

  const gateway = connect({
    client: grpcClient,
    identity,
    signer,
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
    endorseOptions: () => ({ deadline: Date.now() + 15000 }),
    submitOptions: () => ({ deadline: Date.now() + 5000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
  });

  gatewayPool.set(userId, gateway);
  logger.info(`Gateway created for user: ${userId}`);
  return gateway;
}

// ─────────────────────────────────────────────────────────────────────────────
// getContract — convenience: gateway → network → contract
// ─────────────────────────────────────────────────────────────────────────────
export async function getContract(userId: string, chaincodeName: string): Promise<Contract> {
  const gateway = await getGateway(userId);
  const network: Network = gateway.getNetwork(fabricConfig.channelName);
  return network.getContract(chaincodeName);
}

// ─────────────────────────────────────────────────────────────────────────────
// closeGateway — for graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────
export function closeGateway(userId: string): void {
  const gateway = gatewayPool.get(userId);
  if (gateway) {
    gateway.close();
    gatewayPool.delete(userId);
    logger.info(`Gateway closed for user: ${userId}`);
  }
}

export function closeAllGateways(): void {
  for (const [userId, gateway] of gatewayPool) {
    gateway.close();
    logger.info(`Gateway closed for user: ${userId}`);
  }
  gatewayPool.clear();
}
