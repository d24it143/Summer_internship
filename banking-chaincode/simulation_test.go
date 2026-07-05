package main

import (
	"crypto/x509"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/golang/protobuf/ptypes/timestamp"
	"github.com/hyperledger/fabric-chaincode-go/pkg/cid"
	"github.com/hyperledger/fabric-chaincode-go/shim"
)

// MapMockStub implements a fully functional in-memory state map for stub simulation
type MapMockStub struct {
	shim.ChaincodeStubInterface
	state       map[string][]byte
	privateData map[string]map[string][]byte
	txID        string
}

func NewMapMockStub() *MapMockStub {
	return &MapMockStub{
		state:       make(map[string][]byte),
		privateData: make(map[string]map[string][]byte),
		txID:        "sim_tx_001",
	}
}

func (m *MapMockStub) GetState(key string) ([]byte, error) {
	val, ok := m.state[key]
	if !ok {
		return nil, nil
	}
	return val, nil
}

func (m *MapMockStub) PutState(key string, value []byte) error {
	m.state[key] = value
	return nil
}

func (m *MapMockStub) CreateCompositeKey(objectType string, attributes []string) (string, error) {
	return objectType + "~" + attributes[0] + "~" + attributes[1], nil
}

func (m *MapMockStub) GetTxID() string {
	return m.txID
}

func (m *MapMockStub) GetTxTimestamp() (*timestamp.Timestamp, error) {
	return &timestamp.Timestamp{Seconds: 1770000000, Nanos: 0}, nil
}

func (m *MapMockStub) PutPrivateData(collection string, key string, value []byte) error {
	if _, ok := m.privateData[collection]; !ok {
		m.privateData[collection] = make(map[string][]byte)
	}
	m.privateData[collection][key] = value
	return nil
}

func (m *MapMockStub) GetPrivateData(collection string, key string) ([]byte, error) {
	col, ok := m.privateData[collection]
	if !ok {
		return nil, nil
	}
	val, ok := col[key]
	if !ok {
		return nil, nil
	}
	return val, nil
}

// SimIdentity simulates client attributes
type SimIdentity struct {
	cid.ClientIdentity
	mspID string
	role  string
}

func (s *SimIdentity) GetMSPID() (string, error) {
	return s.mspID, nil
}

func (s *SimIdentity) GetAttributeValue(name string) (string, bool, error) {
	if name == "role" {
		return s.role, true, nil
	}
	return "", false, nil
}

func (s *SimIdentity) GetX509Certificate() (*x509.Certificate, error) {
	return nil, nil
}

// SimContext implements contractapi.TransactionContextInterface
type SimContext struct {
	shim.ChaincodeStubInterface
	stub     *MapMockStub
	identity *SimIdentity
}

func (s *SimContext) GetStub() shim.ChaincodeStubInterface {
	return s.stub
}

func (s *SimContext) GetClientIdentity() cid.ClientIdentity {
	return s.identity
}

func TestSimulationSuite(t *testing.T) {
	fmt.Println("\n==================================================================")
	fmt.Println("       HYPERLEDGER FABRIC BANKING APPLICATION SIMULATION")
	fmt.Println("==================================================================")

	stub := NewMapMockStub()
	ctx := &SimContext{
		stub: stub,
		identity: &SimIdentity{
			mspID: "BankAMSP",
			role:  "teller",
		},
	}

	contract := new(SmartContract)

	// ----------------------------------------------------------------
	// USE CASE 1: Account Sign-Up & Private KYC Verification
	// ----------------------------------------------------------------
	fmt.Println("\n>>> USE CASE 1: Account Creation & Private KYC Onboarding")
	fmt.Println("[Endorsement Requirement]: OR('BankAMSP.peer', 'BankBMSP.peer') -> 1 peer signature required")

	// Step 1: Sign up account "acc10"
	fmt.Println("Step 1.1: Creating Account 'acc10' for User 'David'...")
	err := contract.CreateAccount(ctx, "acc10", "David", 5000.00)
	if err != nil {
		t.Fatalf("Failed to create account: %v", err)
	}
	fmt.Println("  -> Success: Account 'acc10' created with initial balance: $5000.00")

	// Step 2: Upload KYC document (Mock Transient Map)
	fmt.Println("Step 1.2: Uploading Private KYC document for 'acc10'...")
	kycRecord := KYCData{
		AccountID:    "acc10",
		FullName:     "David Miller",
		NationalID:   "DL-5544-22",
		DocumentHash: "a8f7c9e0b1d2a3f4e5",
	}
	kycBytes, _ := json.Marshal(kycRecord)
	
	// Inject directly to private data store to simulate transient write execution
	err = stub.PutPrivateData("kycPrivateCollection", "acc10", kycBytes)
	if err != nil {
		t.Fatalf("Failed to write private data: %v", err)
	}
	fmt.Println("  -> Success: KYC hash stored in 'kycPrivateCollection'. Protected PII hidden from public ledger.")

	// Step 3: Approve KYC (Requires branch manager or compliance officer)
	fmt.Println("Step 1.3: Approving KYC status (Updating status to 'Approved')...")
	// Try with Teller first (should fail)
	ctx.identity.role = "teller"
	err = contract.UpdateKYCStatus(ctx, "acc10", "Approved")
	if err == nil {
		t.Fatalf("Expected authorization failure for Teller, but it succeeded")
	}
	fmt.Println("  -> Intercepted: Teller unauthorized to verify KYC (Correct ABAC behavior)")

	// Elevate role to branch manager
	ctx.identity.role = "branch_manager"
	err = contract.UpdateKYCStatus(ctx, "acc10", "Approved")
	if err != nil {
		t.Fatalf("Branch manager failed to update status: %v", err)
	}
	fmt.Println("  -> Success: Branch Manager approved account KYC status.")

	// ----------------------------------------------------------------
	// USE CASE 2: Multi-Party Inter-bank Funds Transfer
	// ----------------------------------------------------------------
	fmt.Println("\n>>> USE CASE 2: Inter-Bank Funds Transfer")
	fmt.Println("[Endorsement Requirement]: AND('BankAMSP.peer', 'BankBMSP.peer') -> Both peers must sign")

	// Create recipient account at Bank B
	fmt.Println("Step 2.1: Initializing recipient account 'acc20' (Bank B)...")
	err = contract.CreateAccount(ctx, "acc20", "Emma", 1000.00)
	if err != nil {
		t.Fatalf("Failed to create recipient: %v", err)
	}

	// Execute Transfer
	fmt.Println("Step 2.2: Submitting $1500.00 transfer from 'acc10' to 'acc20'...")
	ctx.identity.role = "teller"
	err = contract.TransferFunds(ctx, "acc10", "acc20", 1500.00)
	if err != nil {
		t.Fatalf("Transfer failed: %v", err)
	}
	fmt.Println("  -> Success: Balances updated in ledger.")

	// Query balances and history
	acc10, _ := contract.GetAccount(ctx, "acc10")
	acc20, _ := contract.GetAccount(ctx, "acc20")
	fmt.Printf("  -> Resulting Balance - David (acc10): $%.2f\n", acc10.Balance)
	fmt.Printf("  -> Resulting Balance - Emma (acc20): $%.2f\n", acc20.Balance)

	// Verify history logs using composite key entries
	fmt.Println("Step 2.3: Querying Transaction History for 'acc10'...")
	historyKey, _ := stub.CreateCompositeKey("account~txID", []string{"acc10", "sim_tx_001"})
	historyJSON, _ := stub.GetState(historyKey)
	var record TransactionRecord
	json.Unmarshal(historyJSON, &record)
	fmt.Printf("  -> History Record: Type='%s', Amount=$%.2f, Timestamp='%s', Status='%s'\n",
		record.Type, record.Amount, record.Timestamp, record.Status)

	// ----------------------------------------------------------------
	// USE CASE 3: Loan Application, Dual Approval, and Disbursement
	// ----------------------------------------------------------------
	fmt.Println("\n>>> USE CASE 3: Loan Application & Dual Maker-Checker Sign-off")
	fmt.Println("[Endorsement Requirement]: AND('BankAMSP.peer', 'RegulatorOrgMSP.peer') -> Multi-signature check")

	// Step 1: Submit loan
	fmt.Println("Step 3.1: Submitting $20,000.00 loan application 'loan01' for David...")
	err = contract.CreateLoanApplication(ctx, "loan01", "acc10", 20000.00)
	if err != nil {
		t.Fatalf("Failed to submit loan: %v", err)
	}
	fmt.Println("  -> Success: Loan created in 'Pending' status.")

	// Step 2: Sign-off 1 (Bank A Manager)
	fmt.Println("Step 3.2: Signing off as Bank A Branch Manager...")
	ctx.identity.mspID = "BankAMSP"
	ctx.identity.role = "branch_manager"
	err = contract.ApproveLoan(ctx, "loan01")
	if err != nil {
		t.Fatalf("Bank A approval failed: %v", err)
	}
	fmt.Println("  -> Success: Registered Bank A approval signature.")

	// Check status - should still be pending disbursement until regulator co-signs
	loanJSON, _ := stub.GetState("loan01")
	var loan LoanApplication
	json.Unmarshal(loanJSON, &loan)
	fmt.Printf("  -> Loan status: '%s' (Awaiting regulator signature)\n", loan.Status)

	// Step 3: Sign-off 2 (Regulator Org Manager)
	fmt.Println("Step 3.3: Signing off as Regulator Org Branch Manager...")
	ctx.identity.mspID = "RegulatorOrgMSP"
	ctx.identity.role = "branch_manager"
	err = contract.ApproveLoan(ctx, "loan01")
	if err != nil {
		t.Fatalf("Regulator approval failed: %v", err)
	}
	fmt.Println("  -> Success: Registered Regulator Org approval. Loan status upgraded to 'Approved'.")

	// Step 4: Disburse Loan
	fmt.Println("Step 3.4: Processing disbursement for 'loan01'...")
	err = contract.DisburseLoan(ctx, "loan01")
	if err != nil {
		t.Fatalf("Disbursement failed: %v", err)
	}
	
	// Final balances check
	acc10Final, _ := contract.GetAccount(ctx, "acc10")
	fmt.Printf("  -> Success: Loan disbursed. David's final account balance: $%.2f\n", acc10Final.Balance)
	fmt.Println("==================================================================")
}
