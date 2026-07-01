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
	ID      string  `json:"ID"`
	Owner   string  `json:"Owner"`
	Balance float64 `json:"Balance"`
}

// TransferEvent represents the event details emitted during a transfer
type TransferEvent struct {
	SenderID   string  `json:"senderID"`
	ReceiverID string  `json:"receiverID"`
	Amount     float64 `json:"amount"`
	Timestamp  string  `json:"timestamp"`
}

// TransferResult defines the structure for successful transfer responses
type TransferResult struct {
	Message  string   `json:"Message"`
	Sender   *Account `json:"Sender"`
	Receiver *Account `json:"Receiver"`
}

// InitLedger adds starting accounts to the ledger
func (s *SmartContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	accounts := []Account{
		{ID: "acc1", Owner: "Alice", Balance: 1000.00},
		{ID: "acc2", Owner: "Bob", Balance: 500.00},
		{ID: "acc3", Owner: "Charlie", Balance: 250.00},
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

// CreateAccount creates a new account in the ledger
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
		ID:      id,
		Owner:   owner,
		Balance: initialBalance,
	}

	accountJSON, err := json.Marshal(account)
	if err != nil {
		return fmt.Errorf("failed to marshal account: %w", err)
	}

	return ctx.GetStub().PutState(id, accountJSON)
}

// AccountExists returns true if the account with the given ID exists in the ledger
func (s *SmartContract) AccountExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
	accountJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return false, fmt.Errorf("failed to read from world state: %w", err)
	}

	return accountJSON != nil, nil
}

// GetAccount returns the account stored in the ledger with the given ID
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

// GetAllAccounts returns all accounts found in the ledger
func (s *SmartContract) GetAllAccounts(ctx contractapi.TransactionContextInterface) ([]*Account, error) {
	resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, fmt.Errorf("failed to get state range: %w", err)
	}
	defer resultsIterator.Close()

	var accounts []*Account
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to read next state range item: %w", err)
		}

		var account Account
		err = json.Unmarshal(queryResponse.Value, &account)
		if err != nil {
			return nil, fmt.Errorf("failed to unmarshal account: %w", err)
		}
		accounts = append(accounts, &account)
	}

	return accounts, nil
}

// TransferFunds transfers money from one account to another atomically with verification
func (s *SmartContract) TransferFunds(ctx contractapi.TransactionContextInterface, senderID string, receiverID string, amount float64) (*TransferResult, error) {
	if senderID == receiverID {
		return nil, fmt.Errorf("sender and receiver accounts cannot be the same")
	}

	if amount <= 0 {
		return nil, fmt.Errorf("transfer amount must be greater than zero")
	}

	// 1. Fetch sender account; error "sender account not found" if missing
	senderJSON, err := ctx.GetStub().GetState(senderID)
	if err != nil {
		return nil, fmt.Errorf("failed to read sender from world state: %w", err)
	}
	if senderJSON == nil {
		return nil, fmt.Errorf("sender account not found")
	}

	// 2. Fetch receiver account; error "receiver account not found" if missing
	receiverJSON, err := ctx.GetStub().GetState(receiverID)
	if err != nil {
		return nil, fmt.Errorf("failed to read receiver from world state: %w", err)
	}
	if receiverJSON == nil {
		return nil, fmt.Errorf("receiver account not found")
	}

	var sender Account
	if err := json.Unmarshal(senderJSON, &sender); err != nil {
		return nil, fmt.Errorf("failed to unmarshal sender account: %w", err)
	}

	var receiver Account
	if err := json.Unmarshal(receiverJSON, &receiver); err != nil {
		return nil, fmt.Errorf("failed to unmarshal receiver account: %w", err)
	}

	// 3. Reject if sender.Balance < amount with error "insufficient funds"
	if sender.Balance < amount {
		return nil, fmt.Errorf("insufficient funds")
	}

	// 4. Subtract amount from sender, add amount to receiver
	sender.Balance -= amount
	receiver.Balance += amount

	// 5. Write both updated accounts back to the ledger (atomic)
	updatedSenderJSON, err := json.Marshal(sender)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal updated sender: %w", err)
	}
	err = ctx.GetStub().PutState(senderID, updatedSenderJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to write updated sender to ledger: %w", err)
	}

	updatedReceiverJSON, err := json.Marshal(receiver)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal updated receiver: %w", err)
	}
	err = ctx.GetStub().PutState(receiverID, updatedReceiverJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to write updated receiver to ledger: %w", err)
	}

	// 6. Emit a chaincode event "FundsTransferred" with payload {senderID, receiverID, amount, timestamp}
	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return nil, fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	timestampStr := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

	transferEvent := TransferEvent{
		SenderID:   senderID,
		ReceiverID: receiverID,
		Amount:     amount,
		Timestamp:  timestampStr,
	}

	eventPayload, err := json.Marshal(transferEvent)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal event: %w", err)
	}

	err = ctx.GetStub().SetEvent("FundsTransferred", eventPayload)
	if err != nil {
		return nil, fmt.Errorf("failed to set event: %w", err)
	}

	return &TransferResult{
		Message:  fmt.Sprintf("Successfully transferred %.2f from %s to %s", amount, senderID, receiverID),
		Sender:   &sender,
		Receiver: &receiver,
	}, nil
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
