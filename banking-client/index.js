import express from 'express';
import * as grpc from '@grpc/grpc-js';
import { connect, signers } from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

const app = express();
const port = process.env.PORT || 3000;
const utf8Decoder = new TextDecoder();

app.use(express.json());

const WORKSPACE_DIR = '/Users/dhavalvarvariya/Downloads/CHARUSAT/D';
const CHANNEL_NAME = 'bankingchannel';
const CHAINCODE_NAME = 'banking';

// Helper to locate private key
async function getPrivateKey(keyDirPath) {
	const files = await fs.readdir(keyDirPath);
	const keyFile = files.find(file => !file.startsWith('.') && file.endsWith('_sk'));
	if (!keyFile) {
		const fallbackFile = files.find(file => !file.startsWith('.'));
		if (!fallbackFile) {
			throw new Error(`No private key file found in ${keyDirPath}`);
		}
		return path.join(keyDirPath, fallbackFile);
	}
	return path.join(keyDirPath, keyFile);
}

// Dynamically create a connection context based on requested Org and Role
async function getContract(orgName, roleName) {
	let peerAddress = 'localhost:7051';
	let peerHostAlias = 'peer0.banka.example.com';
	let mspId = 'BankAMSP';
	let orgFolder = 'banka.example.com';
	let userFolder = 'User1@banka.example.com'; // Default user

	// Map Org & Role to the corresponding crypto directories
	if (orgName === 'BankB') {
		peerAddress = 'localhost:9051';
		peerHostAlias = 'peer0.bankb.example.com';
		mspId = 'BankBMSP';
		orgFolder = 'bankb.example.com';
		if (roleName === 'branch_manager') {
			userFolder = 'Manager@bankb.example.com';
		} else {
			userFolder = 'User1@bankb.example.com';
		}
	} else if (orgName === 'RegulatorOrg') {
		peerAddress = 'localhost:11051';
		peerHostAlias = 'peer0.regulator.example.com';
		mspId = 'RegulatorOrgMSP';
		orgFolder = 'regulator.example.com';
		if (roleName === 'compliance_officer') {
			userFolder = 'Compliance@regulator.example.com';
		} else {
			userFolder = 'User1@regulator.example.com';
		}
	} else {
		// Default to BankA
		if (roleName === 'branch_manager') {
			userFolder = 'Manager@banka.example.com';
		} else if (roleName === 'teller') {
			userFolder = 'Teller@banka.example.com';
		}
	}

	const cryptoPath = path.resolve(WORKSPACE_DIR, `banking-network/crypto-config/peerOrganizations/${orgFolder}`);
	const certPath = path.resolve(cryptoPath, `users/${userFolder}/msp/signcerts/cert.pem`);
	const keyDirPath = path.resolve(cryptoPath, `users/${userFolder}/msp/keystore`);
	const tlsCertPath = path.resolve(cryptoPath, `peers/${peerHostAlias}/tls/ca.crt`);

	// Verify crypto exists
	try {
		await fs.access(certPath);
		await fs.access(keyDirPath);
		await fs.access(tlsCertPath);
	} catch (e) {
		// Fallback to Fabric test-network Org1 if custom banking-network does not exist yet (for local verification)
		const fallbackCrypto = path.resolve(WORKSPACE_DIR, 'fabric-samples/test-network/organizations/peerOrganizations/org1.example.com');
		return getFallbackContract(fallbackCrypto);
	}

	const tlsCACert = await fs.readFile(tlsCertPath);
	const tlsCredentials = grpc.credentials.createSsl(tlsCACert);
	const grpcClient = new grpc.Client(peerAddress, tlsCredentials, {
		'grpc.ssl_target_name_override': peerHostAlias,
		'grpc.default_authority': peerHostAlias,
	});

	const credentials = await fs.readFile(certPath);
	const identity = { mspId, credentials };

	const privateKeyPath = await getPrivateKey(keyDirPath);
	const privateKeyPem = await fs.readFile(privateKeyPath);
	const privateKey = crypto.createPrivateKey(privateKeyPem);
	const signer = signers.newPrivateKeySigner(privateKey);

	const gateway = connect({
		client: grpcClient,
		identity,
		signer,
		evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
		submitOptions: () => ({ deadline: Date.now() + 10000 }),
		commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
	});

	const network = gateway.getNetwork(CHANNEL_NAME);
	return {
		contract: network.getContract(CHAINCODE_NAME),
		gateway,
		grpcClient
	};
}

// Fallback helper using default Fabric test-network certificates
async function getFallbackContract(fallbackCrypto) {
	const certPath = path.resolve(fallbackCrypto, 'users/User1@org1.example.com/msp/signcerts/cert.pem');
	const keyDirPath = path.resolve(fallbackCrypto, 'users/User1@org1.example.com/msp/keystore');
	const tlsCertPath = path.resolve(fallbackCrypto, 'peers/peer0.org1.example.com/tls/ca.crt');

	const tlsCACert = await fs.readFile(tlsCertPath);
	const tlsCredentials = grpc.credentials.createSsl(tlsCACert);
	const grpcClient = new grpc.Client('localhost:7051', tlsCredentials, {
		'grpc.ssl_target_name_override': 'peer0.org1.example.com',
		'grpc.default_authority': 'peer0.org1.example.com',
	});

	const credentials = await fs.readFile(certPath);
	const identity = { mspId: 'Org1MSP', credentials };

	const privateKeyPath = await getPrivateKey(keyDirPath);
	const privateKeyPem = await fs.readFile(privateKeyPath);
	const privateKey = crypto.createPrivateKey(privateKeyPem);
	const signer = signers.newPrivateKeySigner(privateKey);

	const gateway = connect({
		client: grpcClient,
		identity,
		signer,
	});

	const network = gateway.getNetwork('mychannel');
	return {
		contract: network.getContract(CHAINCODE_NAME),
		gateway,
		grpcClient
	};
}

// Middleware to inject context based on headers
async function getContext(req, res, next) {
	const org = req.headers['x-org'] || 'BankA';
	const role = req.headers['x-role'] || 'teller';
	try {
		const ctxObj = await getContract(org, role);
		req.fabric = ctxObj;
		next();
	} catch (error) {
		res.status(500).json({ success: false, error: `Connection failed: ${error.message}` });
	}
}

// Cleanup helper
function closeConnections(fabricCtx) {
	if (fabricCtx) {
		if (fabricCtx.gateway) fabricCtx.gateway.close();
		if (fabricCtx.grpcClient) fabricCtx.grpcClient.close();
	}
}

// REST Endpoints

// 1. Create Account
app.post('/accounts', getContext, async (req, res) => {
	const { id, owner, balance } = req.body;
	try {
		await req.fabric.contract.submitTransaction('CreateAccount', id, owner, balance.toString());
		res.status(201).json({ success: true, message: `Account ${id} created successfully` });
	} catch (error) {
		res.status(400).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 2. Fetch Account
app.get('/accounts/:id', getContext, async (req, res) => {
	const id = req.params.id;
	try {
		const resultBytes = await req.fabric.contract.evaluateTransaction('GetAccount', id);
		const account = JSON.parse(utf8Decoder.decode(resultBytes));
		res.json(account);
	} catch (error) {
		res.status(404).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 3. Update KYC Status (ABAC checked)
app.post('/accounts/:id/kyc', getContext, async (req, res) => {
	const id = req.params.id;
	const { status } = req.body;
	try {
		await req.fabric.contract.submitTransaction('UpdateKYCStatus', id, status);
		res.json({ success: true, message: `KYC status of ${id} set to ${status}` });
	} catch (error) {
		res.status(403).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 4. Freeze Account (ABAC checked)
app.post('/accounts/:id/freeze', getContext, async (req, res) => {
	const id = req.params.id;
	try {
		await req.fabric.contract.submitTransaction('FreezeAccount', id);
		res.json({ success: true, message: `Account ${id} has been frozen` });
	} catch (error) {
		res.status(403).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 5. Transfer Funds
app.post('/transfer', getContext, async (req, res) => {
	const { senderID, receiverID, amount } = req.body;
	try {
		await req.fabric.contract.submitTransaction('TransferFunds', senderID, receiverID, amount.toString());
		res.json({ success: true, message: `Successfully transferred ${amount} from ${senderID} to ${receiverID}` });
	} catch (error) {
		res.status(400).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 6. Deposit Funds
app.post('/deposit', getContext, async (req, res) => {
	const { id, amount } = req.body;
	try {
		await req.fabric.contract.submitTransaction('DepositFunds', id, amount.toString());
		res.json({ success: true, message: `Deposited ${amount} to account ${id}` });
	} catch (error) {
		res.status(400).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 7. Withdraw Funds
app.post('/withdraw', getContext, async (req, res) => {
	const { id, amount } = req.body;
	try {
		await req.fabric.contract.submitTransaction('WithdrawFunds', id, amount.toString());
		res.json({ success: true, message: `Withdrew ${amount} from account ${id}` });
	} catch (error) {
		res.status(400).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 8. Get Account Transaction History
app.get('/accounts/:id/history', getContext, async (req, res) => {
	const id = req.params.id;
	try {
		const resultBytes = await req.fabric.contract.evaluateTransaction('GetTransactionHistory', id);
		const records = JSON.parse(utf8Decoder.decode(resultBytes));
		res.json(records);
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 9. Create Loan Application
app.post('/loans', getContext, async (req, res) => {
	const { id, applicantID, amount } = req.body;
	try {
		await req.fabric.contract.submitTransaction('CreateLoanApplication', id, applicantID, amount.toString());
		res.status(201).json({ success: true, message: `Loan application ${id} created for ${applicantID}` });
	} catch (error) {
		res.status(400).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 10. Approve Loan (ABAC Checked)
app.post('/loans/:id/approve', getContext, async (req, res) => {
	const id = req.params.id;
	try {
		await req.fabric.contract.submitTransaction('ApproveLoan', id);
		res.json({ success: true, message: `Loan application ${id} approved by caller` });
	} catch (error) {
		res.status(403).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 11. Disburse Loan
app.post('/loans/:id/disburse', getContext, async (req, res) => {
	const id = req.params.id;
	try {
		await req.fabric.contract.submitTransaction('DisburseLoan', id);
		res.json({ success: true, message: `Loan ${id} disbursed successfully` });
	} catch (error) {
		res.status(400).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 12. Flag Suspicious Transaction (ABAC Checked)
app.post('/transactions/:txID/flag', getContext, async (req, res) => {
	const txID = req.params.txID;
	const { accountID } = req.body;
	try {
		await req.fabric.contract.submitTransaction('FlagSuspiciousTransaction', accountID, txID);
		res.json({ success: true, message: `Transaction ${txID} flagged as suspicious` });
	} catch (error) {
		res.status(403).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 13. Audit Trail (RegulatorOrg only)
app.get('/audit', getContext, async (req, res) => {
	const query = req.query.query || '{"selector":{"docType":"transaction"}}';
	try {
		const resultBytes = await req.fabric.contract.evaluateTransaction('GetAuditTrail', query);
		const trail = JSON.parse(utf8Decoder.decode(resultBytes));
		res.json(trail);
	} catch (error) {
		res.status(403).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 14. Upload KYC Private Document
app.post('/accounts/:id/kycdoc', getContext, async (req, res) => {
	const id = req.params.id;
	const { fullName, nationalId, documentHash } = req.body;

	const kycData = JSON.stringify({
		accountId: id,
		fullName,
		nationalId,
		documentHash
	});

	try {
		// Use transient data map for private data to protect PII
		const transaction = req.fabric.contract.newProposal('UploadKYCDocument', {
			arguments: [id],
			transientData: {
				kycData: Buffer.from(kycData)
			}
		});

		const resultBytes = await transaction.submit();
		res.json({ success: true, message: `Private KYC document uploaded for account ${id}` });
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

// 15. Read KYC Private Document
app.get('/accounts/:id/kycdoc', getContext, async (req, res) => {
	const id = req.params.id;
	try {
		const resultBytes = await req.fabric.contract.evaluateTransaction('ReadKYCDocument', id);
		const kyc = JSON.parse(utf8Decoder.decode(resultBytes));
		res.json(kyc);
	} catch (error) {
		res.status(404).json({ success: false, error: error.message });
	} finally {
		closeConnections(req.fabric);
	}
});

app.listen(port, () => {
	console.log(`Enterprise Banking Gateway running on http://localhost:${port}`);
});
