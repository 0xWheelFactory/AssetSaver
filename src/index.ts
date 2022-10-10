import {
  FlashbotsBundleProvider,
  FlashbotsBundleRawTransaction,
  FlashbotsBundleResolution,
  FlashbotsBundleTransaction,
} from "@flashbots/ethers-provider-bundle";
import { config as envConfig } from "dotenv";
import { ethers, providers, Wallet } from "ethers";
import path from "path";
import { Base } from "./operations/base";
import { TransferERC20 } from "./operations/transferERC20";
import {
  BLOCKS_IN_FUTURE,
  checkSimulation,
  gasPriceToGwei,
  printTransactions,
  PRIORITY_GAS_PRICE,
  verifyCondition,
} from "./utils";

envConfig({ path: path.resolve(__dirname, "./.env") });

const EXECUTOR_PRIVATE_KEY = process.env.EXECUTOR_PRIVATE_KEY || "";
const SPONSOR_PRIVATE_KEY = process.env.SPONSOR_PRIVATE_KEY || "";
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "";
const RECIPIENT = process.env.RECIPIENT || "";
const ALCHEMY_KEY = process.env.ALCHEMY_KEY || "";
verifyCondition(EXECUTOR_PRIVATE_KEY, SPONSOR_PRIVATE_KEY, TOKEN_ADDRESS, RECIPIENT, ALCHEMY_KEY);

const alchemyProvider = new providers.AlchemyProvider("goerli", ALCHEMY_KEY);
const walletExecutor = new Wallet(EXECUTOR_PRIVATE_KEY);
const walletSponsor = new Wallet(SPONSOR_PRIVATE_KEY);
const authSigner = Wallet.createRandom();

async function main() {
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    alchemyProvider,
    authSigner,
    "https://relay-goerli.flashbots.net",
    "goerli",
  );

  let tokenAddress = process.env.TOKEN_ADDRESS || "";
  if (!tokenAddress) console.error("No token specified");
  // ================== uncomment for test ==================
  // if (!TOKEN_ADDRESS) {
  //   const testTokenFactory = new ContractFactory(TestTokenArtifact.abi, TestTokenArtifact.bytecode, walletSponsor);
  //   const testToken = await testTokenFactory.deploy(ethers.utils.parseEther("1"));
  //   tokenAddress = testToken.address;
  // }
  // ================== uncomment for test ==================
  const operation: Base = new TransferERC20(alchemyProvider, walletExecutor.address, RECIPIENT, tokenAddress);

  const sponsoredTxs = await operation.getSponsoredTransactions();
  const gasEstimates = await Promise.all(
    sponsoredTxs.map((tx) =>
      alchemyProvider.estimateGas({
        ...tx,
        from: tx.from === undefined ? walletExecutor.address : tx.from,
      }),
    ),
  );
  const gasEstimateTotal = gasEstimates.reduce((acc, cur) => acc.add(cur), ethers.constants.Zero);
  const latestBlock = await alchemyProvider.getBlock("latest");
  const gasPrice = PRIORITY_GAS_PRICE.add(latestBlock.baseFeePerGas || 0);
  const bonusGasPrice = gasPrice.mul(2);
  const bundleTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction> = [
    {
      transaction: {
        to: walletExecutor.address,
        gasPrice: bonusGasPrice,
        value: gasEstimateTotal.mul(bonusGasPrice),
        gasLimit: 21000,
      },
      signer: walletSponsor,
    },
    ...sponsoredTxs.map((transaction, txNumber) => {
      return {
        transaction: {
          ...transaction,
          gasPrice: bonusGasPrice,
          gasLimit: gasEstimates[txNumber],
        },
        signer: walletExecutor,
      };
    }),
  ];
  const signedBundle = await flashbotsProvider.signBundle(bundleTransactions);

  await printTransactions(bundleTransactions, signedBundle);
  const simulatedGasPrice = await checkSimulation(flashbotsProvider, signedBundle);

  console.log(await operation.description());
  console.log(`Executor Account: ${walletExecutor.address}`);
  console.log(`Sponsor Account: ${walletSponsor.address}`);
  console.log(`Simulated Gas Price: ${gasPriceToGwei(simulatedGasPrice)} gwei`);
  console.log(`Gas Price: ${gasPriceToGwei(bonusGasPrice)} gwei`);
  console.log(`Gas Used: ${gasEstimateTotal.toString()}`);

  alchemyProvider.on("block", async (blockNumber) => {
    const simulatedGasPrice = await checkSimulation(flashbotsProvider, signedBundle);
    const targetBlockNum = blockNumber + BLOCKS_IN_FUTURE;
    console.log(`Current Block Number: ${blockNumber}, Target Block Number: ${targetBlockNum}`);
    const bundleResponse = await flashbotsProvider.sendBundle(bundleTransactions, targetBlockNum);
    if ("error" in bundleResponse) throw new Error(bundleResponse.error.message);

    const bundleResolution = await bundleResponse.wait();
    if (bundleResolution === FlashbotsBundleResolution.BundleIncluded) {
      console.log(`Congrats, included in ${targetBlockNum}`);
      process.exit(0);
    } else if (bundleResolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
      console.log(`Not included in ${targetBlockNum}`);
    } else if (bundleResolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
      console.log("Nonce too high, bailing");
      process.exit(1);
    }
  });
}

main();
