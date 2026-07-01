import express from 'express';
import * as grpc from '@grpc/grpc-js';
import { connect, signers } from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const utf8Decoder = new TextDecoder();

// Base directories for crypto material from the Fabric test-network
const WORKSPACE_DIR = '/Users/dhavalvarvariya/Downloads/CHARUSAT/D';
const CRYPTO_PATH = path.resolve(WORKSPACE_DIR, 'fabric-samples/test-network/organizations/peerOrganizations/org1.example.com');
const CERT_PATH = path.resolve(CRYPTO_PATH, 'users/User1@org1.example.com/msp/signcerts/cert.pem');
const KEY_DIR_PATH = path.resolve(CRYPTO_PATH, 'users/User1@org1.example.com/msp/keystore');
const TLS_CERT_PATH = path.resolve(CRYPTO_PATH, 'peers/peer0.org1.example.com/tls/ca.crt');

const PEER_ENDPOINT = 'localhost:7051';
const PEER_HOST_ALIAS = 'peer0.org1.example.com';
const CHANNEL_NAME = 'mychannel';
const CHAINCODE_NAME = 'banking';

let contractInstance = null;
let grpcClientInstance = null;
let gatewayInstance = null;

// Initialize gRPC connection and Fabric Gateway client
async function initGateway() {
	try {
		console.log('Initializing connection to Fabric peer...');
		
		// Verify paths exist before proceeding
		await fs.access(CERT_PATH);
		await fs.access(KEY_DIR_PATH);
		await fs.access(TLS_CERT_PATH);

		grpcClientInstance = await newGrpcConnection();
		const identity = await getIdentity();
		const signer = await getSigner();

		gatewayInstance = connect({
			client: grpcClientInstance,
			identity,
			signer,
			// Default timeouts matching common Fabric setups
			evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
			submitOptions: () => ({ deadline: Date.now() + 10000 }),
			commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
		});

		const network = gatewayInstance.getNetwork(CHANNEL_NAME);
		contractInstance = network.getContract(CHAINCODE_NAME);
		console.log('Successfully connected to Fabric gateway and resolved contract!');
	} catch (error) {
		console.error('Failed to initialize Fabric Gateway:', error.message);
		console.error('Make sure the Fabric test-network is running and crypto paths are correct.');
	}
}

async function newGrpcConnection() {
	const tlsCACert = await fs.readFile(TLS_CERT_PATH);
	const tlsCredentials = grpc.credentials.createSsl(tlsCACert);
	return new grpc.Client(PEER_ENDPOINT, tlsCredentials, {
		'grpc.ssl_target_name_override': PEER_HOST_ALIAS,
		'grpc.default_authority': PEER_HOST_ALIAS,
	});
}

async function getIdentity() {
	const credentials = await fs.readFile(CERT_PATH);
	return { mspId: 'Org1MSP', credentials };
}

async function getSigner() {
	const files = await fs.readdir(KEY_DIR_PATH);
	// Select the first private key file that isn't hidden
	const keyFile = files.find(file => !file.startsWith('.') && file.endsWith('_sk'));
	if (!keyFile) {
		// Fallback to first non-hidden file if naming convention is different
		const fallbackFile = files.find(file => !file.startsWith('.'));
		if (!fallbackFile) {
			throw new Error(`No private key file found in ${KEY_DIR_PATH}`);
		}
		return buildPrivateKeySigner(path.join(KEY_DIR_PATH, fallbackFile));
	}
	return buildPrivateKeySigner(path.join(KEY_DIR_PATH, keyFile));
}

async function buildPrivateKeySigner(keyPath) {
	const privateKeyPem = await fs.readFile(keyPath);
	const privateKey = crypto.createPrivateKey(privateKeyPem);
	return signers.newPrivateKeySigner(privateKey);
}

// Middleware to ensure gateway is active before handling requests
const checkConnection = (req, res, next) => {
	if (!contractInstance) {
		return res.status(503).json({
			success: false,
			error: 'Fabric Gateway client is not connected. Ensure the Fabric network is running.'
		});
	}
	next();
};

function getErrorMessage(error) {
	if (error.details && Array.isArray(error.details) && error.details.length > 0) {
		return error.details.map(d => d.message).join('; ');
	}
	return error.message || String(error);
}

// REST API Endpoints

// GET /accounts -> Get all accounts
app.get('/accounts', checkConnection, async (req, res) => {
	try {
		console.log('Querying all accounts...');
		const resultBytes = await contractInstance.evaluateTransaction('GetAllAccounts');
		const resultString = utf8Decoder.decode(resultBytes);
		
		// If empty or null response
		if (!resultString) {
			return res.json([]);
		}
		
		const accounts = JSON.parse(resultString);
		res.json(accounts);
	} catch (error) {
		console.error('Error fetching accounts:', error);
		res.status(500).json({
			success: false,
			error: getErrorMessage(error)
		});
	}
});

// GET /accounts/:id -> Get specific account details
app.get('/accounts/:id', checkConnection, async (req, res) => {
	const accountId = req.params.id;
	try {
		console.log(`Querying account: ${accountId}`);
		const resultBytes = await contractInstance.evaluateTransaction('GetAccount', accountId);
		const account = JSON.parse(utf8Decoder.decode(resultBytes));
		res.json(account);
	} catch (error) {
		console.error(`Error fetching account ${accountId}:`, error);
		const errorMessage = getErrorMessage(error);
		
		let status = 500;
		if (errorMessage.includes('does not exist') || errorMessage.includes('not found')) {
			status = 404;
		}
		
		res.status(status).json({
			success: false,
			error: errorMessage
		});
	}
});

// POST /transfer -> Transfer funds between accounts
app.post('/transfer', checkConnection, async (req, res) => {
	const { senderID, receiverID, amount } = req.body;

	if (!senderID || !receiverID || amount === undefined) {
		return res.status(400).json({
			success: false,
			error: 'Missing required parameters. Body must include senderID, receiverID, and amount.'
		});
	}

	if (typeof amount !== 'number') {
		return res.status(400).json({
			success: false,
			error: 'Amount must be a numeric value.'
		});
	}

	try {
		console.log(`Submitting transfer transaction: ${amount} from ${senderID} to ${receiverID}`);
		
		// Fabric Gateway contract.submitTransaction returns the transaction payload
		const resultBytes = await contractInstance.submitTransaction(
			'TransferFunds',
			senderID,
			receiverID,
			amount.toString()
		);
		
		const transferResult = JSON.parse(utf8Decoder.decode(resultBytes));
		res.json({
			success: true,
			data: transferResult
		});
	} catch (error) {
		console.error('Transfer transaction failed:', error);
		const errorMessage = getErrorMessage(error);
		
		let status = 500;
		// Categorize typical business validation failures as 400 Bad Request
		if (
			errorMessage.includes('insufficient funds') ||
			errorMessage.includes('not found') ||
			errorMessage.includes('cannot be the same') ||
			errorMessage.includes('greater than zero')
		) {
			status = 400;
		}

		res.status(status).json({
			success: false,
			error: errorMessage
		});
	}
});

// Clean up connections on process termination
process.on('SIGINT', async () => {
	console.log('\nGracefully shutting down client...');
	if (gatewayInstance) {
		gatewayInstance.close();
		console.log('Fabric Gateway connection closed.');
	}
	if (grpcClientInstance) {
		grpcClientInstance.close();
		console.log('gRPC client connection closed.');
	}
	process.exit(0);
});

// Initialize connection and start server
initGateway().then(() => {
	app.listen(port, () => {
		console.log(`Banking Client API server is running on http://localhost:${port}`);
	});
});
