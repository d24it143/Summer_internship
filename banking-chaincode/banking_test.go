package main

import (
	"crypto/x509"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/golang/protobuf/ptypes/timestamp"
	"github.com/hyperledger/fabric-chaincode-go/pkg/cid"
	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/stretchr/testify/mock"
)

// MockChaincodeStub mocks the shim.ChaincodeStubInterface
type MockChaincodeStub struct {
	shim.ChaincodeStubInterface
	mock.Mock
}

func (m *MockChaincodeStub) GetState(key string) ([]byte, error) {
	args := m.Called(key)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]byte), args.Error(1)
}

func (m *MockChaincodeStub) PutState(key string, value []byte) error {
	args := m.Called(key, value)
	return args.Error(0)
}

func (m *MockChaincodeStub) CreateCompositeKey(objectType string, attributes []string) (string, error) {
	return objectType + "_" + attributes[0] + "_" + attributes[1], nil
}

func (m *MockChaincodeStub) GetTxID() string {
	return "mock_tx_id"
}

func (m *MockChaincodeStub) GetTxTimestamp() (*timestamp.Timestamp, error) {
	return &timestamp.Timestamp{Seconds: 123456, Nanos: 0}, nil
}

// MockClientIdentity mocks the cid.ClientIdentity interface
type MockClientIdentity struct {
	mock.Mock
	MSPID      string
	Attributes map[string]string
}

func (m *MockClientIdentity) GetID() (string, error) {
	return "mock_id", nil
}

func (m *MockClientIdentity) GetMSPID() (string, error) {
	return m.MSPID, nil
}

func (m *MockClientIdentity) GetAttributeValue(name string) (string, bool, error) {
	val, ok := m.Attributes[name]
	return val, ok, nil
}

func (m *MockClientIdentity) AssertAttributeValue(name string, value string) error {
	val, ok := m.Attributes[name]
	if !ok || val != value {
		return fmt.Errorf("incorrect attribute value")
	}
	return nil
}

func (m *MockClientIdentity) GetX509Certificate() (*x509.Certificate, error) {
	return nil, nil
}

// MockTransactionContext mocks the contractapi.TransactionContextInterface
type MockTransactionContext struct {
	contractapi.TransactionContextInterface
	mock.Mock
	stub           shim.ChaincodeStubInterface
	clientIdentity cid.ClientIdentity
}

func (m *MockTransactionContext) GetStub() shim.ChaincodeStubInterface {
	return m.stub
}

func (m *MockTransactionContext) GetClientIdentity() cid.ClientIdentity {
	return m.clientIdentity
}

func TestCreateAccount(t *testing.T) {
	stub := new(MockChaincodeStub)
	ctx := new(MockTransactionContext)
	ctx.stub = stub

	stub.On("GetState", "acc10").Return(nil, nil)
	stub.On("PutState", "acc10", mock.Anything).Return(nil)

	contract := new(SmartContract)
	err := contract.CreateAccount(ctx, "acc10", "Dave", 1500.0)
	if err != nil {
		t.Fatalf("Failed to create account: %v", err)
	}

	stub.AssertExpectations(t)
}

func TestGetAccount(t *testing.T) {
	stub := new(MockChaincodeStub)
	ctx := new(MockTransactionContext)
	ctx.stub = stub

	account := Account{
		ObjectType: "account",
		ID:         "acc1",
		Owner:      "Alice",
		Balance:    1000.0,
		KYCStatus:  "Approved",
		IsFrozen:   false,
	}
	accountBytes, _ := json.Marshal(account)

	stub.On("GetState", "acc1").Return(accountBytes, nil)

	contract := new(SmartContract)
	res, err := contract.GetAccount(ctx, "acc1")
	if err != nil {
		t.Fatalf("Failed to get account: %v", err)
	}

	if res.Owner != "Alice" || res.Balance != 1000.0 {
		t.Errorf("Incorrect account details returned")
	}

	stub.AssertExpectations(t)
}

func TestTransferFunds(t *testing.T) {
	stub := new(MockChaincodeStub)
	ctx := new(MockTransactionContext)
	ctx.stub = stub

	acc1 := Account{ObjectType: "account", ID: "acc1", Owner: "Alice", Balance: 1000.0, KYCStatus: "Approved", IsFrozen: false}
	acc2 := Account{ObjectType: "account", ID: "acc2", Owner: "Bob", Balance: 500.0, KYCStatus: "Approved", IsFrozen: false}

	bytes1, _ := json.Marshal(acc1)
	bytes2, _ := json.Marshal(acc2)

	stub.On("GetState", "acc1").Return(bytes1, nil)
	stub.On("GetState", "acc2").Return(bytes2, nil)
	stub.On("PutState", "acc1", mock.Anything).Return(nil)
	stub.On("PutState", "acc2", mock.Anything).Return(nil)
	stub.On("PutState", "account~txID_acc1_mock_tx_id", mock.Anything).Return(nil)
	stub.On("PutState", "account~txID_acc2_mock_tx_id", mock.Anything).Return(nil)

	contract := new(SmartContract)
	err := contract.TransferFunds(ctx, "acc1", "acc2", 200.0)
	if err != nil {
		t.Fatalf("Failed to transfer funds: %v", err)
	}
}

func TestUpdateKYCStatus_Authorized(t *testing.T) {
	stub := new(MockChaincodeStub)
	ctx := new(MockTransactionContext)
	ctx.stub = stub

	clientIdentity := &MockClientIdentity{
		MSPID:      "BankAMSP",
		Attributes: map[string]string{"role": "branch_manager"},
	}
	ctx.clientIdentity = clientIdentity

	account := Account{ObjectType: "account", ID: "acc1", Owner: "Alice", Balance: 1000.0, KYCStatus: "Pending", IsFrozen: false}
	accountBytes, _ := json.Marshal(account)

	stub.On("GetState", "acc1").Return(accountBytes, nil)
	stub.On("PutState", "acc1", mock.Anything).Return(nil)

	contract := new(SmartContract)
	err := contract.UpdateKYCStatus(ctx, "acc1", "Approved")
	if err != nil {
		t.Fatalf("Authorized user failed to update KYC: %v", err)
	}
}

func TestUpdateKYCStatus_Unauthorized(t *testing.T) {
	stub := new(MockChaincodeStub)
	ctx := new(MockTransactionContext)
	ctx.stub = stub

	clientIdentity := &MockClientIdentity{
		MSPID:      "BankAMSP",
		Attributes: map[string]string{"role": "teller"},
	}
	ctx.clientIdentity = clientIdentity

	contract := new(SmartContract)
	err := contract.UpdateKYCStatus(ctx, "acc1", "Approved")
	if err == nil {
		t.Fatalf("Expected unauthorized error, got nil")
	}
}
