const hre = require('hardhat');
const { CONSTANTS, saveConstants } = require('../constants.js');

async function deploy() {
  let deployer;
  let otherUser;

  [deployer, otherUser] = await hre.ethers.getSigners();
  console.log(`\t*Deployer: ${deployer.address} with balance ${await deployer.getBalance()}`);

  // Deploying the Invest contract
  const Invest = await hre.ethers.getContractFactory('Invest');
  const investInstance = await Invest.deploy();

  await investInstance.deployed();
  CONSTANTS.invest_contract_address = investInstance.address;
  console.log(`\t*Invest deployed at ${investInstance.address}`);

  // Deploying the NFT contract
  const CarRentNFT = await hre.ethers.getContractFactory('CarRentNFT');
  const carRentNFTInstance = await CarRentNFT.deploy(investInstance.address);

  await carRentNFTInstance.deployed();
  CONSTANTS.car_rent_nft_contract_address = carRentNFTInstance.address;
  console.log(`\t*CarRentNFT deployed at ${carRentNFTInstance.address}`);

  // Deploying the Rewards contract
  const Rewards = await hre.ethers.getContractFactory('Rewards');
  const rewardsInstance = await Rewards.deploy(investInstance.address, carRentNFTInstance.address);

  await rewardsInstance.deployed();
  CONSTANTS.rewards_contract_address = rewardsInstance.address;
  console.log(`\t*Rewards deployed at ${rewardsInstance.address}`);
  saveConstants();

  // also set the nft contract if this file was run directly
  if (require.main === module) {
    await investInstance.setCarNFTContract(carRentNFTInstance.address);
  } else {
    return [deployer, otherUser, investInstance, carRentNFTInstance, rewardsInstance];
  }
}

if (require.main === module) {
  deploy().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { deploy };
