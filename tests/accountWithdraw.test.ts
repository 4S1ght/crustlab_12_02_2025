import { describe, test, expect } from 'vitest'
import TransactionsAPI from '../dist/AccountsAPI.js'

describe('Withdraws', async () => {

    const api = await TransactionsAPI.open()
    const userID = await api.createUser('Adam Kowalski')

    await api.deposit(userID, 1000, 'PLN')
    await api.deposit(userID, 1000, 'USD')

    const deposited = 1000 - (1000 * api.eaf.serviceFee)

    test("withdraw from a user's account (PLN)", async () => {
        expect(await api.withdraw(userID, 500, 'PLN')).toBe(500)
        const account = await api.getAccount(userID, 'PLN')
        expect(account.balance).toBe(deposited - (500 + 500 * api.eaf.serviceFee))
    })

    test("withdraw from a user's account (USD)", async () => {
        expect(await api.withdraw(userID, 500, 'USD'))
        const account = await api.getAccount(userID, 'USD')
        expect(account.balance).toBe(deposited - (500 + 500 * api.eaf.serviceFee))
    })

    test('inspect leftover transaction logs', async () => {
        const transactions = await api.getTransactionHistory({})
        expect(transactions.length).toBe(4)
    })

})