// Imports ========================================================================================

import z from 'zod'

// Guards =========================================================================================

const ZNumber = z.number().positive()
export const ZCurrency = z.enum(['PLN', 'EUR', 'USD'])

// Types ==========================================================================================

export type TCurrency = z.infer<typeof ZCurrency>
export type TForeignCurrency = Exclude<TCurrency, 'PLN'>

// Exports ========================================================================================

export default class ExchangeAndFees {

    public serviceFee: number = 0
    public totalCollectedFeesPLN: number = 0

    public exchangeRates: Record<TForeignCurrency, number> = {
        EUR: -1,
        USD: -1
    }

    constructor() {
        if (!process.env.SERVICE_FEE) {

            process.loadEnvFile()

            // Load service fees
            this.serviceFee = parseFloat(process.env.SERVICE_FEE!)

            // Load individual currency exchange rates from ENV.
            // Prevents the service from starting if any value is misconfigured.
            for (const currency in this.exchangeRates) {
                if (Object.prototype.hasOwnProperty.call(this.exchangeRates, currency)) {

                    const currencyENV = parseFloat(process.env[`EXCHANGE_${currency.toUpperCase()}`]!)

                    if (ZNumber.safeParse(currencyENV).error) {
                        throw new Error(`Missing or misconfigured currency exchange rate for "${currency}".`)
                    }

                    this.exchangeRates[currency as TForeignCurrency] = currencyENV

                }
            }

        }
    }


    // Service fees & helpers ---------------------------------------

    /**
     * Collects the service fee for a given transaction in any supported currency
     * and collects it in a global pool (in PLN).
     * 
     * Normally this should be done in the same currencies as the transaction,
     * but for the purpose of this demo it's easier to collect them all in PLN.
     */
    public collectServiceFee(fee: number, currency: TCurrency) {
        const inPLN = this.toExchangedAmount(fee, currency, 'PLN')
        this.totalCollectedFeesPLN += inPLN
    }

    /**
     * Given the `amount` of money in `from` currency, returns the equivalent amount in `to` currency.
     * @param amount Amount - eg. 100 ($)
     * @param from Original currency
     * @param to Target currency
     * 
     * Note that this method does not guarantee complete precision due to JavaScript's
     * exclusive use of double-floats, though it's enough for things such as Forex transactions.
     */
    public toExchangedAmount(amount: number, from: TCurrency, to: TCurrency) {

        // Handle same from/too's
        if (from === to) {
            return amount
        }
        if (to === 'PLN') {
            return amount / this.exchangeRates[from as TForeignCurrency]
        }
        if (from === 'PLN') {
            return amount * this.exchangeRates[to as TForeignCurrency]
        }

        //       Comes down to PLN reference     Turns into target currency
        return amount / this.exchangeRates[from] * this.exchangeRates[to]

    }

}