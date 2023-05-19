const { ethers, network } = require("hardhat");

module.exports = async ({ deployments, getNamedAccounts }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  const BASE_FEE = ethers.utils.parseEther("0.25");
  const GAS_PRICE_LINK = 1e9;

  const args = [BASE_FEE, GAS_PRICE_LINK];

  if (chainId == 31337) {
    log("local network detected deploying vrf mock...");
    const vrfMock = await deploy("VRFCoordinatorV2Mock", {
      from: deployer,
      log: true,
      args: args,
    });

    log("------------------------------");
  }
};

module.exports.tags = ["all", "vrfmock"];
