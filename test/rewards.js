const { expect } = require('chai');
const { CONSTANTS } = require('../constants');
const { getDeadlineTimestamp, saleStatus } = require('./utils');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');

describe('Rewards', () => {
  let investInstance;
  let carRentNFTInstance;
  let rewardsInstance;
  let deployer;
  let otherUser;
  let carRenter;
  let deadline;

  before('loads the contracts', async () => {
    deadline = await getDeadlineTimestamp(); // 1 hour in the future

    [deployer, otherUser, carRenter] = await hre.ethers.getSigners();

    // Load the Invest contract
    const Invest = await hre.ethers.getContractFactory('Invest');
    investInstance = await Invest.attach(CONSTANTS.invest_contract_address);

    // Load the NFT contract
    const CarRentNFT = await hre.ethers.getContractFactory('CarRentNFT');
    carRentNFTInstance = await CarRentNFT.attach(CONSTANTS.car_rent_nft_contract_address);

    // Load the Rewards contract
    const Rewards = await hre.ethers.getContractFactory('Rewards');
    rewardsInstance = await Rewards.attach(CONSTANTS.rewards_contract_address);
  });

  before('starts and successfully finishes a new sale', async () => {
    await expect(investInstance.startNewSale(9, 10, deadline, 10, '')).to.emit(investInstance, 'SaleStarted').withArgs(9, 10, deadline, 10);

    // investors buy tokens
    await expect(investInstance.invest(9, 3, { value: 30 }))
      .to.emit(investInstance, 'UserInvested')
      .withArgs(deployer.address, 9, 3);

    await expect(investInstance.connect(otherUser).invest(9, 7, { value: 70 }))
      .to.emit(investInstance, 'UserInvested')
      .withArgs(otherUser.address, 9, 7);

    // finish the sale
    await expect(investInstance.finalizeSale(9)).to.emit(investInstance, 'SaleFinalized').withArgs(9, saleStatus.Sold);

    // owner withdraws invested ETH
    await expect(investInstance.withdrawInvestedETH(9)).to.changeEtherBalance(deployer.address, 100);
  });

  describe('01 - Adding new car', () => {
    it("reverts as the owner tries to add a car that doesn't exist", async () => {
      await expect(rewardsInstance.addCar(10, 0)).to.be.revertedWith('NOT_BOUGHT_YET');
    });

    it('reverts as the owner tries to add a car with the rent price set too low', async () => {
      await expect(rewardsInstance.addCar(9, 0)).to.be.revertedWith('RENT_PRICE_TOO_LOW');
    });

    it('verifies that the owner can add new car', async () => {
      await expect(rewardsInstance.addCar(9, 100)).to.emit(rewardsInstance, 'NewCarAdded').withArgs(9, 100);
    });

    it('verifies that car was added', async () => {
      await expect(await rewardsInstance.getAllCars()).deep.to.be.equal([hre.ethers.BigNumber.from(9)]);
    });
  });

  describe('02 - Locking/Unlocking tokens', () => {
    it('reverts as the caller is not an investor', async () => {
      await expect(rewardsInstance.connect(carRenter).lock(9, 10)).to.be.revertedWith('NOT_INVESTOR');
    });

    it("reverts as the caller tries to lock tokens for a car that doesn't exist", async () => {
      await expect(rewardsInstance.lock(10, 10)).to.be.revertedWith('WRONG_CAR_ID');
    });

    it('reverts as the caller tries to lock too many tokens', async () => {
      // approve token transfer for both accounts
      await carRentNFTInstance.connect(otherUser).setApprovalForAll(rewardsInstance.address, true);
      await carRentNFTInstance.connect(deployer).setApprovalForAll(rewardsInstance.address, true);

      await expect(rewardsInstance.connect(otherUser).lock(9, 10)).to.be.revertedWith('ERC1155: insufficient balance for transfer');
    });

    it('verifies that an investor can lock tokens', async () => {
      await expect(rewardsInstance.connect(otherUser).lock(9, 7)).to.emit(rewardsInstance, 'InvestorLockedTokens').withArgs(9, otherUser.address, 7, 7);
    });

    it("reverts as the caller doesn't have locked tokens", async () => {
      await expect(rewardsInstance.connect(deployer).unlock(9, 10)).to.be.revertedWith('NO_LOCKED_TOKENS');
    });

    it('reverts as an investor tries to unlock more tokens than he locked', async () => {
      await expect(rewardsInstance.connect(otherUser).unlock(9, 10)).to.be.revertedWith('TOO_MANY_TOKENS');
    });

    it('verifies that investor can unlock some of the tokens', async () => {
      await expect(rewardsInstance.connect(otherUser).unlock(9, 3)).to.emit(rewardsInstance, 'InvestorUnlockedTokens').withArgs(9, otherUser.address, 3, 4);
    });
  });

  describe('03 - Renting a car', () => {
    it("reverts as the user tries to rent a car that doesn't exist", async () => {
      await expect(rewardsInstance.rentCar(10, 1)).to.be.revertedWith('WRONG_CAR_ID');
    });

    it('reverts as a user tries to rent a car for 0 days', async () => {
      await expect(rewardsInstance.rentCar(9, 0)).to.be.revertedWith('ZERO_DAYS_RENTAL');
    });

    it('reverts as a user sent wrong amount of Ether', async () => {
      await expect(rewardsInstance.connect(carRenter).rentCar(9, 1, { value: 10 }))
        .to.be.revertedWithCustomError(rewardsInstance, 'WrongAmountOfEther')
        .withArgs(10, 100);
    });

    it('verifies that user can rent a car', async () => {
      await expect(rewardsInstance.connect(carRenter).rentCar(9, 1, { value: 100 }))
        .to.emit(rewardsInstance, 'CarWasRented')
        .withArgs(9, 1, carRenter.address);
    });

    it('reverts as a user tries to rent a rented car', async () => {
      await expect(rewardsInstance.connect(carRenter).rentCar(9, 1, { value: 100 })).to.be.revertedWith('CAR_IS_RENTED');
    });
  });

  describe('04 - Claiming/Withdrawing the reward', () => {
    it('reverts as there is no withdrawable reward for the caller', async () => {
      await expect(rewardsInstance.connect(otherUser).withdrawReward(9)).to.be.revertedWith('NO_WITHDRAWABLE_REWARD');
    });

    it('verifies that an investor can claim the available reward', async () => {
      await expect(rewardsInstance.connect(otherUser).claimReward(9))
        .to.emit(rewardsInstance, 'UpdatedInvestorClaimableReward')
        .withArgs(9, otherUser.address, 100);
    });

    it('reverts as there is nothing to be claimed for the calling investor', async () => {
      await expect(rewardsInstance.connect(otherUser).claimReward(9)).to.be.revertedWith('NO_CLAIMABLE_REWARD');
    });

    it('verifies that an investor can withdraw the claimed reward', async () => {
      await expect(rewardsInstance.connect(otherUser).withdrawReward(9))
        .to.emit(rewardsInstance, 'InvestorWithdrawedReward')
        .withArgs(9, otherUser.address, 100);
    });

    it('reverts as an investor tries to withdraw the reward once more', async () => {
      await expect(rewardsInstance.connect(otherUser).withdrawReward(9)).to.be.revertedWith('NO_WITHDRAWABLE_REWARD');
    });

    it('reverts as there are no ETH left for the owner to be swept', async () => {
      await expect(rewardsInstance.sweepAvailableETH()).to.be.revertedWith('NOTHING_TO_SWEEP');
    });

    it('prepares contract for the next test: investor withdraws remaining tokens and a user rents a car', async () => {
      await expect(rewardsInstance.connect(otherUser).unlock(9, 4)).to.emit(rewardsInstance, 'InvestorUnlockedTokens').withArgs(9, otherUser.address, 4, 0);

      const rentalDeadline = await getDeadlineTimestamp(60 * 60 * 24);
      await time.increaseTo(rentalDeadline + 1);

      await expect(rewardsInstance.connect(carRenter).rentCar(9, 1, { value: 100 }))
        .to.emit(rewardsInstance, 'CarWasRented')
        .withArgs(9, 1, carRenter.address);
    });

    it('owner sweeps the available ETH as there are no investors with locked tokens', async () => {
      await expect(rewardsInstance.sweepAvailableETH()).to.changeEtherBalance(deployer.address, 100);
    });
  });

  describe('05 - Additional test cases', () => {
    before('investors lock tokens and then a user rents a car', async () => {
      await expect(rewardsInstance.connect(otherUser).lock(9, 4)).to.emit(rewardsInstance, 'InvestorLockedTokens').withArgs(9, otherUser.address, 4, 4);

      await expect(rewardsInstance.connect(deployer).lock(9, 3)).to.emit(rewardsInstance, 'InvestorLockedTokens').withArgs(9, deployer.address, 3, 3);

      const rentalDeadline = await getDeadlineTimestamp(60 * 60 * 24);
      await time.increaseTo(rentalDeadline + 1);

      await expect(rewardsInstance.connect(carRenter).rentCar(9, 1, { value: 100 }))
        .to.emit(rewardsInstance, 'CarWasRented')
        .withArgs(9, 1, carRenter.address);
    });

    it("verifies that an investor can't receive the reward for more tokens than he had locked", async () => {
      // the investor tries to lock more tokens in order to withdraw bigger reward
      await expect(rewardsInstance.connect(otherUser).lock(9, 3)).to.emit(rewardsInstance, 'InvestorLockedTokens').withArgs(9, otherUser.address, 3, 7);

      // the investor should only receive reward for the 4 tokens he had locked before the rent
      expect(await rewardsInstance.connect(otherUser).getWithdrawableReward(9, otherUser.address)).to.be.equal(Math.floor(100 / 7) * 4);

      // the investor shouldn't be able to claim more rewards
      await expect(rewardsInstance.connect(otherUser).claimReward(9)).to.be.revertedWith('NO_CLAIMABLE_REWARD');
    });
  });
});
