// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Uncomment this line to use console.log
//import "hardhat/console.sol";
import '@openzeppelin/contracts/token/ERC1155/ERC1155.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import './ICarRentNFT.sol';

contract CarRentNFT is ICarRentNFT, ERC1155 {
  address private investContractAddress;
  mapping(uint256 => string) private tokenURIs;

  modifier investOnly() {
    require(msg.sender == investContractAddress, 'NOT_INVEST_CONTRACT');
    _;
  }

  event InvestContractChanged(address old, address _new);

  constructor(address _investContractAddress) ERC1155('') {
    require(_investContractAddress != address(0), 'INVEST_ADDR_IS_ZERO');
    investContractAddress = _investContractAddress;
  }

  function mint(
    uint256 id,
    uint256 amount,
    string calldata newURI
  ) external investOnly {
    _mint(msg.sender, id, amount, '');
    _setURI(newURI, id);
  }

  function mintBatch(
    uint256[] calldata ids,
    uint256[] calldata amounts,
    string[] calldata newURIs
  ) external investOnly {
    _mintBatch(msg.sender, ids, amounts, '');
    for (uint256 i = 0; i < newURIs.length; i++) {
      _setURI(newURIs[i], ids[i]);
    }
  }

  function _setURI(string calldata newURI, uint256 id) internal {
    tokenURIs[id] = newURI;
  }

  function updateURI(uint256 id, string calldata newURI) external investOnly {
    _setURI(newURI, id);
  }

  function uri(uint256 id) public view override returns (string memory) {
    return tokenURIs[id];
  }

  function changeInvestContractAddress(address newAddress) external investOnly {
    require(newAddress != address(0), 'INVEST_ADDR_IS_ZERO');
    emit InvestContractChanged(investContractAddress, newAddress);
    investContractAddress = newAddress;
  }

  function burn(
    address from,
    uint256 id,
    uint256 amount
  ) external investOnly {
    _burn(from, id, amount);
  }
}
