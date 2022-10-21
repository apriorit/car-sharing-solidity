// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol';
import './ICarRentNFT.sol';
import './IInvest.sol';

error SaleAlreadyStarted(uint256 id);
error DeadlineIsInPast(uint256 id, uint256 deadline, uint256 currentBlockTimestamp);
error WrongAmountOfEther(uint256 received, uint256 required);
error TooManyTokens(uint256 received, uint256 available);

contract Invest is IInvest, Ownable, ERC1155Holder {
  address private carRentNFTContract;
  mapping(uint256 => Sale) private sales;

  /*
        @dev: needed check for many functions in the contract
    */
  modifier carNFTContractIsSet() {
    require(carRentNFTContract != address(0), 'NFT_CONTRACT_NOT_SET');
    _;
  }

  /*
        @dev: finalize the sale if the deadline is in the past or all tokens were sold. If the deadline is in the past and 
              there are unsold tokens - refund period starts and lasts two weeks
        @notice: anyone can finalize the sale. This is done to prevent the owner from stealing the funds from the contract
    */
  function finalizeSale(uint256 id) external {
    Sale memory sale = getSaleInfo(id);
    require(sale.status == Status.Active, 'SALE_NOT_ACTIVE');
    if (block.timestamp > sale.deadline && sale.tokensOwnedByUsers != sale.tokensTotal) {
      sale.status = Status.Refund;
      sale.refundDeadline = block.timestamp + 2 weeks;
    } else if (sale.tokensOwnedByUsers == sale.tokensTotal) {
      sale.status = Status.Sold;
    } else {
      revert('SALE_NOT_OVER');
    }
    sales[id] = sale;
    emit SaleFinalized(id, sale.status);
  }

  /*
        @dev: investors have two weeks to get refund when the sale has ended and there are unsold tokens
    */
  function getRefund(uint256 id) external {
    Sale memory sale = getSaleInfo(id);
    require(sale.status == Status.Refund, 'NOT_REFUND_PERIOD');
    require(sale.refundDeadline > block.timestamp, 'REFUND_PERIOD_ENDED');
    ICarRentNFT carRentNFT = ICarRentNFT(carRentNFTContract);
    require(carRentNFT.balanceOf(msg.sender, id) > 0, 'REFUND_ZERO_BALANCE');
    uint256 userTokens = carRentNFT.balanceOf(msg.sender, id);
    uint256 refundAmount = userTokens * sale.pricePerToken;
    sale.tokensOwnedByUsers -= userTokens;
    sales[id] = sale;
    carRentNFT.burn(msg.sender, id, userTokens);
    emit RefundSent(msg.sender, id, refundAmount);
    (bool result, ) = msg.sender.call{value: refundAmount}('');
    require(result, 'ETH_TRANSFER_FAILED');
  }

  /*
        @dev: if there are users who didn't want a refund and the deadline has passed - the owner can take all remaining Ether for this sale
    */
  function sweepETH(uint256 id) external onlyOwner {
    Sale memory sale = getSaleInfo(id);
    require(sale.status == Status.Refund && sale.refundDeadline < block.timestamp, 'CANT_SWEEP_YET');
    require(sale.tokensOwnedByUsers > 0, 'NO_ETH_LEFT');
    uint256 sweepAmount = sale.pricePerToken * sale.tokensOwnedByUsers;
    sale.tokensOwnedByUsers = 0;
    sales[id] = sale;
    (bool result, ) = msg.sender.call{value: sweepAmount}('');
    require(result, 'ETH_TRANSFER_FAILED');
  }

  /*
        @dev: if all tokens were sold for the specified sale - the owner can withdraw all invested ETH to buy a car for rental 
    */
  function withdrawInvestedETH(uint256 id) external onlyOwner {
    Sale memory sale = getSaleInfo(id);
    require(sale.status == Status.Sold, 'SALE_NOT_SOLD');
    uint256 investedETH = sale.pricePerToken * sale.tokensTotal;
    sale.status = Status.WithdrawnByOwner;
    sales[id] = sale;
    emit OwnerReceivedETH(id);
    (bool result, ) = msg.sender.call{value: investedETH}('');
    require(result, 'ETH_TRANSFER_FAILED');
  }

  /*
        @dev: users can buy any amount of tokens available
    */
  function invest(uint256 id, uint256 tokenAmount) external payable {
    Sale memory sale = getSaleInfo(id);
    require(sale.status == Status.Active, 'SALE_NOT_ACTIVE');
    require(sale.deadline > block.timestamp, 'SALE_IS_OVER');
    if (tokenAmount > sale.tokensTotal - sale.tokensOwnedByUsers) {
      revert TooManyTokens(tokenAmount, sale.tokensTotal - sale.tokensOwnedByUsers);
    } else if (msg.value != tokenAmount * sale.pricePerToken) {
      revert WrongAmountOfEther(msg.value, tokenAmount * sale.pricePerToken);
    }
    ICarRentNFT(carRentNFTContract).safeTransferFrom(address(this), msg.sender, id, tokenAmount, '');
    sale.tokensOwnedByUsers += tokenAmount;
    sales[id] = sale;
    emit UserInvested(msg.sender, id, tokenAmount);
  }

  /*
        @dev: start a new sale with the given params
    */
  function startNewSale(
    uint256 id,
    uint256 amount,
    uint256 saleDeadline,
    uint256 pricePerToken,
    string calldata metadataURI
  ) external onlyOwner carNFTContractIsSet {
    if (!saleIsNotActive(id)) {
      revert SaleAlreadyStarted(id);
    } else if (saleDeadline < block.timestamp) {
      revert DeadlineIsInPast(id, saleDeadline, block.timestamp);
    }
    ICarRentNFT(carRentNFTContract).mint(id, amount, metadataURI);
    Sale memory newSale = Sale(Status.Active, amount, 0, saleDeadline, 0, pricePerToken);
    sales[id] = newSale;
    emit SaleStarted(id, amount, saleDeadline, pricePerToken);
  }

  /*
        @dev: start few sales at once
    */
  function startNewSales(
    uint256[] calldata ids,
    uint256[] calldata amounts,
    uint256[] calldata saleDeadlines,
    uint256[] calldata pricesPerToken,
    string[] calldata newURIs
  ) external onlyOwner carNFTContractIsSet {
    require(saleDeadlines.length == ids.length, 'DEADLINE_ID_SIZE_MISMATCH');
    require(ids.length == pricesPerToken.length, 'PRICE_ID_SIZE_MISMATCH');
    require(newURIs.length == ids.length, 'URI_ID_SIZE_MISMATCH');
    for (uint256 i = 0; i < ids.length; i++) {
      if (!saleIsNotActive(ids[i])) {
        revert SaleAlreadyStarted(ids[i]);
      } else if (saleDeadlines[i] < block.timestamp) {
        revert DeadlineIsInPast(ids[i], saleDeadlines[i], block.timestamp);
      }
    }
    ICarRentNFT(carRentNFTContract).mintBatch(ids, amounts, newURIs);
    for (uint256 i = 0; i < ids.length; i++) {
      Sale memory newSale = Sale(Status.Active, amounts[i], 0, saleDeadlines[i], 0, pricesPerToken[i]);
      sales[ids[i]] = newSale;
    }
    emit BatchSaleStarted(ids, amounts, saleDeadlines, pricesPerToken);
  }

  /*
        @dev: set the CarNFT contract if it is not set yet
    */
  function setCarNFTContract(address _contract) external onlyOwner {
    require(carRentNFTContract == address(0), 'NFT_CONTRACT_ALREADY_SET');
    require(_contract != address(0), 'NFT_ADDR_IS_ZERO');
    carRentNFTContract = _contract;
    emit NFTContractSet(_contract);
  }

  /*
        @dev: update the uri with the metadata for the given id
    */
  function updateURI(uint256 id, string calldata newURI) external onlyOwner carNFTContractIsSet {
    ICarRentNFT(carRentNFTContract).updateURI(id, newURI);
    emit URIUpdated(id, newURI);
  }

  /*
        @dev: set new invest contract in the NFT contract
    */
  function upgradeInvestContract(address newAddress) external onlyOwner carNFTContractIsSet {
    ICarRentNFT(carRentNFTContract).changeInvestContractAddress(newAddress);
  }

  /*
        @dev: get info about the given sale
    */
  function getSaleInfo(uint256 id) public view returns (Sale memory) {
    return sales[id];
  }

  function saleIsNotActive(uint256 id) private view returns (bool result) {
    result = sales[id].status == Status.Inactive;
  }
}
