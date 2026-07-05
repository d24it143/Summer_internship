package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SmartContract defines the structure for our banking smart contract
type SmartContract struct {
	contractapi.Contract
}

// Account represents a bank account in the ledger
type Account struct {
	ObjectType string  `json:"docType"` // "account"
	ID         string  `json:"id"`
	Owner      string  `json:"owner"`
	Balance    float64 `json:"balance"`
	KYCStatus  string  `json:"kycStatus"` // e.g., "Pending", "Approved", "Rejected"
	IsFrozen   bool    `json:"isFrozen"`
}

// TransactionRecord represents a transaction log stored using composite keys
type TransactionRecord struct {
	ObjectType   string  `json:"docType"` // "transaction"
	AccountID    string  `json:"accountId"`
	TxID         string  `json:"txId"`
	Type         string  `json:"type"` // "Deposit", "Withdraw", "TransferIn", "TransferOut", "LoanDisbursement"
	Counterparty string  `json:"counterparty,omitempty"`
	Amount       float64 `json:"amount"`
	Timestamp    string  `json:"timestamp"`
	Status       string  `json:"status"` // "Normal", "Suspicious"
}

// LoanApplication represents a loan request
type LoanApplication struct {
	ObjectType  string          `json:"docType"` // "loan"
	ID          string          `json:"id"`
	ApplicantID string          `json:"applicantId"`
	Amount      float64         `json:"amount"`
	Approvals   map[string]bool `json:"approvals"` // MSP ID -> Approved (true/false)
	Status      string          `json:"status"`    // "Pending", "Approved", "Disbursed"
}

// KYCData represents client private details saved in the Private Data Collection
type KYCData struct {
	AccountID    string `json:"accountId"`
	FullName     string `json:"fullName"`
	NationalID   string `json:"nationalId"`
	DocumentHash string `json:"documentHash"`
}

// Helper to check identity attribute (ABAC)
func checkAttribute(ctx contractapi.TransactionContextInterface, attributeName string, expectedValue string) error {
	val, ok, err := ctx.GetClientIdentity().GetAttributeValue(attributeName)
	if err != nil {
		return fmt.Errorf("failed to retrieve attribute %s: %w", attributeName, err)
	}
	if !ok || val != expectedValue {
		return fmt.Errorf("identity authorization failed: attribute '%s' must be '%s', got '%s'", attributeName, expectedValue, val)
	}
	return nil
}

// Helper to check if identity belongs to a list of allowed roles (ABAC)
func checkAnyAttributeValue(ctx contractapi.TransactionContextInterface, attributeName string, expectedValues []string) error {
	val, ok, err := ctx.GetClientIdentity().GetAttributeValue(attributeName)
	if err != nil {
		return fmt.Errorf("failed to retrieve attribute %s: %w", attributeName, err)
	}
	if !ok {
		return fmt.Errorf("identity authorization failed: missing attribute %s", attributeName)
	}
	for _, expected := range expectedValues {
		if val == expected {
			return nil
		}
	}
	return fmt.Errorf("identity authorization failed: attribute '%s' was '%s', which is not in allowed roles %v", attributeName, val, expectedValues)
}

// InitLedger adds starting accounts to the ledger
func (s *SmartContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	accounts := []Account{
		{ObjectType: "account", ID: "acc1", Owner: "Alice", Balance: 1000.00, KYCStatus: "Approved", IsFrozen: false},
		{ObjectType: "account", ID: "acc2", Owner: "Bob", Balance: 500.00, KYCStatus: "Approved", IsFrozen: false},
		{ObjectType: "account", ID: "acc3", Owner: "Charlie", Balance: 250.00, KYCStatus: "Pending", IsFrozen: false},
	}

	for _, account := range accounts {
		accountJSON, err := json.Marshal(account)
		if err != nil {
			return fmt.Errorf("failed to marshal account: %w", err)
		}
		err = ctx.GetStub().PutState(account.ID, accountJSON)
		if err != nil {
			return fmt.Errorf("failed to put account to world state: %w", err)
		}
	}
	return nil
}

// CreateAccount creates a new bank account in the ledger
func (s *SmartContract) CreateAccount(ctx contractapi.TransactionContextInterface, id string, owner string, initialBalance float64) error {
	if initialBalance < 0 {
		return fmt.Errorf("initial balance cannot be negative")
	}

	exists, err := s.AccountExists(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to check account existence: %w", err)
	}
	if exists {
		return fmt.Errorf("the account %s already exists", id)
	}

	account := Account{
		ObjectType: "account",
		ID:         id,
		Owner:      owner,
		Balance:    initialBalance,
		KYCStatus:  "Pending",
		IsFrozen:   false,
	}

	accountJSON, err := json.Marshal(account)
	if err != nil {
		return fmt.Errorf("failed to marshal account: %w", err)
	}

	return ctx.GetStub().PutState(id, accountJSON)
}

// AccountExists returns true if the account with the given ID exists
func (s *SmartContract) AccountExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
	accountJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return false, fmt.Errorf("failed to read from world state: %w", err)
	}
	return accountJSON != nil, nil
}

// GetAccount returns the account details
func (s *SmartContract) GetAccount(ctx contractapi.TransactionContextInterface, id string) (*Account, error) {
	accountJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return nil, fmt.Errorf("failed to read from world state: %w", err)
	}
	if accountJSON == nil {
		return nil, fmt.Errorf("the account %s does not exist", id)
	}

	var account Account
	err = json.Unmarshal(accountJSON, &account)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal account: %w", err)
	}
	return &account, nil
}

// UpdateKYCStatus modifies the KYC verification status of an account (ABAC restricted)
func (s *SmartContract) UpdateKYCStatus(ctx contractapi.TransactionContextInterface, id string, status string) error {
	// Only branch_manager or compliance_officer can update KYC status
	err := checkAnyAttributeValue(ctx, "role", []string{"branch_manager", "compliance_officer"})
	if err != nil {
		return err
	}

	account, err := s.GetAccount(ctx, id)
	if err != nil {
		return err
	}

	account.KYCStatus = status
	accountJSON, err := json.Marshal(account)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, accountJSON)
}

// FreezeAccount blocks an account from debits (ABAC restricted)
func (s *SmartContract) FreezeAccount(ctx contractapi.TransactionContextInterface, id string) error {
	// Only branch_manager or compliance_officer can freeze accounts
	err := checkAnyAttributeValue(ctx, "role", []string{"branch_manager", "compliance_officer"})
	if err != nil {
		return err
	}

	account, err := s.GetAccount(ctx, id)
	if err != nil {
		return err
	}

	account.IsFrozen = true
	accountJSON, err := json.Marshal(account)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, accountJSON)
}

// UnfreezeAccount unfreezes a blocked account (ABAC restricted)
func (s *SmartContract) UnfreezeAccount(ctx contractapi.TransactionContextInterface, id string) error {
	err := checkAnyAttributeValue(ctx, "role", []string{"branch_manager", "compliance_officer"})
	if err != nil {
		return err
	}

	account, err := s.GetAccount(ctx, id)
	if err != nil {
		return err
	}

	account.IsFrozen = false
	accountJSON, err := json.Marshal(account)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, accountJSON)
}

// DepositFunds credits money to an account
func (s *SmartContract) DepositFunds(ctx contractapi.TransactionContextInterface, id string, amount float64) error {
	if amount <= 0 {
		return fmt.Errorf("deposit amount must be greater than zero")
	}

	account, err := s.GetAccount(ctx, id)
	if err != nil {
		return err
	}

	account.Balance += amount
	accountJSON, err := json.Marshal(account)
	if err != nil {
		return err
	}

	err = ctx.GetStub().PutState(id, accountJSON)
	if err != nil {
		return err
	}

	// Create and save composite transaction history record
	txTimestamp, _ := ctx.GetStub().GetTxTimestamp()
	timestampStr := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	record := TransactionRecord{
		ObjectType: "transaction",
		AccountID:  id,
		TxID:       txID,
		Type:       "Deposit",
		Amount:     amount,
		Timestamp:  timestampStr,
		Status:     "Normal",
	}

	return s.saveTransactionRecord(ctx, record)
}

// WithdrawFunds debits money from an account
func (s *SmartContract) WithdrawFunds(ctx contractapi.TransactionContextInterface, id string, amount float64) error {
	if amount <= 0 {
		return fmt.Errorf("withdrawal amount must be greater than zero")
	}

	account, err := s.GetAccount(ctx, id)
	if err != nil {
		return err
	}

	if account.IsFrozen {
		return fmt.Errorf("account is frozen, cannot withdraw funds")
	}

	if account.Balance < amount {
		return fmt.Errorf("insufficient funds")
	}

	account.Balance -= amount
	accountJSON, err := json.Marshal(account)
	if err != nil {
		return err
	}

	err = ctx.GetStub().PutState(id, accountJSON)
	if err != nil {
		return err
	}

	txTimestamp, _ := ctx.GetStub().GetTxTimestamp()
	timestampStr := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	record := TransactionRecord{
		ObjectType: "transaction",
		AccountID:  id,
		TxID:       txID,
		Type:       "Withdraw",
		Amount:     amount,
		Timestamp:  timestampStr,
		Status:     "Normal",
	}

	return s.saveTransactionRecord(ctx, record)
}

// TransferFunds moves funds between accounts and creates composite log histories
func (s *SmartContract) TransferFunds(ctx contractapi.TransactionContextInterface, senderID string, receiverID string, amount float64) error {
	if senderID == receiverID {
		return fmt.Errorf("sender and receiver accounts cannot be the same")
	}
	if amount <= 0 {
		return fmt.Errorf("transfer amount must be greater than zero")
	}

	sender, err := s.GetAccount(ctx, senderID)
	if err != nil {
		return err
	}
	if sender.IsFrozen {
		return fmt.Errorf("sender account is frozen")
	}
	if sender.Balance < amount {
		return fmt.Errorf("insufficient funds")
	}

	receiver, err := s.GetAccount(ctx, receiverID)
	if err != nil {
		return err
	}
	if receiver.IsFrozen {
		return fmt.Errorf("receiver account is frozen")
	}

	sender.Balance -= amount
	receiver.Balance += amount

	senderJSON, _ := json.Marshal(sender)
	err = ctx.GetStub().PutState(senderID, senderJSON)
	if err != nil {
		return err
	}

	receiverJSON, _ := json.Marshal(receiver)
	err = ctx.GetStub().PutState(receiverID, receiverJSON)
	if err != nil {
		return err
	}

	txTimestamp, _ := ctx.GetStub().GetTxTimestamp()
	timestampStr := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	// Save Sender History (TransferOut)
	senderRecord := TransactionRecord{
		ObjectType:   "transaction",
		AccountID:    senderID,
		TxID:         txID,
		Type:         "TransferOut",
		Counterparty: receiverID,
		Amount:       amount,
		Timestamp:    timestampStr,
		Status:       "Normal",
	}
	err = s.saveTransactionRecord(ctx, senderRecord)
	if err != nil {
		return err
	}

	// Save Receiver History (TransferIn)
	receiverRecord := TransactionRecord{
		ObjectType:   "transaction",
		AccountID:    receiverID,
		TxID:         txID,
		Type:         "TransferIn",
		Counterparty: senderID,
		Amount:       amount,
		Timestamp:    timestampStr,
		Status:       "Normal",
	}
	return s.saveTransactionRecord(ctx, receiverRecord)
}

// saveTransactionRecord inserts history log using composite keys
func (s *SmartContract) saveTransactionRecord(ctx contractapi.TransactionContextInterface, record TransactionRecord) error {
	recordJSON, err := json.Marshal(record)
	if err != nil {
		return err
	}

	// Create composite key: account~txID
	compositeKey, err := ctx.GetStub().CreateCompositeKey("account~txID", []string{record.AccountID, record.TxID})
	if err != nil {
		return fmt.Errorf("failed to create composite key: %w", err)
	}

	return ctx.GetStub().PutState(compositeKey, recordJSON)
}

// GetTransactionHistory fetches transaction records for an account using composite keys
func (s *SmartContract) GetTransactionHistory(ctx contractapi.TransactionContextInterface, accountID string) ([]*TransactionRecord, error) {
	resultsIterator, err := ctx.GetStub().GetStateByPartialCompositeKey("account~txID", []string{accountID})
	if err != nil {
		return nil, fmt.Errorf("failed to read composite keys range: %w", err)
	}
	defer resultsIterator.Close()

	var records []*TransactionRecord
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		var record TransactionRecord
		err = json.Unmarshal(queryResponse.Value, &record)
		if err != nil {
			return nil, err
		}
		records = append(records, &record)
	}
	return records, nil
}

// CreateLoanApplication files a loan application
func (s *SmartContract) CreateLoanApplication(ctx contractapi.TransactionContextInterface, id string, applicantID string, amount float64) error {
	if amount <= 0 {
		return fmt.Errorf("loan amount must be greater than zero")
	}

	exists, err := ctx.GetStub().GetState(id)
	if err != nil {
		return err
	}
	if exists != nil {
		return fmt.Errorf("loan application %s already exists", id)
	}

	applicantExists, err := s.AccountExists(ctx, applicantID)
	if err != nil || !applicantExists {
		return fmt.Errorf("applicant account does not exist")
	}

	loan := LoanApplication{
		ObjectType:  "loan",
		ID:          id,
		ApplicantID: applicantID,
		Amount:      amount,
		Approvals:   make(map[string]bool),
		Status:      "Pending",
	}

	loanJSON, err := json.Marshal(loan)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, loanJSON)
}

// ApproveLoan registers approvals from branch managers (ABAC restricted)
func (s *SmartContract) ApproveLoan(ctx contractapi.TransactionContextInterface, id string) error {
	// Only branch_manager can approve loan
	err := checkAttribute(ctx, "role", "branch_manager")
	if err != nil {
		return err
	}

	loanJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return err
	}
	if loanJSON == nil {
		return fmt.Errorf("loan application %s does not exist", id)
	}

	var loan LoanApplication
	err = json.Unmarshal(loanJSON, &loan)
	if err != nil {
		return err
	}

	if loan.Status != "Pending" {
		return fmt.Errorf("loan is not in pending status")
	}

	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}

	loan.Approvals[mspID] = true

	// Check if we have approvals from both the Commercial Bank (BankA or BankB) AND the Regulator
	// (Simplifying check to verify we have approvals from BankAMSP/BankBMSP AND RegulatorOrgMSP)
	hasBankApproval := loan.Approvals["BankAMSP"] || loan.Approvals["BankBMSP"]
	hasRegulatorApproval := loan.Approvals["RegulatorOrgMSP"]

	if hasBankApproval && hasRegulatorApproval {
		loan.Status = "Approved"
	}

	updatedLoanJSON, err := json.Marshal(loan)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, updatedLoanJSON)
}

// DisburseLoan releases funds to approved loan applicants
func (s *SmartContract) DisburseLoan(ctx contractapi.TransactionContextInterface, id string) error {
	loanJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return err
	}
	if loanJSON == nil {
		return fmt.Errorf("loan application %s does not exist", id)
	}

	var loan LoanApplication
	err = json.Unmarshal(loanJSON, &loan)
	if err != nil {
		return err
	}

	if loan.Status != "Approved" {
		return fmt.Errorf("cannot disburse loan: status is not Approved, currently '%s'", loan.Status)
	}

	account, err := s.GetAccount(ctx, loan.ApplicantID)
	if err != nil {
		return err
	}

	account.Balance += loan.Amount
	accountJSON, _ := json.Marshal(account)
	err = ctx.GetStub().PutState(loan.ApplicantID, accountJSON)
	if err != nil {
		return err
	}

	loan.Status = "Disbursed"
	updatedLoanJSON, _ := json.Marshal(loan)
	err = ctx.GetStub().PutState(id, updatedLoanJSON)
	if err != nil {
		return err
	}

	// Log transaction record
	txTimestamp, _ := ctx.GetStub().GetTxTimestamp()
	timestampStr := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	record := TransactionRecord{
		ObjectType: "transaction",
		AccountID:  loan.ApplicantID,
		TxID:       txID,
		Type:       "LoanDisbursement",
		Amount:     loan.Amount,
		Timestamp:  timestampStr,
		Status:     "Normal",
	}

	return s.saveTransactionRecord(ctx, record)
}

// FlagSuspiciousTransaction marks a transaction record as suspicious (ABAC restricted)
func (s *SmartContract) FlagSuspiciousTransaction(ctx contractapi.TransactionContextInterface, accountID string, txID string) error {
	// Only compliance_officer can flag transactions
	err := checkAttribute(ctx, "role", "compliance_officer")
	if err != nil {
		return err
	}

	compositeKey, err := ctx.GetStub().CreateCompositeKey("account~txID", []string{accountID, txID})
	if err != nil {
		return err
	}

	recordJSON, err := ctx.GetStub().GetState(compositeKey)
	if err != nil {
		return err
	}
	if recordJSON == nil {
		return fmt.Errorf("transaction record not found for account %s and tx %s", accountID, txID)
	}

	var record TransactionRecord
	err = json.Unmarshal(recordJSON, &record)
	if err != nil {
		return err
	}

	record.Status = "Suspicious"
	updatedRecordJSON, err := json.Marshal(record)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(compositeKey, updatedRecordJSON)
}

// GetAuditTrail executes a CouchDB rich query to fetch transaction logs (RegulatorOrg only)
func (s *SmartContract) GetAuditTrail(ctx contractapi.TransactionContextInterface, queryString string) ([]*TransactionRecord, error) {
	// Only RegulatorOrg can retrieve audit trail
	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return nil, err
	}
	if mspID != "RegulatorOrgMSP" {
		return nil, fmt.Errorf("unauthorized organization: audit trail is only accessible by RegulatorOrg")
	}

	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, fmt.Errorf("failed to execute rich query: %w", err)
	}
	defer resultsIterator.Close()

	var records []*TransactionRecord
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		var record TransactionRecord
		err = json.Unmarshal(queryResponse.Value, &record)
		if err != nil {
			return nil, err
		}
		records = append(records, &record)
	}
	return records, nil
}

// UploadKYCDocument uploads customer identity documents securely via Private Data Collections
func (s *SmartContract) UploadKYCDocument(ctx contractapi.TransactionContextInterface, accountID string) error {
	// Retrieve from the transient map
	transientMap, err := ctx.GetStub().GetTransient()
	if err != nil {
		return fmt.Errorf("error getting transient map: %w", err)
	}

	kycDataBytes, ok := transientMap["kycData"]
	if !ok {
		return fmt.Errorf("kycData was not found in the transient map")
	}

	var kyc KYCData
	err = json.Unmarshal(kycDataBytes, &kyc)
	if err != nil {
		return fmt.Errorf("failed to unmarshal transient kyc data: %w", err)
	}

	if kyc.AccountID != accountID {
		return fmt.Errorf("transient account ID does not match path argument")
	}

	// Verify account exists
	exists, err := s.AccountExists(ctx, accountID)
	if err != nil || !exists {
		return fmt.Errorf("associated account does not exist")
	}

	// Put into private collection
	return ctx.GetStub().PutPrivateData("kycPrivateCollection", accountID, kycDataBytes)
}

// ReadKYCDocument retrieves PII documents from private collection
func (s *SmartContract) ReadKYCDocument(ctx contractapi.TransactionContextInterface, accountID string) (*KYCData, error) {
	kycDataBytes, err := ctx.GetStub().GetPrivateData("kycPrivateCollection", accountID)
	if err != nil {
		return nil, fmt.Errorf("failed to read private data: %w", err)
	}
	if kycDataBytes == nil {
		return nil, fmt.Errorf("private KYC record not found for account %s", accountID)
	}

	var kyc KYCData
	err = json.Unmarshal(kycDataBytes, &kyc)
	if err != nil {
		return nil, err
	}
	return &kyc, nil
}

func main() {
	bankingContract := new(SmartContract)
	cc, err := contractapi.NewChaincode(bankingContract)
	if err != nil {
		log.Panicf("Error creating banking chaincode: %v", err)
	}

	if err := cc.Start(); err != nil {
		log.Panicf("Error starting banking chaincode: %v", err)
	}
}
