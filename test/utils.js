const { time } = require('@nomicfoundation/hardhat-network-helpers');

async function getDeadlineTimestamp(deadlineInSeconds = 3600) {
  const latestBlockTimestamp = await time.latest();
  const currentTime = Math.floor(Date.now() / 1000);
  let deadline = currentTime > latestBlockTimestamp ? currentTime : latestBlockTimestamp;
  deadline += deadlineInSeconds;
  return deadline;
}

const saleStatus = {
  Inactive: 0,
  Active: 1,
  Sold: 2,
  Refund: 3,
  WithdrawnByOwner: 4
};

module.exports = { getDeadlineTimestamp, saleStatus };
