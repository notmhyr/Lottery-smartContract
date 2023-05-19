const { network, ethers } = require("hardhat");
const { networkConfig } = require("../helper.config");
require("dotenv").config();
const { verify } = require("../utils/verify");

const VRF_SUB_ETH_AMOUNT = ethers.utils.parseEther("10");

module.exports = async ({ deployments, getNamedAccounts }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  let vrfCoordinatorAddress,
    vrfCoordinatorMock,
    priceFeedAddress,
    subscriptionId;

  if (chainId == 31337) {
    vrfCoordinatorMock = await ethers.getContract("VRFCoordinatorV2Mock");
    vrfCoordinatorAddress = vrfCoordinatorMock.address;
    priceFeedAddress = (await ethers.getContract("MockV3Aggregator")).address;
    const tx = await vrfCoordinatorMock.createSubscription();
    const txReceipt = await tx.wait(1);
    subscriptionId = txReceipt.events[0].args.subId;

    await vrfCoordinatorMock.fundSubscription(
      subscriptionId,
      VRF_SUB_ETH_AMOUNT
    );
  } else {
    vrfCoordinatorAddress = networkConfig[chainId].vrfCoordinatorAddress;
    priceFeedAddress = networkConfig[chainId].priceFeedAddress;
    subscriptionId = networkConfig[chainId].subscriptionId;
  }

  const entranceFee = networkConfig[chainId].entranceFee;
  const platformFee = networkConfig[chainId].platformFee;
  const timeInterval = networkConfig[chainId].timeInterval;
  const gasLane = networkConfig[chainId].gasLane;
  const callbackGasLimit = networkConfig[chainId].callbackGasLimit;

  // lottery contract arguments
  const args = [
    entranceFee,
    platformFee,
    priceFeedAddress,
    timeInterval,
    vrfCoordinatorAddress,
    subscriptionId,
    gasLane,
    callbackGasLimit,
  ];

  log("deploying lottery...");

  const lottery = await deploy("Lottery", {
    from: deployer,
    log: true,
    args: args,
    waitConfirmations: network.config.blockConfirmations || 1,
  });

  if (chainId == 31337) {
    await vrfCoordinatorMock.addConsumer(subscriptionId, lottery.address);
  }
  log("--------------------------------");

  //verify the contract if we are not on local network
  if (chainId !== 31337 && process.env.ETHERSCAN_API_KEY) {
    await verify(lottery.address, args);
  }
};

module.exports.tags = ["all", "lottery"];
