import Database from "./Database.js"

(async function main() {
    try {

        await Database.open()
        
    } 
    catch (error) {
        console.error(error)
        process.exit(1)    
    }
})()