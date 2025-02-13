import { describe, test, expect } from 'vitest'
import TransactionsAPI from '../dist/AccountsAPI.js'

describe('Account profits', async () => {

    const api = await TransactionsAPI.open()
    const user1 = await api.createUser('Adam Kowalski')
    const user2 = await api.createUser('Ewa Kowalska')
    const user3 = await api.createUser('Tom Kowalski')

    await api.deposit(user1, 1000, 'PLN')
    await api.deposit(user2, 1500, 'USD')
    await api.exchange(user1, 500, 'PLN', 'USD')
    await api.transfer(user1, user2, 20, 'USD')
    await api.transfer(user2, user1, 5, 'USD')
    await api.withdraw(user1, 1, 'USD')
    await api.deposit(user3, 1000, 'PLN')

    test('User with deposits', async () => {
        expect((await api.getUserProfits({ userID: user3 })).transactions).toHaveLength(1)
    })

    test('User with deposits/transfers', async () => {
        expect((await api.getUserProfits({ userID: user2 })).transactions).toHaveLength(3)
    })

    test('User with deposits/transfers/withdrawals', async () => {
        expect((await api.getUserProfits({ userID: user1 })).transactions).toHaveLength(5)
    })

})