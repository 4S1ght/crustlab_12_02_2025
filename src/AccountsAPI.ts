// Imports ========================================================================================

import { randomUUID } from "node:crypto"
import z from 'zod'
import Queue from "queue"
import Database from "./Database.js"

// Types ==========================================================================================

type TCurrency = z.infer<typeof ZCurrency>

export interface TUser {
    /** User ID (UUIDv4)              */ id: string
    /** User name (not always unique) */ name: string
    /** Time of user's registration   */ user_created_at: Date
}

export interface TAccount {
    /** Account ID                     */ id: number
    /** Unique ID of the account owner */ user_id: string
    /** Currency of the account        */ currency: TCurrency
    /** Current balance                */ balance: number
    /** Time of account creation       */ account_created_at: Date
}

// Guards =========================================================================================

const ZUsername = z.string().min(1)
const ZUserID = z.string().uuid()

const ZInteger = z.number().positive()
const ZCurrency = z.enum(['PLN', 'EUR', 'USD'])

// Exports ========================================================================================

export default class AccountsAPI {

    private declare db: Database

    public declare exchangeRateUSD: number
    public declare exchangeRateEUR: number

    public declare serviceFee: number
    public declare totalCollectedFees: number

    private declare queue: Queue

    public static async open(): Promise<AccountsAPI> {

        const self = new this()
        self.db = await Database.open()
        self.queue = new Queue({
            autostart: true,
        })

        if (!process.env.CRUSTLAB_SERVICE_FEE) {
            process.loadEnvFile()
            self.serviceFee      = parseFloat(process.env.SERVICE_FEE!)
            self.exchangeRateEUR = parseFloat(process.env.EXCHANGE_EUR!)
            self.exchangeRateUSD = parseFloat(process.env.EXCHANGE_USD!)
        }

        return self
    }

    // User management ----------------------------------------------

    /**
     * Creates a new user of a given name and returns its ID.
     * TODO: Wrap inside a queue
     */
    public async createUser(username: string): Promise<string> {

        ZUsername.parse(username)

        const id = randomUUID()

        this.db.run(
            /*sql*/`INSERT INTO users (id, name) VALUES (?, ?)`,
            [id, username]
        )

        return id

    }

    /**
     * Retrieves a user by their ID.  
     * Returns `undefined` if the user does not exist.
     */
    public async getUser(userID: string): Promise<TUser> {

        ZUserID.parse(userID)

        const user = await this.db.get<TUser>(
            /*sql*/`SELECT * FROM users WHERE id = ?`,
            [userID]
        )

        if (user) user.user_created_at = new Date(user.user_created_at)
        return user

    }
    
    /**
     * Deletes a user by their ID.
     * TODO: Wrap inside a queue
     */
    public async deleteUser(userID: string): Promise<void> {

        ZUserID.parse(userID)

        await this.db.run(
            /*sql*/`DELETE FROM users WHERE id = ?`,
            [userID]
        )

    }

    // Transactions & side-effects ----------------------------------

    
    /**
     * Creates a new deposit in a user's account.
     *
     * Notes:
     * - Due to using SQLite, only database-wide transactions are supported,
     * but when using a more advanced database it'd be best to leverage them
     * in order to guarantee sync between `accounts` and `deposits` tables
     * 
     * @param amount - Note that the "amount" MUST be represented **cents**. Eg.
     * 100 euro cents, 100 cents USD, etc. This is to prevent rounding errors
     * during common operations like addition and subtraction.
     * 
     */
    public async deposit(userID: string, amount: number, currency: TCurrency): Promise<void> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {

                    const typeGuards = [
                        ZUserID.safeParse(userID).error,
                        ZInteger.safeParse(amount).error,
                        ZCurrency.safeParse(currency).error
                    ]
                    if (typeGuards.some(x => x instanceof z.ZodError)) return reject(new Error('deposit(): Invalid one or more parameters parameters.'))
            
                    const account = await this.getAccount(userID, currency)
                    if (!account) throw new Error(`deposit(): Account of user "${userID}" not found.`)
            
                    const startingBalance = account.balance
                    const totalServiceFee = amount * this.serviceFee
                    const finalBalance = startingBalance + amount - totalServiceFee
                    this.collectServiceFee(totalServiceFee)

                    await this.db.run('BEGIN TRANSACTION')
            
                    await this.db.run(
                        /*sql*/`
                            UPDATE accounts
                            SET    balance = $balance
                            WHERE  user_id = $user_id AND currency = $currency;
                        `,
                        { $user_id: userID, $balance: finalBalance, $currency: currency }
                    )
                    
                    await this.db.run(
                        /*sql*/`
                            INSERT INTO transactions (user_id,  issuer_account_id,  transaction_type, amount,  currency)
                            VALUES                   ($user_id, $issuer_account_id, 'deposit',        $amount, $currency);
                        `,
                        { $user_id: userID, $issuer_account_id: account.id, $amount: amount, $currency: currency }
                    )

                    await this.db.run('COMMIT')
                    resolve()

                } 
                catch (error) {
                    this.db.run('ROLLBACK')
                    reject(error)
                }
            })
        })
        
    }

    public async withdraw() {}
    public async transfer() {}
    public async exchange() {}

    // User, account & balance information --------------------------

    /**
     * Returns the balance of a user's account in a given currency.
     * @param userID 
     * @param currency 
     * @returns 
     */
    public async getBalance(userID: string, currency: TCurrency): Promise<number> {

        ZUserID.parse(userID)
        ZCurrency.parse(currency)

        const account = await this.db.get<Pick<TAccount, 'balance'>>(
            /*sql*/`
                SELECT balance
                FROM accounts
                WHERE user_id = ? AND currency = ?
            `,
            [userID, currency]
        )

        return account.balance

    }

    /**
     * Retrieves the information about a user's account of specific currency.
     * @param userID 
     * @param currency 
     * @returns 
     */
    public async getAccount(userID: string, currency: TCurrency): Promise<TAccount> {

        ZUserID.parse(userID)
        ZCurrency.parse(currency)

        const account = await this.db.get<TAccount>(
            /*sql*/`
                SELECT * 
                FROM accounts
                WHERE user_id = ? AND currency = ?
            `,
            [userID, currency]
        )

        return account

    }

    // Transaction history ------------------------------------------

    // Service fees -------------------------------------------------

    /**
     * Collects the service fee for a given transaction.
     * 
     * In reality these should be redirected elsewhere, but as this example
     * works entirely in memory, I have decided to skip that part.
     */
    private collectServiceFee(fee: number) {
        this.totalCollectedFees += fee
    }

}