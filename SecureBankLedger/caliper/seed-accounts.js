#!/usr/bin/env node
/**
 * SecureBank Ledger — Caliper Seed Script
 * Seeds 500 accounts per organization (Org1 / Org2 / Org3) on the
 * banking-channel BEFORE the benchmark runs begin.
 *
 * Run: node caliper/seed-accounts.js
 * Requires: Fabric network UP + chaincode deployed
 */

'use strict';

const { connect, hash, signers } = require('@hyperledger/fabric-gateway');
const crypto   = require('crypto');
const fs       = require('fs');
const path     = require('path');
const grpc     = require('@grpc/grpc-js');

const CHANNEL   = 'banking-channel';
const CHAINCODE = 'account-cc';
const CONTRACT  = 'AccountContract';

const ORGS = [
  {
    name: 'Org1',
    mspId: 'BankOrgMSP',
    peerEndpoint: 'peer0.bank.com:7051',
    tlsCertPath: '../network/organizations/peerOrganizations/bank.com/peers/peer0.bank.com/tls/ca.crt',
    certPath:    '../network/organizations/peerOrganizations/bank.com/users/Admin@bank.com/msp/signcerts/Admin@bank.com-cert.pem',
    keyPath:     '../network/organizations/peerOrganizations/bank.com/users/Admin@bank.com/msp/keystore/priv_sk',
    currency:    'INR',
  },
  {
    name: 'Org2',
    mspId: 'InsuranceOrgMSP',
    peerEndpoint: 'peer0.insurance.com:10051',
    tlsCertPath: '../network/organizations/peerOrganizations/insurance.com/peers/peer0.insurance.com/tls/ca.crt',
    certPath:    '../network/organizations/peerOrganizations/insurance.com/users/Admin@insurance.com/msp/signcerts/Admin@insurance.com-cert.pem',
    keyPath:     '../network/organizations/peerOrganizations/insurance.com/users/Admin@insurance.com/msp/keystore/priv_sk',
    currency:    'USD',
  },
  {
    name: 'Org3',
    mspId: 'AuditOrgMSP',
    peerEndpoint: 'peer0.audit.com:11051',
    tlsCertPath: '../network/organizations/peerOrganizations/audit.com/peers/peer0.audit.com/tls/ca.crt',
    certPath:    '../network/organizations/peerOrganizations/audit.com/users/Admin@audit.com/msp/signcerts/Admin@audit.com-cert.pem',
    keyPath:     '../network/organizations/peerOrganizations/audit.com/users/Admin@audit.com/msp/keystore/priv_sk',
    currency:    'EUR',
  },
];

const SEED_COUNT = 500; // accounts per org

async function seedOrg(org) {
  console.log(`\n🌱 Seeding ${SEED_COUNT} accounts for ${org.name} (${org.mspId})`);

  const tlsRootCert  = fs.readFileSync(path.resolve(__dirname, org.tlsCertPath));
  const credentials  = grpc.credentials.createSsl(tlsRootCert);
  const client       = new grpc.Client(org.peerEndpoint, credentials);

  const certPem  = fs.readFileSync(path.resolve(__dirname, org.certPath));
  const keyPem   = fs.readFileSync(path.resolve(__dirname, org.keyPath));
  const privateKey = crypto.createPrivateKey(keyPem);

  const gateway = connect({
    client,
    identity: { mspId: org.mspId, credentials: certPem },
    signer: signers.newPrivateKeySigner(privateKey),
    hash: hash.sha256,
  });

  try {
    const network  = gateway.getNetwork(CHANNEL);
    const contract = network.getContract(CHAINCODE);

    let created = 0;
    let skipped = 0;

    for (let i = 0; i < SEED_COUNT; i++) {
      const accountId  = `ACC-${org.name}-seed-${i}`;
      const customerId = `CUST-${org.name}-${i}`;
      const accType    = ['SAVINGS', 'CURRENT', 'FIXED'][i % 3];
      const deposit    = String(10000 + (i * 100));  // ₹10,000 – ₹60,000

      try {
        await contract.submitTransaction(
          `${CONTRACT}:createAccount`,
          accountId, customerId, accType, deposit, org.currency,
        );
        created++;
        if (created % 50 === 0) process.stdout.write(`  → ${created}/${SEED_COUNT} accounts created\r`);
      } catch (err) {
        if (err.message && err.message.includes('already exists')) {
          skipped++;
        } else {
          console.error(`  ❌ Error creating ${accountId}: ${err.message}`);
        }
      }
    }

    console.log(`  ✅ ${org.name}: created=${created}, skipped(already existed)=${skipped}`);
  } finally {
    gateway.close();
    client.close();
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SecureBank Ledger — Benchmark Seed Script');
  console.log('  Seeding 500 accounts × 3 orgs = 1,500 total accounts');
  console.log('═══════════════════════════════════════════════════════════');

  for (const org of ORGS) {
    await seedOrg(org);
  }

  console.log('\n🎉 Seeding complete! Ready for Caliper benchmarks.\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
