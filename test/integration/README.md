# Local EVM qualification

Install the pinned npm dependencies and put [Anvil](https://getfoundry.sh/anvil/overview) on `PATH`, then run:

```sh
npx vitest run --config vitest.integration.config.ts
```

The default run forks Base Sepolia and Base at a recorded block, checks the pinned deployed contracts, and sends only from Anvil-generated accounts to a newly spawned `127.0.0.1` node. Center RPC supplies read-only fork state; Center also pins and reads the test market metadata. The tests do not deploy replacement protocol contracts, alter their code/storage, read private keys, or send public-chain transactions. `METALOG_RPC_URLS` directs the unmodified app adapters to the local fork during the test.

Use `METALOG_FORK_CHAINS=84532` for one network or a comma-separated list of the app's supported chain IDs. `METALOG_FORK_BLOCK_<chainId>` pins a previously recorded block. `ANVIL_BIN` optionally names the Anvil executable. Cold Anvil simulations fetch many state slots through Center and have a 180-second local request budget; production Center timeouts remain unchanged. RPC failure fails qualification; there is no mock or success fallback. No chain state dumps are persisted. The output records fork block/hash and local transaction hashes for reproducibility.

Set `METALOG_FORK_SMOKE=true` to qualify only deployment identity, creation, entry and recovery across a larger network matrix. Settlement and no-contest tests are explicitly skipped in that mode; it is not full lifecycle qualification.

`METALOG_FORK_EVIDENCE_DIR=/tmp/metalog-forks` optionally saves small per-chain JSON records with the fork anchor and observed local transaction hashes. Pair these records with the test runner result: a transaction record alone does not mean the whole scenario passed.

These checks exercise real EVM execution and the app's preparation, simulation, receipt effects and saved-call recovery. Their automated review callback is not a browser wallet interaction or evidence of a public-chain payment.

The custom-range scenario also verifies the Center-pinned project/collection manifest, native onchain tier names and zero IPFS tier hashes. It does not render the full native SVG: its embedded onchain fonts require thousands of cold-fork storage reads. That renderer is unchanged protocol code; full tokenURI rendering is outside this scenario’s qualification.
