import {
  FlashbotsBundleProvider,
  FlashbotsBundleRawTransaction,
  FlashbotsBundleResolution,
  FlashbotsBundleTransaction,
} from "@flashbots/ethers-provider-bundle";
import { config as envConfig } from "dotenv";
import { ethers, providers, utils, Wallet } from "ethers";
import path from "path";
import { Base } from "./operations/base";
import { TransferERC20 } from "./operations/transferERC20";
import { BLOCKS_IN_FUTURE, checkSimulation, gasPriceToGwei, loadEnv, printTransactions } from "./utils";

envConfig({ path: path.resolve(__dirname, "./.env") });

const envVariables = loadEnv();

const alchemyProvider = new providers.AlchemyProvider(envVariables.network.chainName, envVariables.alchemy);
const walletExecutor = new Wallet(envVariables.executorPK);
const walletSponsor = new Wallet(envVariables.sponsorPK);
const authSigner = Wallet.createRandom();

async function main() {
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    alchemyProvider,
    authSigner,
    envVariables.network.flashbotsConnectionUrl,
    envVariables.network.chainName,
  );

  const operation: Base = new TransferERC20(
    alchemyProvider,
    walletExecutor.address,
    envVariables.recipient,
    envVariables.contractAddress,
  );

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
  const currentBaseFee = latestBlock.baseFeePerGas;
  if (!currentBaseFee) throw Error("Cannot get current base fee");
  const maxBaseFeeInFutureBlock = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(currentBaseFee, 2);
  let priorityFee =
    (await alchemyProvider.getFeeData()).maxPriorityFeePerGas?.mul(10) || utils.parseUnits("50", "gwei");
  const feePerGas = priorityFee.add(maxBaseFeeInFutureBlock);
  const bundleTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction> = [
    {
      transaction: {
        to: walletExecutor.address,
        type: 2,
        maxFeePerGas: feePerGas,
        maxPriorityFeePerGas: priorityFee,
        value: gasEstimateTotal.mul(feePerGas),
        gasLimit: 21000,
        chainId: envVariables.network.chainId,
      },
      signer: walletSponsor,
    },
    ...sponsoredTxs.map((transaction, txNumber) => {
      return {
        transaction: {
          ...transaction,
          type: 2,
          maxFeePerGas: feePerGas,
          maxPriorityFeePerGas: priorityFee,
          gasLimit: gasEstimates[txNumber],
          chainId: envVariables.network.chainId,
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
  console.log(`Max Fee Per Gas: ${gasPriceToGwei(feePerGas)} gwei`);
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
