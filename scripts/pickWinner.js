const { ethers } = require("hardhat");

// using this script only for local chain and testing
const main = async () => {
  const lottery = await ethers.getContract("Lottery");
  const vrfCoordinatorMock = await ethers.getContract("VRFCoordinatorV2Mock");

  const tx = await lottery.performUpkeep([]);
  const txReceipt = await tx.wait(1);
  const requestId = txReceipt.events[1].args.requestId;
  await vrfCoordinatorMock.fulfillRandomWords(requestId, lottery.address);
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
