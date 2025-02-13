import { describe, test, expect } from 'vitest'
import TransactionsAPI from '../dist/AccountsAPI.js'

describe('User creation & retrieval', async () => {

    const api = await TransactionsAPI.open()

    test('create valid user', async () => {
        // Create the user
        const userID = await api.createUser('Anna Kowalska')
        expect(typeof userID).toBe('string')

        // Retrieve the new user
        const user = await api.getUser(userID)
        expect(user.id).toBe(userID)
        expect(user.name).toBe('Anna Kowalska')
        expect(user.user_created_at).toBeInstanceOf(Date)
    })

    test('create an invalid user', async () => {
        // @ts-ignore
        await expect(() => api.createUser()).rejects.toThrow()
        // @ts-ignore
        await expect(() => api.createUser(123)).rejects.toThrow()
        // @ts-ignore
        await expect(() => api.createUser('')).rejects.toThrow()
    })

    test('retrieve a non-existent user', async () => {
        const user2 = await api.getUser("be3d0758-65eb-4365-9a2f-cefa294feaf9")
        expect(user2).toBeUndefined()
    })

    test('retrieve a non-existent user (invalid ID)', async () => {
        await expect(() => api.getUser("invalid-user-id")).rejects.toThrow()
    })

})