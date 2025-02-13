// Imports ========================================================================================

import { randomUUID } from "node:crypto"
import z from 'zod'
import Queue from "queue"
import Database from "./Database.js"
import ExchangeAndFees, { ZCurrency, TCurrency, TForeignCurrency } from "./ExchangeAndFees.js"

// Types ==========================================================================================

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

interface TTransactionHistoryOptions {
    /** Returns the transaction results only for a specific user */ userID?: string
    /** Returns only transactions in this currency.              */ currency?: TCurrency
    /** Minimum transaction amount                               */ maxAmount?: number
    /** Maximum transaction amount                               */ minAmount?: number
    /** Transaction type                                         */ transactionType?: 'deposit' | 'withdrawal' | 'transfer' |'exchange'
    /** The oldest the transaction can be.                       */ startDate?: number
    /** The latest the transaction can be.                       */ endDate?: number
}

export interface TTransaction {
    /** Transaction ID                  */ id: number
    /** ID of the account owner         */ user_id: string
    /** ID of the issuer account        */ issuer_account_id: number
    /** ID of the receiver account      */ recipient_account_id: number
    /** Type of the transaction         */ transaction_type: 'deposit' | 'withdrawal' | 'transfer' |'exchange'
    /** Transaction amount              */ amount: number
    /** Currency of the transaction     */ currency: TCurrency
    /** Target currency of the exchange */ target_currency?: TCurrency
    /** Time of the transaction         */ made_at: number
}

// Guards =========================================================================================

const ZUsername = z.string().min(1)
const ZUserID = z.string().uuid()
const ZNumber = z.number().positive()

const ZTransactionHistoryOptions = z.object({
    userID: z.string().uuid().optional(),
    currency: ZCurrency.optional(),
    maxAmount: ZNumber.optional(),
    minAmount: ZNumber.optional(),
    transactionType: z.enum(['deposit', 'withdrawal', 'transfer', 'exchange']).optional(),
    startDate: z.number().optional(),
    endDate: z.number().optional()
} as const) satisfies z.ZodType<TTransactionHistoryOptions>

// Exports ========================================================================================

export default class AccountsAPI {

    private declare db: Database
    private declare queue: Queue
    public eaf = new ExchangeAndFees()

    public static async open(): Promise<AccountsAPI> {

        const self = new this()
        self.db = await Database.open()
        self.queue = new Queue({ autostart: true })

        return self
    }

    // User management ----------------------------------------------

    /**
     * Creates a new user of a given name and returns its ID.
     */
    public createUser(username: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {

                    ZUsername.parse(username)
            
                    const id = randomUUID()
                    await this.db.run(
                        /*sql*/`INSERT INTO users (id, name) VALUES (?, ?)`,
                        [id, username]
                    )
            
                    resolve(id)

                } 
                catch (error) {
                    reject(error)
                }
            })
        })
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
     */
    public async deleteUser(userID: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.queue.push(async () => {
                try {

                    ZUserID.parse(userID)
            
                    await this.db.run(
                        /*sql*/`DELETE FROM users WHERE id = ?`,
                        [userID]
                    )

                    resolve()

                } 
                catch (error) {
                    reject(error)
                }
            })
        })

    }

    // Transactions & side-effects ----------------------------------

    /**
     * Creates a new deposit in a user's account.
     */
    public async deposit(userID: string, amount: number, currency: TCurrency): Promise<void> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                let inTransaction = false
                try {

                    ZUserID.parse(userID)
                    ZNumber.parse(amount)
                    ZCurrency.parse(currency)
                    
                    const account = await this.getAccount(userID, currency)
                    if (!account) return reject(new Error(`deposit(): Account of user "${userID}" not found.`))
            
                    const startingBalance = account.balance
                    const totalServiceFee = amount * this.eaf.serviceFee
                    const finalBalance = startingBalance + amount - totalServiceFee

                    inTransaction = true
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
                    this.eaf.collectServiceFee(totalServiceFee, currency)
                    resolve()

                } 
                catch (error) {
                    // Doing manual checks here because some errors before BEGIN TRANSACTION
                    // were caught and caused ROLLBACK to throw an uncaught error.
                    if (inTransaction) this.db.run('ROLLBACK')
                    reject(error)
                }
            })
        })
        
    }

    /**
     * Withdraws money from a user's account.
     * If the account doesn't have enough to withdraw the requested amount + fees,
     * an error will be thrown due to insufficient funds.
     * @returns Amount of withdrawn money - for convenience
     */
    public withdraw(userID: string, amount: number, currency: TCurrency) {
        return new Promise<number>((resolve, reject) => {
            this.queue.push(async () => {
                let inTransaction = false
                try {
                    
                    ZUserID.parse(userID)
                    ZNumber.parse(amount)
                    ZCurrency.parse(currency)
                        
                    const account = await this.getAccount(userID, currency)
                    if (!account) return reject(new Error(`withdraw(): Account of user "${userID}" not found.`))
    
                    // The balance needed to withdraw the exact sum requested + service fees
                    const fee = amount * this.eaf.serviceFee
                    const totalWithdraw = amount + fee
                    if (totalWithdraw > account.balance) return reject(new Error(`withdraw(): Insufficient balance.`))
                    
                    await this.db.run('BEGIN TRANSACTION')
                    inTransaction = true

                    await this.db.run(
                        /*sql*/`
                            UPDATE accounts
                            SET    balance = $balance
                            WHERE  user_id = $user_id AND currency = $currency;
                        `,
                        { $user_id: userID, $balance: account.balance - totalWithdraw, $currency: currency }
                    )
                    
                    await this.db.run(
                        /*sql*/`
                            INSERT INTO transactions (user_id,  issuer_account_id,  transaction_type, amount,  currency)
                            VALUES                   ($user_id, $issuer_account_id, 'withdrawal',     $amount, $currency);
                        `,
                        { $user_id: userID, $issuer_account_id: account.id, $amount: amount, $currency: currency }
                    )
                    
                    await this.db.run('COMMIT')
                    this.eaf.collectServiceFee(fee, currency)
                    resolve(amount)

                } 
                catch (error) {
                    if (inTransaction) this.db.run('ROLLBACK')
                    reject(error)
                }
            })
        })
    }

    /**
     * Transfers money from one user to another.
     * @param issuerUserID - User transferring the money
     * @param recipientUserID - User recieving the money
     * @param amount - Amount of money
     * @param currency - Currency, eg. PLN, USD, EUR.
     * @returns 
     */
    public transfer(issuerUserID: string, recipientUserID: string, amount: number, currency: TCurrency) {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                let inTransaction = false
                try {
                    
                    ZUserID.parse(issuerUserID)
                    ZUserID.parse(recipientUserID)
                    ZNumber.parse(amount)
                    ZCurrency.parse(currency)

                    const issuerAccount = await this.getAccount(issuerUserID, currency)
                    if (!issuerAccount) return reject(new Error(`transfer(): Account of issuer "${issuerUserID}" not found.`))

                    const recipientAccount = await this.getAccount(recipientUserID, currency)
                    if (!recipientAccount) return reject(new Error(`transfer(): Account of recipient "${recipientUserID}" not found.`))
                    
                    const fee = amount * this.eaf.serviceFee
                    const totalWithdraw = amount + fee
                    if (totalWithdraw > issuerAccount.balance) return reject(new Error(`transfer(): Insufficient balance.`))

                    await this.db.run('BEGIN TRANSACTION')
                    inTransaction = true

                    // Remove money from issuer (including fees)
                    await this.db.run(
                        /*sql*/`
                            UPDATE accounts
                            SET    balance = $balance
                            WHERE  user_id = $user_id AND currency = $currency;
                        `,
                        { $user_id: issuerUserID, $balance: issuerAccount.balance - totalWithdraw, $currency: currency }
                    )

                    // Transfer to recipient (after fees)
                    await this.db.run(
                        /*sql*/`
                            UPDATE accounts
                            SET    balance = $balance
                            WHERE  user_id = $user_id AND currency = $currency;
                        `,
                        { $user_id: recipientUserID, $balance: recipientAccount.balance + amount, $currency: currency }
                    )
                    
                    // Log the transaction
                    await this.db.run(
                        /*sql*/`
                            INSERT INTO transactions (user_id,  issuer_account_id,  recipient_account_id,  transaction_type, amount,  currency)
                            VALUES                   ($user_id, $issuer_account_id, $recipient_account_id, 'transfer',       $amount, $currency);
                        `,
                        { $user_id: issuerUserID, $issuer_account_id: issuerAccount.id, $recipient_account_id: recipientAccount.id, $amount: amount, $currency: currency}
                    )
                    
                    await this.db.run('COMMIT')
                    this.eaf.collectServiceFee(fee, currency)
                    resolve(amount)
                    
                }
                catch (error) {
                    if (inTransaction) this.db.run('ROLLBACK')
                    reject(error)
                }
            })
        })
    }

    /**
     * Exchanges money from one currency to another - For a given user.
     */
    public exchange(userID: string, amount: number, fromCurrency: TCurrency, toCurrency: TCurrency) {
        return new Promise<void>((resolve, reject) => {
            this.queue.push(async () => {
                let inTransaction = false
                try {
                    
                    ZUserID.parse(userID)
                    ZNumber.parse(amount)
                    ZCurrency.parse(fromCurrency)
                    ZCurrency.parse(toCurrency)

                    const sourceAccount = await this.getAccount(userID, fromCurrency)
                    if (!sourceAccount) return reject(new Error(`exchange(): Account of user "${userID}" not found.`))

                    const destinationAccount = await this.getAccount(userID, toCurrency)
                    if (!destinationAccount) return reject(new Error(`exchange(): Account of user "${userID}" not found.`))
            
                    const fee = amount * this.eaf.serviceFee
                    const totalWithdraw = amount + fee
                    if (totalWithdraw > sourceAccount.balance) return reject(new Error(`exchange(): Insufficient balance.`))

                    const exchanged = this.eaf.toExchangedAmount(amount, fromCurrency, toCurrency)

                    await this.db.run('BEGIN TRANSACTION')
                    inTransaction = true

                    // Remove money from source account (including fees)
                    await this.db.run(
                        /*sql*/`
                            UPDATE accounts
                            SET    balance = $balance
                            WHERE  user_id = $user_id AND currency = $currency;
                        `,
                        { $user_id: userID, $balance: sourceAccount.balance - totalWithdraw, $currency: fromCurrency }
                    )

                    // Transfer money to destination account after exchanging.
                    await this.db.run(
                        /*sql*/`
                            UPDATE accounts
                            SET    balance = $balance
                            WHERE  user_id = $user_id AND currency = $currency;
                        `,
                        { $user_id: userID, $balance: destinationAccount.balance + exchanged, $currency: toCurrency }
                    )

                    // Log the transaction
                    await this.db.run(
                        /*sql*/`
                            INSERT INTO transactions (user_id,  issuer_account_id,  recipient_account_id,  transaction_type, amount,  currency,  target_currency)
                            VALUES                   ($user_id, $issuer_account_id, $recipient_account_id, 'exchange',       $amount, $currency, $target_currency);
                        `,
                        { $user_id: userID, $issuer_account_id: sourceAccount.id, $recipient_account_id: destinationAccount.id, $amount: amount, $currency: fromCurrency }
                    )
                    
                    await this.db.run('COMMIT')
                    this.eaf.collectServiceFee(fee, fromCurrency)
                    resolve()

                } 
                catch (error) {
                    if (inTransaction) this.db.run('ROLLBACK')
                    reject(error)
                }
            })
        })
    }

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
 
    public async getTransactionHistory(options: TTransactionHistoryOptions): Promise<TTransaction[]> {

        ZTransactionHistoryOptions.parse(options)
        
        return await this.db.all(
            /*sql*/`
                SELECT * FROM transactions
                WHERE 
                        ($user_id          IS NULL OR user_id = $user_id)
                    AND ($currency         IS NULL OR currency = $currency)
                    AND ($min_amount       IS NULL OR amount >= $min_amount)
                    AND ($max_amount       IS NULL OR amount <= $max_amount)
                    AND ($transaction_type IS NULL OR transaction_type = $transaction_type)
                    AND ($start_date       IS NULL OR made_at >= $start_date)
                    AND ($end_date         IS NULL OR made_at <= $end_date);

            `,
            {
                $user_id:           options.userID,
                $currency:          options.currency,
                $min_amount:        options.minAmount,
                $max_amount:        options.maxAmount,
                $transaction_type:  options.transactionType,
                $start_date:        options.startDate,
                $end_date:          options.endDate
            }
        )

    }

}