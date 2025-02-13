import { describe, test, expect } from 'vitest'
import TransactionsAPI from '../dist/AccountsAPI.js'

describe('Account deposit and balance', async () => {

    const api = await TransactionsAPI.open()
    const userID = await api.createUser('Jan Kowalski')

    test("deposit to a user's account", async () => {
        await api.deposit(userID, 1000, 'PLN')
        expect(await api.getBalance(userID, 'PLN')).toBe(1000 - (1000 * api.eaf.serviceFee))
    })

    test('deposit a negative value', async () => {
        // @ts-ignore
        await expect(() => api.deposit(userID, -1000, 'PLN')).rejects.toThrow()
    })

    test('deposit undefined', async () => {
        // @ts-ignore
        await expect(() => api.deposit(userID, undefined, 'PLN')).rejects.toThrow()
    })

    test('deposit unsupported currency', async () => {
        // @ts-ignore
        await expect(() => api.deposit(userID, 1000, 'GBP')).rejects.toThrow()
    })

    test('deposit to unknown user', async () => {
        // @ts-ignore
        await expect(() => api.deposit('be3d0758-65eb-4365-9a2f-cefa294feaf9', 1000, 'GBP')).rejects.toThrow()
    })

    test('inspect leftover transaction logs', async () => {
        const transactions = await api.getTransactionHistory({})
        expect(transactions.length).toBe(1)
        expect(transactions[0]!.user_id!).toBe(userID)
        expect(transactions[0]!.currency!).toBe('PLN')
    })

})