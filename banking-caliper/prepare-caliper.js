const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const keystoreDir = path.resolve(projectRoot, 'fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/keystore');

try {
    const files = fs.readdirSync(keystoreDir);
    const keyFile = files.find(file => !file.startsWith('.') && file.endsWith('_sk'));
    if (!keyFile) {
        throw new Error('No private key file (_sk) found in keystore directory.');
    }
    console.log(`Found private key: ${keyFile}`);

    const configPath = path.resolve(__dirname, 'networks/networkConfig.yaml');
    let configContent = fs.readFileSync(configPath, 'utf8');

    // Resolve absolute paths with standard slashes
    const newPrivateKeyPath = path.resolve(keystoreDir, keyFile).replace(/\\/g, '/');
    const newCertPath = path.resolve(projectRoot, 'fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/signcerts/cert.pem').replace(/\\/g, '/');
    const newProfilePath = path.resolve(projectRoot, 'fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.yaml').replace(/\\/g, '/');

    // Replace the paths in the config file using regex
    configContent = configContent.replace(/path:\s*.*\/keystore\/.*_sk/g, `path: ${newPrivateKeyPath}`);
    configContent = configContent.replace(/path:\s*.*\/signcerts\/cert\.pem/g, `path: ${newCertPath}`);
    configContent = configContent.replace(/path:\s*.*\/connection-org1\.yaml/g, `path: ${newProfilePath}`);

    fs.writeFileSync(configPath, configContent, 'utf8');
    console.log('Successfully updated networks/networkConfig.yaml with current key paths.');
} catch (error) {
    console.error('Failed to prepare Caliper configuration:', error.message);
    process.exit(1);
}
