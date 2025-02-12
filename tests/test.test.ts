import { describe, test, expect } from 'vitest'
import sqlite from 'sqlite3'
import Database from '../dist/Database.js'

test('sqlite', async () => {

    const db = await Database.open()

    await db.run('BEGIN TRANSACTION')
    
    await db.run(/*sql*/`
        CREATE TABLE tests (
            id              TEXT PRIMARY KEY,
            name            TEXT,
            user_created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `)

    await db.run('ROLLBACK')


})