// Imports ========================================================================================

import sqlite3 from "sqlite3"

// Types ==========================================================================================

type TSQLParams = Array<string | number> | Record<string, any>

// Exports ========================================================================================

/**
 * A class initializing and preparing the sqlite3 database and wrapping
 * some of its methods inside async handlers.
 */
export default class Database {

    private declare db: sqlite3.Database
    private constructor() {}

    /**
     * Opens the internal SQLite 3 database.  
     */
    public static async open() {

        const self = new this()

        if (process.env.NODE_ENV === 'development') sqlite3.verbose()

        await new Promise<void>((resolve, reject) => {
            self.db = new sqlite3.Database(':memory:', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, error => {
                error ? reject(error) : resolve()
            })
        })

        await new Promise<void>((resolve, reject) => {
            self.db.exec(/*sql*/`

                PRAGMA foreign_keys = ON;

                CREATE TABLE users (
                    id              TEXT PRIMARY KEY,
                    name            TEXT,
                    user_created_at INTEGER DEFAULT (STRFTIME('%s', 'now'))
                );

                CREATE TABLE accounts (
                    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id              TEXT NOT NULL,
                    currency             TEXT CHECK(currency IN ('USD', 'EUR', 'PLN')) NOT NULL,
                    balance              INTEGER NOT NULL DEFAULT 0,
                    created_at           INTEGER DEFAULT (STRFTIME('%s', 'now')),
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE transactions (
                    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id              TEXT NOT NULL,
                    issuer_account_id    INTEGER NOT NULL,  -- Account from which the transaction was made
                    recipient_account_id INTEGER,           -- Account to which the transaction was made - nullable for withdrawals & exchanges
                    transaction_type     TEXT CHECK(transaction_type in ('deposit', 'withdrawal', 'transfer', 'exchange')) NOT NULL,
                    amount               INTEGER NOT NULL,
                    currency             TEXT CHECK(currency IN ('USD', 'EUR', 'PLN')) NOT NULL,
                    target_currency      TEXT CHECK(currency IN ('USD', 'EUR', 'PLN')),
                    made_at              INTEGER DEFAULT (STRFTIME('%s', 'now'))
                );

                CREATE TRIGGER create_accounts_after_user_insert
                AFTER INSERT ON users
                BEGIN
                    INSERT INTO accounts (user_id, currency, balance) VALUES (NEW.id, 'PLN', 0);
                    INSERT INTO accounts (user_id, currency, balance) VALUES (NEW.id, 'USD', 0);
                    INSERT INTO accounts (user_id, currency, balance) VALUES (NEW.id, 'EUR', 0);
                END;


            `, (error) => error ? reject(error) : resolve())
        })

        return self

    }

    /** 
     * Async wrapper for `sqlite3.Database.run()`
     */
    public run(sql: string, params?: TSQLParams) {
        return new Promise<void>((resolve, reject) => {
            this.db.run(sql, params, (error) => {
                error ? reject(error) : resolve()
            })
        })
    }

    /** 
     * Async wrapper for `sqlite3.Database.get()`
     */
    public get<T>(sql: string, params?: TSQLParams) {
        return new Promise<T>((resolve, reject) => {
            this.db.get(sql, params, (error, row) => {
                error ? reject(error) : resolve(row as T)
            })
        })
    }

    public all<T>(sql: string, params?: TSQLParams) {
        return new Promise<T[]>((resolve, reject) => {
            this.db.all(sql, params, (error, rows) => {
                error ? reject(error) : resolve(rows as T[])
            })
        })
    }

}