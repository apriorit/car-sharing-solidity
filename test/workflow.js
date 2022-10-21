const { expect } = require('chai');
const { deploy } = require('../scripts/deploy');
const { getDeadlineTimestamp, saleStatus } = require('./utils');
const hre = require('hardhat');

function Investor(tokens, signer) {
  this.tokens = tokens;
  this.signer = signer;
}

describe('Investing workflow', () => {
  const saleID = 1;
  const totalTokens = 10;
  let investInstance;
  let carRentNFTInstance;
  let rewardsInstance;
  let owner;
  let investors;
  let carRenter;
  let deadline;

  before('deploys fresh set of contracts', async () => {
    // we will have two investors
    const signers = await hre.ethers.getSigners();
    investors = [new Investor(6, signers[1]), new Investor(4, signers[2])];
    deadline = await getDeadlineTimestamp(); // 1 hour in the future
    [owner, carRenter, investInstance, carRentNFTInstance, rewardsInstance] = await deploy();
    await investInstance.setCarNFTContract(carRentNFTInstance.address);
  });

  describe('01 - Investing', () => {
    const pricePerToken = 10;

    it('owner starts a new sale', async () => {
      const URI = 'ipfs://bafkreien5b3ghtffb5zkuo2itth26zo3fvobsc5orrerfd4aihfz6d4d6u';
      await expect(investInstance.connect(owner).startNewSale(saleID, totalTokens, deadline, pricePerToken, URI))
        .to.emit(investInstance, 'SaleStarted')
        .withArgs(saleID, totalTokens, deadline, pricePerToken);
    });

    it('investors buy tokens', async () => {
      // first investor buys tokens
      let tokensToBuy = investors[0].tokens;
      let etherToPay = tokensToBuy * pricePerToken;
      await expect(investInstance.connect(investors[0].signer).invest(saleID, tokensToBuy, { value: etherToPay }))
        .to.emit(investInstance, 'UserInvested')
        .withArgs(investors[0].signer.address, saleID, tokensToBuy);

      // second investor buys tokens
      tokensToBuy = investors[1].tokens;
      etherToPay = tokensToBuy * pricePerToken;
      await expect(investInstance.connect(investors[1].signer).invest(saleID, tokensToBuy, { value: etherToPay }))
        .to.emit(investInstance, 'UserInvested')
        .withArgs(investors[1].signer.address, saleID, tokensToBuy);
    });

    it('owner finalizes the sale and withdraws Ether', async () => {
      await expect(investInstance.connect(owner).finalizeSale(saleID)).to.emit(investInstance, 'SaleFinalized').withArgs(saleID, saleStatus.Sold);
      await expect(investInstance.connect(owner).withdrawInvestedETH(saleID)).to.changeEtherBalance(owner.address, pricePerToken * totalTokens);
    });
  });

  describe('02 - Renting a car and distributing rewards', () => {
    const rentPricePerDay = 1000;
    // user is going to rent a car for five days
    const daysToRentFor = 5;

    it('owner adds a new car', async () => {
      await expect(rewardsInstance.connect(owner).addCar(saleID, rentPricePerDay)).to.emit(rewardsInstance, 'NewCarAdded').withArgs(saleID, rentPricePerDay);
    });

    it('investors lock their tokens', async () => {
      // investors approve the Rewards contract to transfer the tokens
      await carRentNFTInstance.connect(investors[0].signer).setApprovalForAll(rewardsInstance.address, true);
      await carRentNFTInstance.connect(investors[1].signer).setApprovalForAll(rewardsInstance.address, true);

      // first investor locks his tokens
      await expect(rewardsInstance.connect(investors[0].signer).lock(saleID, investors[0].tokens))
        .to.emit(rewardsInstance, 'InvestorLockedTokens')
        .withArgs(saleID, investors[0].signer.address, investors[0].tokens, investors[0].tokens);

      // second investor locks his tokens
      await expect(rewardsInstance.connect(investors[1].signer).lock(saleID, investors[1].tokens))
        .to.emit(rewardsInstance, 'InvestorLockedTokens')
        .withArgs(saleID, investors[1].signer.address, investors[1].tokens, investors[1].tokens);
    });

    it('user rents a car', async () => {
      const etherToPay = daysToRentFor * rentPricePerDay;
      await expect(rewardsInstance.connect(carRenter).rentCar(saleID, daysToRentFor, { value: etherToPay }))
        .to.emit(rewardsInstance, 'CarWasRented')
        .withArgs(saleID, daysToRentFor, carRenter.address);
    });

    it('investors claim and withdraw the available reward', async () => {
      // first investor claims his reward
      let expectedReward = Math.floor((daysToRentFor * rentPricePerDay) / totalTokens) * investors[0].tokens;
      await expect(rewardsInstance.connect(investors[0].signer).claimReward(saleID))
        .to.emit(rewardsInstance, 'UpdatedInvestorClaimableReward')
        .withArgs(saleID, investors[0].signer.address, expectedReward);

      // first investor withdraws the claimed reward
      await expect(rewardsInstance.connect(investors[0].signer).withdrawReward(saleID))
        .to.emit(rewardsInstance, 'InvestorWithdrawedReward')
        .withArgs(saleID, investors[0].signer.address, expectedReward);

      // second investor claims his reward
      expectedReward = Math.floor((daysToRentFor * rentPricePerDay) / totalTokens) * investors[1].tokens;
      await expect(rewardsInstance.connect(investors[1].signer).claimReward(saleID))
        .to.emit(rewardsInstance, 'UpdatedInvestorClaimableReward')
        .withArgs(saleID, investors[1].signer.address, expectedReward);

      // second investor withdraws the claimed reward
      await expect(rewardsInstance.connect(investors[1].signer).withdrawReward(saleID))
        .to.emit(rewardsInstance, 'InvestorWithdrawedReward')
        .withArgs(saleID, investors[1].signer.address, expectedReward);
    });
  });
});
