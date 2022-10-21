// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IInvest {
  enum Status {
    Inactive,
    Active,
    Sold,
    Refund,
    WithdrawnByOwner
  }

  struct Sale {
    Status status;
    uint256 tokensTotal;
    uint256 tokensOwnedByUsers;
    uint256 deadline;
    uint256 refundDeadline;
    uint256 pricePerToken;
  }

  event SaleFinalized(uint256 id, Status outcome);
  event RefundSent(address receiver, uint256 id, uint256 amount);
  event UserInvested(address investor, uint256 id, uint256 tokenAmount);
  event SaleStarted(uint256 id, uint256 amount, uint256 saleDeadline, uint256 pricePerToken);
  event BatchSaleStarted(uint256[] ids, uint256[] amounts, uint256[] saleDeadlines, uint256[] pricesPerToken);
  event NFTContractSet(address _contract);
  event URIUpdated(uint256 id, string newURI);
  event OwnerReceivedETH(uint256 id);

  function finalizeSale(uint256 id) external;

  function getRefund(uint256 id) external;

  function sweepETH(uint256 id) external;

  function withdrawInvestedETH(uint256 id) external;

  function invest(uint256 id, uint256 tokenAmount) external payable;

  function startNewSale(
    uint256 id,
    uint256 amount,
    uint256 saleDeadline,
    uint256 pricePerToken,
    string calldata metadataURI
  ) external;

  function startNewSales(
    uint256[] calldata ids,
    uint256[] calldata amounts,
    uint256[] calldata saleDeadlines,
    uint256[] calldata pricesPerToken,
    string[] calldata newURIs
  ) external;

  function setCarNFTContract(address _contract) external;

  function updateURI(uint256 id, string calldata newURI) external;

  function upgradeInvestContract(address newAddress) external;

  function getSaleInfo(uint256 id) external view returns (Sale memory);
}
