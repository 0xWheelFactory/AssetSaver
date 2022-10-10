# AssetSaver

A project help you save your assets remained in your account which suffered private key leakage.

## Usage

1. Create a `.env` file and input necessary info (Check [`.env.example`](src/.env.example) for reference).

2. Run command and wait for confirmed transactions.

```shell
  npm run start
```

## Explanation for Necessary Info

- `Executor` and `Sponsor` is two EOA. `Executor` is the one who sends the request(i.e. asset owner) while `Sponsor` pay for the transaction.

- `Recipient` is the account you wish to receive the asset.

## Future Work

Currently, this project only supports ERC20 transfer. In the future, I'll add more useful operation in this project (such as transfer and approve of ERC721). Moreover, I'll also try to implement the contract ownership-related operation.

If you have any interesting idea, please create an [issue](https://github.com/SpaceStation09/AssetSaver/issues)

## Statement

All my work is based on the repositories provided in Flashbots official doc.

## License

[MIT LICENSE](LICENSE)
