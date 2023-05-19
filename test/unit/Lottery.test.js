const { network, deployments, ethers, getNamedAccounts } = require("hardhat");
const { assert, expect } = require("chai");
const { networkConfig } = require("../../helper.config");

const chainId = network.config.chainId;

chainId !== 31337
  ? describe.skip
  : describe("Lottery", () => {
      let lottery,
        vrfCoordinatorMock,
        mockAggregator,
        deployer,
        player,
        interval;
      beforeEach(async () => {
        await deployments.fixture(["all"]);
        deployer = (await getNamedAccounts()).deployer;
        player = (await getNamedAccounts()).player;
        lottery = await ethers.getContract("Lottery", deployer);
        vrfCoordinatorMock = await ethers.getContract("VRFCoordinatorV2Mock");
        mockAggregator = await ethers.getContract("MockV3Aggregator");
        interval = (await lottery.timeInterval()).toNumber();
      });

      describe("constructor", () => {
        it("initialize the Lottery correctly", async () => {
          const lotteryState = await lottery.lotteryState();
          const timeInterval = await lottery.timeInterval();
          const entranceFee = await lottery.entranceFee();
          const priceFeed = await lottery.priceFeed();
          const vrfCoordinator = await lottery.vrfCoordinatorV2();

          assert.equal(lotteryState.toString(), "0");
          assert.equal(
            timeInterval.toString(),
            networkConfig[chainId].timeInterval.toString()
          );
          const expectedEntranceFee = networkConfig[chainId].entranceFee;
          assert.equal(
            entranceFee.toString(),
            ethers.utils.parseEther(expectedEntranceFee.toString()).toString()
          );
          assert.equal(priceFeed, mockAggregator.address);
          assert.equal(vrfCoordinator, vrfCoordinatorMock.address);
        });
      });

      describe("join lottery", () => {
        it("fails if not enough value sent", async () => {
          await expect(lottery.joinLottery()).to.be.revertedWith(
            "insufficient funds"
          );
        });

        it("enter the lottery successfully", async () => {
          const amount = ethers.utils.parseEther("1");
          await expect(lottery.joinLottery({ value: amount })).to.emit(
            lottery,
            "LotteryJoin"
          );
          const enteredPlayer = await lottery.players(0);
          const lotteryBalance = await lottery.lotteryBalance();

          assert.equal(enteredPlayer, deployer);
          assert.equal(lotteryBalance.toString(), amount.toString());
        });

        it("fails if lottery is in calculating state", async () => {
          const amount = ethers.utils.parseEther("1");
          await lottery.joinLottery({ value: amount });
          network.provider.send("evm_increaseTime", [interval + 1]);
          network.provider.send("evm_mine", []);
          await lottery.performUpkeep([]);

          await expect(
            lottery.joinLottery({ value: amount })
          ).to.be.revertedWith("Lottery is not open");
        });
      });

      describe("check upkeep", () => {
        it("returns false if no players exist", async () => {
          network.provider.send("evm_increaseTime", [interval + 1]);
          network.provider.send("evm_mine", []);

          const { upkeepNeeded } = await lottery.checkUpkeep([]);

          assert(!upkeepNeeded);
        });

        it("returns false if enough time not passes", async () => {
          const amount = ethers.utils.parseEther("1");
          await lottery.joinLottery({ value: amount });

          const { upkeepNeeded } = await lottery.checkUpkeep([]);
          console.log(upkeepNeeded);
          assert(!upkeepNeeded);
        });

        it("return false if lottery in in calculating state", async () => {
          const amount = ethers.utils.parseEther("1");
          await lottery.joinLottery({ value: amount });
          network.provider.send("evm_increaseTime", [interval + 1]);
          network.provider.send("evm_mine", []);
          await lottery.performUpkeep([]);

          const { upkeepNeeded } = await lottery.checkUpkeep([]);
          assert(!upkeepNeeded);
        });

        it("returns true if enough time passed, has players, has balance and it's in OPEN state", async () => {
          const amount = ethers.utils.parseEther("1");
          await lottery.joinLottery({ value: amount });
          network.provider.send("evm_increaseTime", [interval + 1]);
          network.provider.send("evm_mine", []);

          const { upkeepNeeded } = await lottery.checkUpkeep([]);
          assert(upkeepNeeded);
        });
      });

      describe("perform upkeep", () => {
        it("fails if upKeep not needed", async () => {
          await expect(lottery.performUpkeep([])).to.be.revertedWith(
            "upkeep not needed"
          );
        });

        it("change the state to CALCULATING and send request for random words", async () => {
          const amount = ethers.utils.parseEther("1");
          await lottery.joinLottery({ value: amount });
          network.provider.send("evm_increaseTime", [interval + 1]);
          network.provider.send("evm_mine", []);

          const tx = await lottery.performUpkeep([]);
          const txReceipt = await tx.wait(1);

          const requestId = txReceipt.events[1].args.requestId;
          const lotteryState = await lottery.lotteryState();
          assert(requestId.toNumber() > 0);
          assert.equal(lotteryState.toString(), "1");
        });
      });

      describe("fulfill random words", () => {
        const amount = ethers.utils.parseEther("1");

        beforeEach(async () => {
          const tx = await lottery.joinLottery({ value: amount });
          await tx.wait(1);
          network.provider.send("evm_increaseTime", [interval + 1]);
          network.provider.send("evm_mine", []);
        });

        it("can be called only after perform upkeep", async () => {
          await expect(
            vrfCoordinatorMock.fulfillRandomWords(0, lottery.address)
          ).to.be.revertedWith("nonexistent request");
        });

        it("picks a winner and update the state", async () => {
          const accounts = await ethers.getSigners();
          const numPlayers = 3;

          // adding 3 players into the lottery
          for (let i = 1; i <= numPlayers; i++) {
            const connectedPlayer = lottery.connect(accounts[i]);

            await connectedPlayer.joinLottery({ value: amount });
          }

          const startingTimestamp = await lottery.endTime();

          await new Promise(async (resolve, reject) => {
            console.log("promise is running...");

            lottery.once("WinnerPicked", async () => {
              console.log("event fired!");
              try {
                const recentWinner = await lottery.recentWinner();
                const expectedWinner = accounts[1].address; // vrf mock always return 1 as random number
                const lotteryState = await lottery.lotteryState();
                const endingTimestamp = await lottery.endTime();
                const numOfPlayers = await lottery.getNumberOfPlayers();

                // calculate the expected owner fee and winned amount
                const platformFee = await lottery.platformFee();
                const totalLotteryBalance = ethers.utils.parseEther("4"); // because 4 players joined with 1eth
                const ownerFee = totalLotteryBalance.mul(platformFee).div(1000);
                const winnedAmount = totalLotteryBalance.sub(ownerFee);

                const ownerBalance = await lottery.balance(deployer);
                const winnerBalance = await lottery.balance(recentWinner);

                assert.equal(recentWinner, expectedWinner);
                assert.equal(ownerBalance.toString(), ownerFee.toString());
                assert.equal(winnerBalance.toString(), winnedAmount.toString());
                assert.equal(lotteryState.toString(), "0");
                assert(endingTimestamp > startingTimestamp);
                assert.equal(numOfPlayers.toString(), "0");
                resolve();
              } catch (error) {
                console.log(error);
                reject(error);
              }
            });

            console.log("running perform upkeep");
            const tx = await lottery.performUpkeep([]);
            const txReceipt = await tx.wait(1);
            const requestId = txReceipt.events[1].args.requestId;
            await vrfCoordinatorMock.fulfillRandomWords(
              requestId,
              lottery.address
            );
          });
        });
      });

      describe("withdraw", () => {
        const amount = ethers.utils.parseEther("1");
        let accounts;
        beforeEach(async () => {
          accounts = await ethers.getSigners();
          await lottery.joinLottery({ value: amount });
          const connectedAcc = lottery.connect(accounts[1]);
          await connectedAcc.joinLottery({ value: amount });

          network.provider.send("evm_increaseTime", [interval + 1]);
          network.provider.send("evm_mine", []);

          // call the perform upKeep and waits till winner get picked
          await new Promise(async (resolve, reject) => {
            lottery.once("WinnerPicked", () => {
              resolve();
            });

            const tx = await lottery.performUpkeep([]);
            const txReceipt = await tx.wait(1);
            const requestId = txReceipt.events[1].args.requestId;
            await vrfCoordinatorMock.fulfillRandomWords(
              requestId,
              lottery.address
            );
          });
        });

        it("fails if caller have no balance", async () => {
          const connectedAcc = lottery.connect(accounts[2]);
          await expect(connectedAcc.withdraw()).to.be.revertedWith(
            "No balance"
          );
        });

        it("withdraw the balance successfully", async () => {
          // calculate the expected owner fee and winned amount
          const platformFee = await lottery.platformFee();
          const totalLotteryBalance = ethers.utils.parseEther("2"); // because 2 players joined with 1eth
          const ownerFee = totalLotteryBalance.mul(platformFee).div(1000);
          const winnedAmount = totalLotteryBalance.sub(ownerFee);

          const ownerBalanceBefore = await accounts[0].getBalance();
          const winnerBalanceBefore = await accounts[1].getBalance();

          // owner withdraw and calculate gas
          const Ownertx = await lottery.withdraw();
          const ownerTxReceipt = await Ownertx.wait(1);
          const {
            gasUsed: ownerGasUsed,
            effectiveGasPrice: ownerEffectiveGasPrice,
          } = ownerTxReceipt;
          const ownerGasCost = ownerGasUsed.mul(ownerEffectiveGasPrice);

          // winner withdraw and calculate gas
          const connectedWinner = lottery.connect(accounts[1]);
          const winnerTx = await connectedWinner.withdraw();
          const winnerTxReceipt = await winnerTx.wait(1);
          const {
            gasUsed: winnerGasUsed,
            effectiveGasPrice: winnerEffectiveGasPrice,
          } = winnerTxReceipt;
          const winnerGasCost = winnerGasUsed.mul(winnerEffectiveGasPrice);

          const ownerBalanceAfter = await accounts[0].getBalance();
          const winnerBalanceAfter = await accounts[1].getBalance();

          assert.equal(
            ownerBalanceAfter.add(ownerGasCost).toString(),
            ownerBalanceBefore.add(ownerFee).toString()
          );
          assert.equal(
            winnerBalanceAfter.add(winnerGasCost).toString(),
            winnerBalanceBefore.add(winnedAmount).toString()
          );
        });

        it("update the balance after withdraw", async () => {
          const connectedWinner = lottery.connect(accounts[1]);
          await connectedWinner.withdraw();

          const balance = await lottery.balance(accounts[1].address);

          assert.equal(balance.toString(), "0");
        });
      });

      describe("updater functions", () => {
        let accounts;
        beforeEach(async () => {
          accounts = await ethers.getSigners();
        });

        describe("update entrance fee", () => {
          it("fails if caller is not owner", async () => {
            const connectedAcc = lottery.connect(accounts[1]);
            await expect(connectedAcc.updateEntranceFee(20)).to.be.revertedWith(
              "not owner"
            );
          });

          it("update the entrance fee successfully", async () => {
            const value = 20;
            const expectedValue = ethers.utils.parseEther(value.toString());

            await lottery.updateEntranceFee(value);
            const entranceFee = await lottery.entranceFee();

            assert.equal(entranceFee.toString(), expectedValue.toString());
          });
        });

        describe("update platform fee", () => {
          it("fails if caller is not owner", async () => {
            const connectedAcc = lottery.connect(accounts[1]);
            await expect(connectedAcc.updatePlatformFee(10)).to.be.revertedWith(
              "not owner"
            );
          });

          it("update the platform fee successfully", async () => {
            await lottery.updatePlatformFee(80);
            const platformFee = await lottery.platformFee();

            assert.equal(platformFee.toString(), "80");
          });
        });

        describe("update time interval", () => {
          it("fails if caller is not owner", async () => {
            const connectedAcc = lottery.connect(accounts[1]);
            await expect(
              connectedAcc.updateTimeInterval(50)
            ).to.be.revertedWith("not owner");
          });

          it("update the time interval successfully", async () => {
            await lottery.updateTimeInterval(50);
            const timeInterval = await lottery.timeInterval();

            assert.equal(timeInterval.toString(), "50");
          });
        });
      });

      describe("getEntranceFeePerETH", () => {
        it("returns correct amount and join the lottery successfully", async () => {
          const amount = await lottery.getEntranceFeePerETH();
          console.log(amount.toString());

          await expect(lottery.joinLottery({ value: amount })).to.emit(
            lottery,
            "LotteryJoin"
          );
        });
      });
    });
