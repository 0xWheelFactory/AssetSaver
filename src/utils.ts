import {
  FlashbotsBundleProvider,
  FlashbotsBundleRawTransaction,
  FlashbotsBundleTransaction,
} from "@flashbots/ethers-provider-bundle";
import { BigNumber, utils } from "ethers";
import { parseTransaction } from "ethers/lib/utils";

const GWEI = utils.parseUnits("1", "gwei");
export const PRIORITY_GAS_PRICE = GWEI.mul(31);
export const BLOCKS_IN_FUTURE = 2;

export async function checkSimulation(
  flashbotsProvider: FlashbotsBundleProvider,
  signedBundle: Array<string>,
): Promise<BigNumber> {
  const simulationResponse = await flashbotsProvider.simulate(signedBundle, "latest");

  if ("results" in simulationResponse) {
    for (let i = 0; i < simulationResponse.results.length; i++) {
      const txSimulation = simulationResponse.results[i];
      if ("error" in txSimulation) {
        throw new Error(`TX #${i} : ${txSimulation.error} ${txSimulation.revert}`);
      }
    }

    if (simulationResponse.coinbaseDiff.eq(0)) {
      throw new Error("Does not pay coinbase");
    }

    const gasUsed = simulationResponse.results.reduce((acc: number, txSimulation) => acc + txSimulation.gasUsed, 0);

    const gasPrice = simulationResponse.coinbaseDiff.div(gasUsed);
    return gasPrice;
  }

  console.error(`Simulation failed, error code: ${simulationResponse.error.code}`);
  console.error(simulationResponse.error.message);
  throw new Error("Failed to simulate response");
}

export async function printTransactions(
  bundleTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction>,
  signedBundle: Array<string>,
): Promise<void> {
  console.log("==================================");
  console.log(
    (
      await Promise.all(
        bundleTransactions.map(async (bundleTx, index) => {
          const tx =
            "signedTransaction" in bundleTx ? parseTransaction(bundleTx.signedTransaction) : bundleTx.transaction;
          const from = "signer" in bundleTx ? await bundleTx.signer.getAddress() : tx.from;

          return `TX #${index}: ${from} => ${tx.to} : ${tx.data}`;
        }),
      )
    ).join("\n"),
  );

  console.log("==================================");
  console.log((await Promise.all(signedBundle.map(async (signedTx, index) => `TX #${index}: ${signedTx}`))).join("\n"));

  console.log("==================================");
}

export const gasPriceToGwei = (gasPrice: BigNumber): number => {
  return gasPrice.mul(100).div(GWEI).toNumber() / 100;
};
