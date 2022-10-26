import { TransactionRequest } from "@ethersproject/abstract-provider";
import { BigNumber, BigNumberish, Contract } from "ethers";
import { isAddress } from "ethers/lib/utils";
import ERC721Artifact from "../abi/erc721.json";
import { Base } from "./Base";

const ERC721_ABI = ERC721Artifact.abi;

export class TransferERC721 extends Base {
  private _sender: string;
  private _recipient: string;
  private _tokenAddress: string;
  private _tokenId: BigNumberish;

  constructor(sender: string, recipient: string, tokenAddress: string, tokenId: BigNumberish) {
    super();
    if (!isAddress(recipient)) throw new Error("Bad Address");
    if (!isAddress(sender)) throw new Error("Bad Address");
    this._sender = sender;
    this._recipient = recipient;
    this._tokenAddress = tokenAddress;
    this._tokenId = tokenId;
  }

  async description(): Promise<string> {
    return `Transfer token #${this._tokenId} of contract ${this._tokenAddress} to the address: ${this._recipient}`;
  }

  async getSponsoredTransactions(): Promise<TransactionRequest[]> {
    const erc721Contract = new Contract(this._tokenAddress, ERC721_ABI);
    return [
      {
        ...(await erc721Contract.populateTransaction.safeTransferFrom(this._sender, this._recipient, this._tokenId)),
        gasPrice: BigNumber.from(0),
      },
    ];
  }
}
