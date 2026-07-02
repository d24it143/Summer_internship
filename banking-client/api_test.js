// API Integration Test Suite for the Banking Fabric Client
// Running on native Node.js fetch (Node 18+)

const BASE_URL = 'http://localhost:5001';

async function runTests() {
    console.log('==================================================');
    console.log('🚀 STARTING FABRIC BANKING API INTEGRATION TESTS');
    console.log('==================================================\n');

    let passedTests = 0;
    let failedTests = 0;

    async function assertTest(name, fn) {
        try {
            await fn();
            console.log(`✅ PASSED: ${name}`);
            passedTests++;
        } catch (error) {
            console.error(`❌ FAILED: ${name}`);
            console.error(`   Error details: ${error.message}`);
            failedTests++;
        }
    }

    // 1. Reset/Initialize Ledger
    await assertTest('POST /init - Initialize Ledger', async () => {
        const res = await fetch(`${BASE_URL}/init`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(`Status ${res.status}: ${data.error}`);
        if (!data.success) throw new Error(`Response failed: ${JSON.stringify(data)}`);
        console.log('   Ledger initialized successfully.');
    });

    // 2. Fetch all accounts
    let accountsAfterInit = [];
    await assertTest('GET /accounts - Fetch all accounts', async () => {
        const res = await fetch(`${BASE_URL}/accounts`);
        const data = await res.json();
        if (!res.ok) throw new Error(`Status ${res.status}: ${data.error}`);
        if (!Array.isArray(data)) throw new Error('Response is not an array');
        accountsAfterInit = data;
        console.log(`   Found ${data.length} accounts:`, data.map(a => `${a.ID} (${a.Owner}): $${a.Balance}`).join(', '));
        
        // Assert base accounts exist with correct balances
        const acc1 = data.find(a => a.ID === 'acc1');
        const acc2 = data.find(a => a.ID === 'acc2');
        const acc3 = data.find(a => a.ID === 'acc3');
        if (!acc1 || acc1.Balance !== 1000) throw new Error('acc1 mismatch or balance is not 1000');
        if (!acc2 || acc2.Balance !== 500) throw new Error('acc2 mismatch or balance is not 500');
        if (!acc3 || acc3.Balance !== 250) throw new Error('acc3 mismatch or balance is not 250');
    });

    // 3. Query single account
    await assertTest('GET /accounts/:id - Fetch single account (acc1)', async () => {
        const res = await fetch(`${BASE_URL}/accounts/acc1`);
        const data = await res.json();
        if (!res.ok) throw new Error(`Status ${res.status}: ${data.error}`);
        if (data.ID !== 'acc1' || data.Owner !== 'Alice' || data.Balance !== 1000) {
            throw new Error(`Data mismatch: ${JSON.stringify(data)}`);
        }
    });

    // 4. Query single non-existent account
    await assertTest('GET /accounts/:id - Error on non-existent account', async () => {
        const res = await fetch(`${BASE_URL}/accounts/nonexistent`);
        const data = await res.json();
        if (res.status !== 404) throw new Error(`Expected status 404, got ${res.status}`);
        if (data.success !== false || !data.error) throw new Error(`Expected error response, got: ${JSON.stringify(data)}`);
        console.log(`   Correctly received 404: "${data.error}"`);
    });

    // 5. Create new account
    const uniqueAccId = `test_acc_${Date.now()}`;
    await assertTest(`POST /accounts - Create account (${uniqueAccId})`, async () => {
        const body = { id: uniqueAccId, owner: 'David', balance: 350 };
        const res = await fetch(`${BASE_URL}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Status ${res.status}: ${data.error}`);
        if (!data.success) throw new Error(`Response failed: ${JSON.stringify(data)}`);
        
        // Verify creation
        const getRes = await fetch(`${BASE_URL}/accounts/${uniqueAccId}`);
        const getVal = await getRes.json();
        if (getVal.Owner !== 'David' || getVal.Balance !== 350) {
            throw new Error(`Account data mismatch: ${JSON.stringify(getVal)}`);
        }
        console.log('   Account successfully created and verified.');
    });

    // 6. Create account validation (Negative balance)
    await assertTest('POST /accounts - Error on negative initial balance', async () => {
        const body = { id: 'test_acc2', owner: 'Emma', balance: -100 };
        const res = await fetch(`${BASE_URL}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.status !== 500) throw new Error(`Expected status 500, got ${res.status}`);
        if (data.success !== false || !data.error || !data.error.includes('cannot be negative')) {
            throw new Error(`Expected error "cannot be negative", got: ${JSON.stringify(data)}`);
        }
        console.log(`   Correctly rejected negative balance: "${data.error}"`);
    });

    // 7. Successful fund transfer
    await assertTest('POST /transfer - Successful transfer (150.50 from acc1 to acc2)', async () => {
        const body = { senderID: 'acc1', receiverID: 'acc2', amount: 150.50 };
        const res = await fetch(`${BASE_URL}/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Status ${res.status}: ${data.error}`);
        if (!data.success || !data.data) throw new Error(`Response failed: ${JSON.stringify(data)}`);
        
        // Check returned balances
        const result = data.data;
        if (result.Sender.Balance !== 849.50) throw new Error(`Expected sender balance 849.50, got ${result.Sender.Balance}`);
        if (result.Receiver.Balance !== 650.50) throw new Error(`Expected receiver balance 650.50, got ${result.Receiver.Balance}`);

        // Verify ledger state
        const getAcc1 = await (await fetch(`${BASE_URL}/accounts/acc1`)).json();
        const getAcc2 = await (await fetch(`${BASE_URL}/accounts/acc2`)).json();
        if (getAcc1.Balance !== 849.50 || getAcc2.Balance !== 650.50) {
            throw new Error(`Ledger mismatch: acc1=${getAcc1.Balance}, acc2=${getAcc2.Balance}`);
        }
        console.log(`   Transfer completed. Alice balance: $${getAcc1.Balance}, Bob balance: $${getAcc2.Balance}`);
    });

    // 8. Transfer validation (Insufficient funds)
    await assertTest('POST /transfer - Error on insufficient funds', async () => {
        const body = { senderID: 'acc1', receiverID: 'acc2', amount: 1200 };
        const res = await fetch(`${BASE_URL}/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.status !== 400) throw new Error(`Expected status 400, got ${res.status}`);
        if (data.success !== false || !data.error || !data.error.includes('insufficient funds')) {
            throw new Error(`Expected error "insufficient funds", got: ${JSON.stringify(data)}`);
        }
        console.log(`   Correctly rejected insufficient funds: "${data.error}"`);
    });

    // 9. Transfer validation (Same accounts)
    await assertTest('POST /transfer - Error on transferring to same account', async () => {
        const body = { senderID: 'acc1', receiverID: 'acc1', amount: 10 };
        const res = await fetch(`${BASE_URL}/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.status !== 400) throw new Error(`Expected status 400, got ${res.status}`);
        if (data.success !== false || !data.error || !data.error.includes('cannot be the same')) {
            throw new Error(`Expected error "cannot be the same", got: ${JSON.stringify(data)}`);
        }
        console.log(`   Correctly rejected same account transfer: "${data.error}"`);
    });

    // 10. Transfer validation (Negative amount)
    await assertTest('POST /transfer - Error on negative amount transfer', async () => {
        const body = { senderID: 'acc1', receiverID: 'acc2', amount: -50 };
        const res = await fetch(`${BASE_URL}/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.status !== 400) throw new Error(`Expected status 400, got ${res.status}`);
        if (data.success !== false || !data.error || !data.error.includes('greater than zero')) {
            throw new Error(`Expected error "greater than zero", got: ${JSON.stringify(data)}`);
        }
        console.log(`   Correctly rejected negative transfer: "${data.error}"`);
    });

    // 11. Transfer validation (Invalid sender)
    await assertTest('POST /transfer - Error on non-existent sender', async () => {
        const body = { senderID: 'missing_acc', receiverID: 'acc2', amount: 50 };
        const res = await fetch(`${BASE_URL}/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.status !== 400) throw new Error(`Expected status 400, got ${res.status}`);
        if (data.success !== false || !data.error || !data.error.includes('sender account not found')) {
            throw new Error(`Expected error "sender account not found", got: ${JSON.stringify(data)}`);
        }
        console.log(`   Correctly rejected non-existent sender: "${data.error}"`);
    });

    // 12. Transfer validation (Invalid receiver)
    await assertTest('POST /transfer - Error on non-existent receiver', async () => {
        const body = { senderID: 'acc1', receiverID: 'missing_acc', amount: 50 };
        const res = await fetch(`${BASE_URL}/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.status !== 400) throw new Error(`Expected status 400, got ${res.status}`);
        if (data.success !== false || !data.error || !data.error.includes('receiver account not found')) {
            throw new Error(`Expected error "receiver account not found", got: ${JSON.stringify(data)}`);
        }
        console.log(`   Correctly rejected non-existent receiver: "${data.error}"`);
    });

    console.log('\n==================================================');
    console.log(`📊 TESTS SUMMARY:`);
    console.log(`   Passed: ${passedTests}`);
    console.log(`   Failed: ${failedTests}`);
    console.log('==================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Fatal testing error:', err);
    process.exit(2);
});
