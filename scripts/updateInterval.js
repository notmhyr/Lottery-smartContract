const { ethers } = require("hardhat");

const main = async () => {
  const lottery = await ethers.getContract("Lottery");

  const tx = await lottery.updateTimeInterval(240);
  await tx.wait();
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
