# Assignment
The entire assignment's code is mostly self-contained and can be ran and tested after installing the necessary dependencies. No external modules or packages were used that aren't available on NPM to allow for easy testing without need for 3rd party tools.

It was written and tested on the latest (at the time) available NodeJS LTS - 22.14.0.

The service is using SQLite3 (in-memory) for data storage, Zod for type validation and vitest for basic unit tests. 

Clone repository:
```
git clone --depth 1 git@github.com:4S1ght/crustlab_12_02_2025.git
```

Install dependencies:
```
npm install
```

Run tests (vitest):
```
npm run test
```

### Configuration
Service fees and exchange rates are pre-configured through environment variables inside
the `.ENV` file but can be changed manually for testing before running:

```bash
# bash
SERVICE_FEE=0.05 EXCHANGE_USD=0.30 npm run test
```
**Note**: Some tests may fail due to changed service fees and exchange rates as they directly test
the transfer, exchange, withdraw and deposit values and their correctness.