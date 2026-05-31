# Floe Native NFT Contracts

This directory holds the collection contract source for the hackathon demo.

Deploy one copy per native chain you want to show in the Tatum branch, then grant the chain-specific Tatum minter address for that chain as a minter on the deployed contract.

Suggested deployment targets for the demo:

- Base Sepolia
- Optimism Sepolia
- Arbitrum Sepolia
- Avalanche Fuji
- Ethereum Sepolia

After deploy, put the deployed addresses into:

- `TATUM_NATIVE_CONTRACT_ADDRESS_BASE`
- `TATUM_NATIVE_CONTRACT_ADDRESS_OPTIMISM`
- `TATUM_NATIVE_CONTRACT_ADDRESS_ARBITRUM`
- `TATUM_NATIVE_CONTRACT_ADDRESS_AVALANCHE`
- `TATUM_NATIVE_CONTRACT_ADDRESS_FANTOM`
- `TATUM_NATIVE_CONTRACT_ADDRESS_ETH_SEPOLIA`

The same Solidity source can be deployed on each chain. Use `npm run deploy:native-contracts` after setting `TATUM_TEST_PRIVATE_KEY`; the script compiles the contract, deploys it to the listed testnets, and writes the addresses back into `.env`.

This source expects OpenZeppelin Contracts v5 style imports for `ERC721URIStorage` and `Ownable`.

The contract exposes:

- `mint(address to, uint256 tokenId, string uri)`
- `mintMultiple(address[] to, uint256[] tokenIds, string[] uris)`
- `mintSequential(address to, string uri)`
