// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import '@openzeppelin/contracts/interfaces/IERC1155.sol';

interface ICarRentNFT is IERC1155 {
  function mint(
    uint256 id,
    uint256 amount,
    string calldata newURI
  ) external;

  function mintBatch(
    uint256[] calldata ids,
    uint256[] calldata amounts,
    string[] calldata newURIs
  ) external;

  function updateURI(uint256 id, string calldata newURI) external;

  function changeInvestContractAddress(address newAddress) external;

  function burn(
    address from,
    uint256 id,
    uint256 amount
  ) external;
}
