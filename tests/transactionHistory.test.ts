import { describe, test, expect } from 'vitest'
import TransactionsAPI from '../dist/AccountsAPI.js'

describe('Transaction history', async () => {

    const api = await TransactionsAPI.open()
    const user1 = await api.createUser('Adam Kowalski')
    const user2 = await api.createUser('Ewa Kowalska')

    await api.deposit(user1, 1000, 'PLN')
    await api.deposit(user2, 1500, 'USD')
    await api.exchange(user1, 500, 'PLN', 'USD')
    await api.transfer(user1, user2, 20, 'USD')

    test('get by user ID', async () => {
        expect(await api.getTransactionHistory({ userID: user1 })).toHaveLength(3)
        expect(await api.getTransactionHistory({ userID: user2 })).toHaveLength(1)
    })
    test('get by currency', async () => {
        expect(await api.getTransactionHistory({ currency: 'PLN' })).toHaveLength(2)
    })
    test('get by amount range', async () => {
        expect(await api.getTransactionHistory({ minAmount: 500,  maxAmount: 1600 })).toHaveLength(3)
        expect(await api.getTransactionHistory({ minAmount: 1001, maxAmount: 1500 })).toHaveLength(1)
        expect(await api.getTransactionHistory({ minAmount: 1000, maxAmount: 1499 })).toHaveLength(1)
    })
    test('get by transaction type', async () => {
        expect(await api.getTransactionHistory({ transactionType: 'deposit' })).toHaveLength(2)
        expect(await api.getTransactionHistory({ transactionType: 'exchange' })).toHaveLength(1)
        expect(await api.getTransactionHistory({ transactionType: 'transfer' })).toHaveLength(1)
    })
    test('get by date range', async () => {
        const someTimeFromNow = Math.floor(Date.now()/1000) + 5 * 60
        const someTimeAgo     = Math.floor(Date.now()/1000) - 5 * 60
        expect(await api.getTransactionHistory({ startDate: someTimeFromNow })).toHaveLength(0)
        expect(await api.getTransactionHistory({ startDate: someTimeAgo })).toHaveLength(4)
        expect(await api.getTransactionHistory({ endDate: someTimeFromNow })).toHaveLength(4)
        expect(await api.getTransactionHistory({ endDate: someTimeAgo })).toHaveLength(0)
    })

})