# Solving the Fabric Concurrency Bottleneck (MVCC Conflicts)

This guide explains the mechanics of Multi-Version Concurrency Control (MVCC) conflicts in Hyperledger Fabric and provides concrete implementations to achieve a high transaction success ratio.

---

## 1. Why Endorsement Policies Do Not Fix MVCC Conflicts

Changing the endorsement policy (e.g. from `AND` to `OR`) **does not resolve MVCC failures**. 
* **Endorsement policies** check *who* signed the transaction (identities and security).
* **MVCC validation** checks *when* the keys were read (version integrity).

In a banking context, if two concurrent transactions attempt to debit `acc1` within the same block window:
1. Both transactions read `acc1` at version $V$ during the endorsement phase.
2. The Orderer packs both transactions into Block $B$.
3. During Validation, the committing peer processes the first transaction, sees that `acc1` is at version $V$, commits it, and advances the key version to $V+1$.
4. The peer then checks the second transaction. It sees the read key version was $V$, but the database now holds version $V+1$. The peer invalidates the second transaction with an `MVCC_READ_CONFLICT` error.

---

## 2. Mitigation Strategy A: SDK Client Auto-Retries (Easiest Fix)

Since MVCC conflicts are transient (they resolve as soon as the client reads the updated state), the most straightforward solution is for the client API gateway to catch the conflict and **automatically retry the submission**.

### JavaScript Auto-Retry Implementation for [index.js](file:///Users/dhavalvarvariya/Downloads/CHARUSAT/D/banking-client/index.js)

We can wrap our Fabric submissions in a retry loop:

```javascript
// Helper wrapper to submit transactions with auto-retries on MVCC conflicts
async function submitTransactionWithRetry(contract, functionName, args, maxRetries = 5, delayMs = 100) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            attempt++;
            const resultBytes = await contract.submitTransaction(functionName, ...args);
            return resultBytes; // Success!
        } catch (error) {
            const errorMessage = error.message.toLowerCase();
            
            // Check if the error is due to MVCC read conflict
            const isMvccConflict = errorMessage.includes('mvcc_read_conflict') || 
                                   errorMessage.includes('read conflict') ||
                                   errorMessage.includes('concurrency');
            
            if (isMvccConflict && attempt < maxRetries) {
                console.warn(`[API Gateway] MVCC Conflict detected on ${functionName} (Attempt ${attempt}/${maxRetries}). Retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                delayMs *= 2; // Exponential backoff
                continue;
            }
            
            // Throw if it is a real business logic error or retries exhausted
            throw error;
        }
    }
}
```

---

## 3. Mitigation Strategy B: Append-Only Transaction Ledger (Architectural Fix)

To scale write throughput without lock contention, we can transition from a **state-modification model** (updating `balance` key) to a **state-addition model** (appending entries).

```mermaid
graph LR
    subgraph State Modification Model (Conflicts)
        A[Tx 1: Modify acc1] -->|Locks| C[(acc1 Key)]
        B[Tx 2: Modify acc1] -->|Conflicts| C
    end
    
    subgraph State Addition Model (No Conflicts)
        D[Tx 1: Debit acc1] -->|Appends| F[(Entry 1)]
        E[Tx 2: Debit acc1] -->|Appends| G[(Entry 2)]
    end
```

### Go Implementation Example for [banking.go](file:///Users/dhavalvarvariya/Downloads/CHARUSAT/D/banking-chaincode/banking.go)

Instead of updating the balance field inside the `Account` struct, we write individual transaction entries using unique composite keys. The account balance is resolved dynamically by querying and summing all entries.

```go
type TransactionEntry struct {
	ObjectType string  `json:"docType"` // "entry"
	AccountID  string  `json:"accountId"`
	EntryID    string  `json:"entryId"` // Unique (e.g. TxID)
	Amount     float64 `json:"amount"`    // Positive for credits, negative for debits
}

// TransferFundsAppend appends entries rather than modifying a shared balance key
func (s *SmartContract) TransferFundsAppend(ctx contractapi.TransactionContextInterface, senderID string, receiverID string, amount float64) error {
	txID := ctx.GetStub().GetTxID()

	// 1. Fetch current balance of sender dynamically (sums all entries)
	senderBalance, err := s.GetBalanceDynamically(ctx, senderID)
	if err != nil {
		return err
	}
	if senderBalance < amount {
		return fmt.Errorf("insufficient funds")
	}

	// 2. Write Debit Entry for Sender (Unique key: entry~accountId~txId)
	debitKey, _ := ctx.GetStub().CreateCompositeKey("entry~accountId~txId", []string{senderID, txID})
	debitEntry := TransactionEntry{
		ObjectType: "entry",
		AccountID:  senderID,
		EntryID:    txID,
		Amount:     -amount,
	}
	debitBytes, _ := json.Marshal(debitEntry)
	err = ctx.GetStub().PutState(debitKey, debitBytes)
	if err != nil {
		return err
	}

	// 3. Write Credit Entry for Receiver
	creditKey, _ := ctx.GetStub().CreateCompositeKey("entry~accountId~txId", []string{receiverID, txID})
	creditEntry := TransactionEntry{
		ObjectType: "entry",
		AccountID:  receiverID,
		EntryID:    txID,
		Amount:     amount,
	}
	creditBytes, _ := json.Marshal(creditEntry)
	return ctx.GetStub().PutState(creditKey, creditBytes)
}

// GetBalanceDynamically aggregates transaction entries
func (s *SmartContract) GetBalanceDynamically(ctx contractapi.TransactionContextInterface, accountID string) (float64, error) {
	resultsIterator, err := ctx.GetStub().GetStateByPartialCompositeKey("entry~accountId~txId", []string{accountID})
	if err != nil {
		return 0.0, err
	}
	defer resultsIterator.Close()

	balance := 0.0
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return 0.0, err
		}
		var entry TransactionEntry
		json.Unmarshal(queryResponse.Value, &entry)
		balance += entry.Amount
	}
	return balance, nil
}
```

* **Result**: Since `PutState` is called only on unique, non-overlapping composite keys (`entry~senderID~txID`), multiple concurrent transactions do not modify the same key version. **MVCC conflicts drop to zero.**
