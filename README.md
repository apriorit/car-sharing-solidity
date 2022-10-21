# Investments for starting a Car sharing service

To use these contracts you should first set the `ACTIVE_CHAIN` env variable to `LOCAL` or `TESTNET`:

```shell
export ACTIVE_CHAIN=LOCAL
```

## Building the project

To install all dependencies run `npm install`

## Running the tests

### Hardhat network

Running the tests using the local node:

```shell
npm test
```

### Testnet

Before running the tests you should add your Infura API key and your private key to the `env.json`

Running the tests using the Rinkeby network:

```shell
npx hardhat test --network testnet
```

### Test coverage

Calculating the test coverage:

```shell
npm coverage
# or npx hardhat coverage --network testnet
# for the Rinkeby network
```

## Deploying contracts

To deploy the contracts to the hardhat network you can use the corresponding script:

```shell
npm run deploy
```

Also, it is possible to deploy the contracts on the local network or the Rinkeby network:

```shell
npx hardhat run scripts/deploy.js --network <localhost|testnet>
```

## License

[Apriorit](http://www.apriorit.com/) released [car-sharing-solidity](https://github.com/apriorit/car-sharing-solidity) under the OSI-approved 3-clause BSD license. You can freely use it in your commercial or opensource software.
