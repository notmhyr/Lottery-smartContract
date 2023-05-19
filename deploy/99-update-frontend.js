const fs = require("fs");
const { ethers, network } = require("hardhat");
require("dotenv").config();
const chainId = network.config.chainId;

const frontend_constant_file = "E:/lottery-client/constants";
const frontend_contract_addresses_file =
  "E:/lottery-client/constants/lotteryAddress.json";

let lottery;
module.exports = async () => {
  if (process.env.UPDATE_FRONTEND) {
    lottery = await ethers.getContract("Lottery");
    updateAbis();
    updateAddresses();
  }
};

const updateAbis = () => {
  console.log("updating abis...");

  fs.writeFileSync(
    `${frontend_constant_file}/lotteryAbi.js`,
    lottery.interface.format(ethers.utils.FormatTypes.json)
  );
};

const updateAddresses = () => {
  console.log("updating addresses...");

  // reading the file
  const currentAddresses = JSON.parse(
    fs.readFileSync(frontend_contract_addresses_file, "utf8")
  );

  if (chainId in currentAddresses) {
    if (currentAddresses[chainId] !== lottery.address) {
      currentAddresses[chainId] = lottery.address;
    }
  } else {
    currentAddresses[chainId] = lottery.address;
  }

  fs.writeFileSync(
    frontend_contract_addresses_file,
    JSON.stringify(currentAddresses)
  );
};

module.exports.tags = ["all", "frontend"];
