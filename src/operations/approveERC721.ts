import { TransactionRequest } from "@ethersproject/abstract-provider";
import { BigNumber, Contract } from "ethers";
import { isAddress } from "ethers/lib/utils";
import ERC721Artifact from "../abi/erc721.json";
import { Base } from "./Base";

const ERC721_ABI = ERC721Artifact.abi;

export class ApproveERC721 extends Base {
  private _recipient: string;
  private _tokenAddress: string;

  constructor(recipient: string, tokenAddress: string) {
    super();
    if (!isAddress(recipient)) throw new Error("Bad Address");
    this._recipient = recipient;
    this._tokenAddress = tokenAddress;
  }

  async description(): Promise<string> {
    return `Approve all ${this._tokenAddress} token to ${this._recipient}`;
  }

  async getSponsoredTransactions(): Promise<TransactionRequest[]> {
    const erc721Contract = new Contract(this._tokenAddress, ERC721_ABI);
    return [
      {
        ...(await erc721Contract.populateTransaction.setApprovalForAll(this._recipient, true)),
        gasPrice: BigNumber.from(0),
      },
    ];
  }
}
