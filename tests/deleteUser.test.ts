import { describe, test, expect } from 'vitest'
import TransactionsAPI from '../dist/AccountsAPI.js'

describe('User deletion', async () => {

    const api = await TransactionsAPI.open()

    test('delete a user', async () => {
        const userID = await api.createUser('Danuta Kowalska')
        await api.deleteUser(userID)
        expect(await api.getUser(userID)).toBeUndefined()
    })

    test('delete a non-existing user', async () => {
        expect(await api.getUser("be3d0758-65eb-4365-9a2f-cefa294feaf9")).toBeUndefined()
    })
    
    test('delete a user using an invalid ID', async () => {
        // @ts-ignore
        await expect(() => api.deleteUser()).rejects.toThrow()
        // @ts-ignore
        await expect(() => api.deleteUser(123)).rejects.toThrow()
        // @ts-ignore
        await expect(() => api.deleteUser('')).rejects.toThrow()
    })

})