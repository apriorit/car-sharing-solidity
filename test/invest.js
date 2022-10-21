const { expect } = require('chai');
const hre = require('hardhat');
const { getDeadlineTimestamp, saleStatus } = require('./utils');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { deploy } = require('../scripts/deploy');

describe('Invest', () => {
  let investInstance;
  let carRentNFTInstance;
  let deployer;
  let otherUser;
  let deadline;

  describe('01 - Deployment and setup', () => {
    before('deploys the contracts', async () => {
      deadline = await getDeadlineTimestamp(); // 1 hour in the future
      [deployer, otherUser, investInstance, carRentNFTInstance] = await deploy();
    });

    it('reverts the transaction as NFT contract is not set', async () => {
      await expect(investInstance.startNewSale(1, 1, 0, 1, 'ipfs://bafkreien5b3ghtffb5zkuo2itth26zo3fvobsc5orrerfd4aihfz6d4d6u')).to.be.revertedWith(
        'NFT_CONTRACT_NOT_SET'
      );
    });

    it('reverts the transaction as the provided NFT contract address is zero', async () => {
      await expect(investInstance.setCarNFTContract(hre.ethers.constants.AddressZero)).to.be.revertedWith('NFT_ADDR_IS_ZERO');
    });

    it('sets the NFT contract', async () => {
      await investInstance.setCarNFTContract(carRentNFTInstance.address);
      expect(hre.ethers.utils.defaultAbiCoder.decode(['address'], await hre.ethers.provider.getStorageAt(investInstance.address, 1))[0]).to.be.equal(
        carRentNFTInstance.address
      );
    });

    it('reverts the transaction as NFT contract is already set', async () => {
      await expect(investInstance.setCarNFTContract(carRentNFTInstance.address)).to.be.revertedWith('NFT_CONTRACT_ALREADY_SET');
    });
  });

  describe('02 - Starting new sale', () => {
    it('reverts the transaction as sale has deadline in the past', async () => {
      await expect(investInstance.startNewSale(1, 1, 0, 1, '')).to.be.revertedWithCustomError(investInstance, 'DeadlineIsInPast');
    });

    it('starts new sale', async () => {
      await expect(investInstance.startNewSale(1, 10, deadline, 10, '')).to.emit(investInstance, 'SaleStarted').withArgs(1, 10, deadline, 10);
    });

    it('reverts the transaction as sale has already started', async () => {
      await expect(investInstance.startNewSale(1, 10, deadline, 10, '')).to.be.revertedWithCustomError(investInstance, 'SaleAlreadyStarted').withArgs(1);
    });

    it('checks that sale started correctly', async () => {
      expect(await carRentNFTInstance.balanceOf(investInstance.address, 1)).to.be.equal(10);
      const saleInfo = await investInstance.getSaleInfo(1);
      expect(saleInfo['status']).to.be.equal(saleStatus.Active);
      expect(saleInfo['tokensTotal']).to.be.equal(10);
      expect(saleInfo['tokensOwnedByUsers']).to.be.equal(0);
    });

    it('sets token URI', async () => {
      const URI = 'ipfs://bafkreien5b3ghtffb5zkuo2itth26zo3fvobsc5orrerfd4aihfz6d4d6u';
      await expect(investInstance.updateURI(1, URI)).to.emit(investInstance, 'URIUpdated').withArgs(1, URI);
    });

    it('verifies that the token URI was set correctly', async () => {
      expect(await carRentNFTInstance.uri(1)).to.be.equal('ipfs://bafkreien5b3ghtffb5zkuo2itth26zo3fvobsc5orrerfd4aihfz6d4d6u');
    });
  });

  describe('03 - Starting new batch sale', () => {
    it('reverts the transaction as deadline and id arrays lengths mismatch', async () => {
      const saleIDs = [2, 3];
      const totalTokens = [10, 12];
      const deadlines = [0, 0, 0];
      const pricesPerToken = [15, 15];
      const URIs = ['', '']; // for testing purposes
      await expect(investInstance.startNewSales(saleIDs, totalTokens, deadlines, pricesPerToken, URIs)).to.be.revertedWith('DEADLINE_ID_SIZE_MISMATCH');
    });

    it('reverts the transaction as price and id arrays lengths mismatch', async () => {
      const saleIDs = [2, 3];
      const totalTokens = [10, 12];
      const deadlines = [0, 0];
      const pricesPerToken = [15, 15, 15];
      const URIs = ['', ''];
      await expect(investInstance.startNewSales(saleIDs, totalTokens, deadlines, pricesPerToken, URIs)).to.be.revertedWith('PRICE_ID_SIZE_MISMATCH');
    });

    it('reverts the transaction as URI and id arrays lengths mismatch', async () => {
      const saleIDs = [2, 3];
      const totalTokens = [10, 12];
      const deadlines = [0, 0];
      const pricesPerToken = [15, 15];
      const URIs = ['', '', ''];
      await expect(investInstance.startNewSales(saleIDs, totalTokens, deadlines, pricesPerToken, URIs)).to.be.revertedWith('URI_ID_SIZE_MISMATCH');
    });

    it('reverts the transaction as one of the deadlines is in the past', async () => {
      const saleIDs = [2, 3];
      const totalTokens = [10, 12];
      const deadlines = [deadline, 0];
      const pricesPerToken = [15, 15];
      const URIs = ['', ''];
      await expect(investInstance.startNewSales(saleIDs, totalTokens, deadlines, pricesPerToken, URIs)).to.be.revertedWithCustomError(
        investInstance,
        'DeadlineIsInPast'
      );
    });

    it('starts new batch sale', async () => {
      const saleIDs = [2, 3];
      const totalTokens = [10, 12];
      const deadlines = [deadline, deadline];
      const pricesPerToken = [15, 15];
      const URIs = ['', ''];
      await expect(investInstance.startNewSales(saleIDs, totalTokens, deadlines, pricesPerToken, URIs))
        .to.emit(investInstance, 'BatchSaleStarted')
        .withArgs(saleIDs, totalTokens, deadlines, pricesPerToken);
    });

    it('reverts the transaction as one of the sales has already started', async () => {
      const saleIDs = [3, 4];
      const totalTokens = [10, 12];
      const deadlines = [0, 0];
      const pricesPerToken = [15, 15];
      const URIs = ['', ''];
      await expect(investInstance.startNewSales(saleIDs, totalTokens, deadlines, pricesPerToken, URIs))
        .to.be.revertedWithCustomError(investInstance, 'SaleAlreadyStarted')
        .withArgs(saleIDs[0]);
    });
  });

  describe('04 - Investing', () => {
    it('reverts the transaction as sale is not active', async () => {
      await expect(investInstance.invest(4, 1)).to.be.revertedWith('SALE_NOT_ACTIVE');
    });

    it('starts new sale', async () => {
      await expect(investInstance.startNewSale(4, 10, deadline, 10, '')).to.emit(investInstance, 'SaleStarted').withArgs(4, 10, deadline, 10);
    });

    it('reverts the transaction as user tried to buy too many tokens', async () => {
      await expect(investInstance.invest(4, 11)).to.be.revertedWithCustomError(investInstance, 'TooManyTokens').withArgs(11, 10);
    });

    it('reverts the transaction as user sent wrong amount of Ether sent', async () => {
      await expect(investInstance.invest(4, 1, { value: 9 }))
        .to.be.revertedWithCustomError(investInstance, 'WrongAmountOfEther')
        .withArgs(9, 10);
    });

    it('verifies that investor can buy 1 token', async () => {
      await expect(investInstance.invest(4, 1, { value: 10 }))
        .to.emit(investInstance, 'UserInvested')
        .withArgs(deployer.address, 4, 1);
    });

    it('reverts the transaction as there are no more tokens left', async () => {
      // buy remaning 9 tokens
      await expect(investInstance.invest(4, 9, { value: 90 }))
        .to.emit(investInstance, 'UserInvested')
        .withArgs(deployer.address, 4, 9);

      // next call should fail as there are no tokens left
      await expect(investInstance.invest(4, 1, { value: 10 }))
        .to.be.revertedWithCustomError(investInstance, 'TooManyTokens')
        .withArgs(1, 0);
    });
  });

  describe('05 - Finalizing the sale', () => {
    it('reverts the transaction as sale is not active', async () => {
      await expect(investInstance.finalizeSale(5)).to.be.revertedWith('SALE_NOT_ACTIVE');
    });

    it('starts new sale', async () => {
      await expect(investInstance.startNewSale(5, 10, deadline, 10, '')).to.emit(investInstance, 'SaleStarted').withArgs(5, 10, deadline, 10);
    });

    it('reverts the transaction as owner is trying to finalize the sale that is not over yet', async () => {
      await expect(investInstance.finalizeSale(5)).to.be.revertedWith('SALE_NOT_OVER');
    });

    it('verifies that investor can buy all tokens', async () => {
      // buying all tokens
      await expect(investInstance.invest(5, 10, { value: 100 }))
        .to.emit(investInstance, 'UserInvested')
        .withArgs(deployer.address, 5, 10);
    });

    it('reverts as the user tries to invest in a sale that has the deadline in the past', async () => {
      await time.increaseTo(deadline + 1); // fast forward time
      deadline = await getDeadlineTimestamp(); // update deadline after timestamp manipulations
      await expect(investInstance.invest(5, 1, { value: 10 })).to.be.revertedWith('SALE_IS_OVER');
    });

    it('verifies that owner can finalize the sale', async () => {
      await expect(investInstance.finalizeSale(5)).to.emit(investInstance, 'SaleFinalized').withArgs(5, saleStatus.Sold);
    });

    it('checks that the sale was finalized correctly', async () => {
      const saleInfo = await investInstance.getSaleInfo(5);
      expect(saleInfo['status']).to.be.equal(saleStatus.Sold);
    });

    it('reverts as a user tries to invest in a sale that is over', async () => {
      await expect(investInstance.invest(5, 1, { value: 10 })).to.be.revertedWith('SALE_NOT_ACTIVE');
    });
  });

  describe('06 - Withdrawing invested Ether', () => {
    before('starts new sale', async () => {
      await expect(investInstance.startNewSale(6, 10, deadline, 10, '')).to.emit(investInstance, 'SaleStarted').withArgs(6, 10, deadline, 10);
    });

    it('reverts as owner tries to withdraw ETH when the sale is not over', async () => {
      await expect(investInstance.withdrawInvestedETH(6)).to.be.revertedWith('SALE_NOT_SOLD');
    });

    it('verifies that owner can withdraw ETH when the sale is over', async () => {
      // buy all available tokens to end the sale
      await expect(investInstance.invest(6, 10, { value: 100 }))
        .to.emit(investInstance, 'UserInvested')
        .withArgs(deployer.address, 6, 10);

      // finalize the sale
      await expect(investInstance.finalizeSale(6)).to.emit(investInstance, 'SaleFinalized').withArgs(6, saleStatus.Sold);

      // withdraw invested ETH
      await expect(investInstance.withdrawInvestedETH(6)).to.changeEtherBalance(deployer.address, 100);
    });
  });

  describe('07 - Refunding', () => {
    let closeDeadline;
    it('starts new sale', async () => {
      closeDeadline = await getDeadlineTimestamp(300); // 5 min deadline
      await expect(investInstance.startNewSale(7, 10, closeDeadline, 10, '')).to.emit(investInstance, 'SaleStarted').withArgs(7, 10, closeDeadline, 10);
    });

    it('reverts when trying to get a refund as it is not a refund period', async () => {
      await expect(investInstance.getRefund(4)).to.be.revertedWith('NOT_REFUND_PERIOD');
    });

    it('reverts as owner tries to sweep ETH for an ongoing sale', async () => {
      await expect(investInstance.sweepETH(7)).to.be.revertedWith('CANT_SWEEP_YET');
    });

    it('verifies that investor can get a refund', async () => {
      // start new sale
      await expect(investInstance.invest(7, 1, { value: 10 }))
        .to.emit(investInstance, 'UserInvested')
        .withArgs(deployer.address, 7, 1);

      // buy one token
      await expect(investInstance.connect(otherUser).invest(7, 1, { value: 10 }))
        .to.emit(investInstance, 'UserInvested')
        .withArgs(otherUser.address, 7, 1);

      // fast forward time
      await time.increaseTo(closeDeadline + 1);

      // finalize the sale
      await expect(investInstance.finalizeSale(7)).to.emit(investInstance, 'SaleFinalized').withArgs(7, saleStatus.Refund);

      // check that the investor can receive a refund
      await expect(investInstance.getRefund(7)).to.emit(investInstance, 'RefundSent').withArgs(deployer.address, 7, 10);
    });

    it('reverts as an investor tries to receive a refund second time', async () => {
      await expect(investInstance.getRefund(7)).to.be.revertedWith('REFUND_ZERO_BALANCE');
    });

    it('ends the refund period by fast forwarding the time', async () => {
      const twoWeekDeadline = await getDeadlineTimestamp(60 * 60 * 24 * 14);
      await time.increaseTo(twoWeekDeadline + 1);
    });

    it('reverts as investor tries to receive a refund after the refund period ended', async () => {
      await expect(investInstance.connect(otherUser).getRefund(7)).to.be.revertedWith('REFUND_PERIOD_ENDED');
    });

    it('verifies that the owner can withdraw remaining Ether after the refund period ended', async () => {
      await expect(investInstance.sweepETH(7)).to.changeEtherBalance(deployer.address, 10);
    });

    it('reverts as there is nothing left to be swept by the owner', async () => {
      await expect(investInstance.sweepETH(7)).to.be.revertedWith('NO_ETH_LEFT');
    });
  });

  describe('08 - Changing the Invest contract', () => {
    let newInvestInstance;

    before('deploys a new invest contract', async () => {
      const Invest = await hre.ethers.getContractFactory('Invest');
      newInvestInstance = await Invest.deploy();
      await newInvestInstance.deployed();
      await newInvestInstance.setCarNFTContract(carRentNFTInstance.address);
    });

    it('reverts as we are trying to set the zero address as the new invest contract address', async () => {
      await expect(investInstance.upgradeInvestContract(hre.ethers.constants.AddressZero)).to.be.revertedWith('INVEST_ADDR_IS_ZERO');
    });

    it('changes the invest contract to a new one', async () => {
      await expect(investInstance.upgradeInvestContract(newInvestInstance.address))
        .to.emit(carRentNFTInstance, 'InvestContractChanged')
        .withArgs(investInstance.address, newInvestInstance.address);
    });

    it('reverts as we are trying to start a new sale from the old invest contract', async () => {
      deadline = await getDeadlineTimestamp(); // update the deadline after the block timestamp manipulations

      await expect(investInstance.startNewSale(8, 10, deadline, 10, '')).to.be.revertedWith('NOT_INVEST_CONTRACT');
    });

    it('verifies that a new sale can be started from the new contract', async () => {
      await expect(newInvestInstance.startNewSale(8, 10, deadline, 10, '')).to.emit(newInvestInstance, 'SaleStarted').withArgs(8, 10, deadline, 10);
    });

    it('changes the invest contract back', async () => {
      await expect(newInvestInstance.upgradeInvestContract(investInstance.address))
        .to.emit(carRentNFTInstance, 'InvestContractChanged')
        .withArgs(newInvestInstance.address, investInstance.address);
    });
  });
});
