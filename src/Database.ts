import sqlite3 from "sqlite3"

export default class Database {

    private static declare db: sqlite3.Database

    /**
     * Opens the internal SQLite 3 database.  
     * @throws if the database cannot be opened.
     */
    public static open() {
        return new Promise<void>((resolve, reject) => {
            this.db = new sqlite3.Database('./service.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, error => {
                error ? reject(error) : resolve()
            })
        })
    }


}