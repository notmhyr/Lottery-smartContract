const { network } = require("hardhat");

const DECIMALS = "8";
const INITIAL_ANSWER = "200000000000";

module.exports = async ({ deployments, getNamedAccounts }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  const args = [DECIMALS, INITIAL_ANSWER];

  if (chainId == 31337) {
    log("local network detected deploying price feed mocks...");
    const priceFeedMock = await deploy("MockV3Aggregator", {
      from: deployer,
      log: true,
      args: args,
    });
  }
};

module.exports.tags = ["all", "pricefeedmock"];
