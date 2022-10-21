// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import '@openzeppelin/contracts/access/Ownable.sol';
import './IInvest.sol';
import './ICarRentNFT.sol';
import '@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol';

error WrongAmountOfEther(uint256 received, uint256 required);

contract Rewards is Ownable, ERC1155Holder {
  address private investContract;
  address private carRentNFTContract;
  uint256 private withdrawableByOwner;
  uint256[] private allCars;
  mapping(uint256 => mapping(address => Registry)) private usersRegistry;
  mapping(uint256 => RentalCar) private carsInfo;

  struct RentalCar {
    uint256 carRentingDeadline;
    uint256 rentPricePerDay;
    uint256 totalTokensLocked;
    uint256 totalAvailableRewardPerToken;
  }

  struct Registry {
    uint256 lockedTokens;
    uint256 toWithdraw;
    uint256 receivedRewardPerToken;
  }

  event NewCarAdded(uint256 id, uint256 price);
  event CarWasRented(uint256 id, uint256 _days, address renter);
  event InvestorWithdrawedReward(uint256 id, address investor, uint256 amount);
  event InvestorLockedTokens(uint256 id, address investor, uint256 tokenAmount, uint256 tokensTotal);
  event InvestorUnlockedTokens(uint256 id, address investor, uint256 tokenAmount, uint256 tokensLeft);
  event UpdatedInvestorClaimableReward(uint256 id, address investor, uint256 newClaimableAmount);

  modifier existingCarsOnly(uint256 id) {
    require(carExists(id), 'WRONG_CAR_ID');
    _;
  }

  modifier investorsOnly(uint256 id) {
    require(ICarRentNFT(carRentNFTContract).balanceOf(msg.sender, id) > 0, 'NOT_INVESTOR');
    _;
  }

  modifier hasLockedTokens(uint256 id) {
    require(getUserLockedTokens(id, msg.sender) > 0, 'NO_LOCKED_TOKENS');
    _;
  }

  constructor(address _investContract, address _carRentNFTContract) {
    require(_investContract != address(0), 'INVEST_ADDR_ZERO');
    require(_carRentNFTContract != address(0), 'NFT_ADDR_ZERO');
    investContract = _investContract;
    carRentNFTContract = _carRentNFTContract;
  }

  /*
        @dev: user has to lock his tokens in order to receive his part of the reward from the rented car
    */
  function lock(uint256 id, uint256 amount) external existingCarsOnly(id) investorsOnly(id) {
    _beforeTokenTransfer(id);
    ICarRentNFT(carRentNFTContract).safeTransferFrom(msg.sender, address(this), id, amount, '');
    usersRegistry[id][msg.sender].lockedTokens += amount;
    carsInfo[id].totalTokensLocked += amount;
    emit InvestorLockedTokens(id, msg.sender, amount, usersRegistry[id][msg.sender].lockedTokens);
  }

  /* 
        @dev: if user wants to sell his token to someone else - he can withdraw it at any time
    */
  function unlock(uint256 id, uint256 amount) external existingCarsOnly(id) hasLockedTokens(id) {
    require(amount <= getUserLockedTokens(id, msg.sender), 'TOO_MANY_TOKENS');
    _beforeTokenTransfer(id);
    ICarRentNFT(carRentNFTContract).safeTransferFrom(address(this), msg.sender, id, amount, '');
    usersRegistry[id][msg.sender].lockedTokens -= amount;
    carsInfo[id].totalTokensLocked -= amount;
    emit InvestorUnlockedTokens(id, msg.sender, amount, usersRegistry[id][msg.sender].lockedTokens);
  }

  /*
        @dev: as soon as the car was bought the owner can add it to the list of cars so that users can rent it
    */
  function addCar(uint256 id, uint256 rentalPrice) external onlyOwner {
    require(IInvest(investContract).getSaleInfo(id).status == IInvest.Status.WithdrawnByOwner, 'NOT_BOUGHT_YET');
    require(rentalPrice >= IInvest(investContract).getSaleInfo(id).tokensTotal, 'RENT_PRICE_TOO_LOW');
    RentalCar memory newCar = RentalCar(0, rentalPrice, 0, 0);
    carsInfo[id] = newCar;
    allCars.push(id);
    emit NewCarAdded(id, rentalPrice);
  }

  /* 
        @dev: users can rent a car which was already bought and isn't rented at the moment
    */
  function rentCar(uint256 id, uint256 daysToRentFor) external payable existingCarsOnly(id) {
    require(daysToRentFor > 0, 'ZERO_DAYS_RENTAL');
    require(carIsAvailable(id), 'CAR_IS_RENTED');
    RentalCar memory carToRent = getCarInfo(id);
    if (carToRent.rentPricePerDay * daysToRentFor != msg.value) {
      revert WrongAmountOfEther(msg.value, carToRent.rentPricePerDay * daysToRentFor);
    }
    carToRent.carRentingDeadline = block.timestamp + (daysToRentFor * 1 days);
    uint256 totalLockedTokens = getTotalLockedTokens(id);
    if (totalLockedTokens == 0) {
      // if investors didn't lock their tokens - they won't receive the reward, and the owner can withdraw it by himself
      withdrawableByOwner += msg.value;
    } else {
      uint256 rewardPerToken = msg.value / totalLockedTokens;
      carToRent.totalAvailableRewardPerToken += rewardPerToken;
    }
    carsInfo[id] = carToRent;
    emit CarWasRented(id, daysToRentFor, msg.sender);
  }

  /*
        @dev: users can withdraw reward that they claimed at any time without the further need to have tokens locked in the contract
    */
  function withdrawReward(uint256 id) public existingCarsOnly(id) {
    require(getWithdrawableReward(id, msg.sender) > 0, 'NO_WITHDRAWABLE_REWARD');
    uint256 withdrawAmount = getWithdrawableReward(id, msg.sender);
    usersRegistry[id][msg.sender].toWithdraw = 0;
    emit InvestorWithdrawedReward(id, msg.sender, withdrawAmount);
    (bool result, ) = msg.sender.call{value: withdrawAmount}('');
    require(result, 'ETH_TRANSFER_FAILED');
  }

  function sweepAvailableETH() external onlyOwner {
    require(withdrawableByOwner > 0, 'NOTHING_TO_SWEEP');
    uint256 withdrawAmount = withdrawableByOwner;
    withdrawableByOwner = 0;
    (bool result, ) = msg.sender.call{value: withdrawAmount}('');
    require(result, 'CALL_FAILED');
  }

  /*
        @dev: all users who had locked tokens when the car was rented are eligible to claim their part of the reward as soon as they want
    */
  function claimReward(uint256 id) public existingCarsOnly(id) hasLockedTokens(id) {
    require(getClaimableReward(id, msg.sender) > 0, 'NO_CLAIMABLE_REWARD');
    Registry memory investorData = usersRegistry[id][msg.sender];
    uint256 claimableRewardPerToken = getClaimableReward(id, msg.sender);
    investorData.toWithdraw += claimableRewardPerToken * investorData.lockedTokens;
    investorData.receivedRewardPerToken = carsInfo[id].totalAvailableRewardPerToken;
    usersRegistry[id][msg.sender] = investorData;
    emit UpdatedInvestorClaimableReward(id, msg.sender, investorData.toWithdraw);
  }

  /*
        @dev: this function is called before locking and unlocking tokens to prevent users from cheating and receiving more rewards than they should
    */
  function _beforeTokenTransfer(uint256 id) internal {
    if (getClaimableReward(id, msg.sender) > 0) {
      if (getUserLockedTokens(id, msg.sender) > 0) {
        claimReward(id);
      } else {
        usersRegistry[id][msg.sender].receivedRewardPerToken = carsInfo[id].totalAvailableRewardPerToken;
      }
    }
  }

  function carIsAvailable(uint256 id) public view existingCarsOnly(id) returns (bool) {
    return block.timestamp > getCarInfo(id).carRentingDeadline;
  }

  function getCarInfo(uint256 id) public view existingCarsOnly(id) returns (RentalCar memory) {
    return carsInfo[id];
  }

  function getUserLockedTokens(uint256 id, address investor) public view existingCarsOnly(id) returns (uint256) {
    return usersRegistry[id][investor].lockedTokens;
  }

  function getTotalLockedTokens(uint256 id) public view existingCarsOnly(id) returns (uint256) {
    return carsInfo[id].totalTokensLocked;
  }

  function getClaimableReward(uint256 id, address investor) public view existingCarsOnly(id) returns (uint256) {
    return carsInfo[id].totalAvailableRewardPerToken - usersRegistry[id][investor].receivedRewardPerToken;
  }

  function getWithdrawableReward(uint256 id, address investor) public view existingCarsOnly(id) hasLockedTokens(id) returns (uint256) {
    return usersRegistry[id][investor].toWithdraw;
  }

  function carExists(uint256 id) public view returns (bool) {
    return carsInfo[id].rentPricePerDay > 0;
  }

  function getAllCars() external view returns (uint256[] memory) {
    return allCars;
  }
}
