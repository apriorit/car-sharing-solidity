require('@nomicfoundation/hardhat-toolbox');
const { ALL_CONSTANTS } = require('./constants.js');

module.exports = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {},
    testnet: {
      // rinkeby testnet
      url: ALL_CONSTANTS['TESTNET']['node_url'],
      accounts: ALL_CONSTANTS['TESTNET']['pk'] !== '' ? ALL_CONSTANTS['TESTNET']['pk'] : [],
      gas: 2100000
    }
  },
  solidity: '0.8.17'
};
