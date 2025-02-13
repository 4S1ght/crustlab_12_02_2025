import { describe, test, expect } from 'vitest'
import TransactionsAPI from '../dist/AccountsAPI.js'

describe('Withdraws', async () => {

    const api = await TransactionsAPI.open()
    const userID = await api.createUser('Adam Kowalski')

    const deposited = 1000
    const exchanged = 500

    await api.deposit(userID, deposited, 'PLN')
    await api.exchange(userID, exchanged, 'PLN', 'USD')
    const rate = api.eaf.exchangeRates.USD

    test('exchange from PLN to USD', async () => {
        const balancePLN = await api.getBalance(userID, 'PLN')
        const balanceUSD = await api.getBalance(userID, 'USD')

        expect(balancePLN).toBe(
            deposited - (deposited * api.eaf.serviceFee) - // after deposit fee
            exchanged - (exchanged * api.eaf.serviceFee)   // after withdraw fee
        )
        expect(balanceUSD).toBe(exchanged * rate)
    })


    test('inspect leftover transaction logs', async () => {
        const transactions = await api.getTransactionHistory({})
        expect(transactions.length).toBe(2)
    })

})