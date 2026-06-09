# How to deploy this repo

The repo ships a one-shot deploy script plus a Vercel deploy for the frontend.

## Contract deploy (Somnia Shannon Testnet, chain id 50312)

```bash
# 1. Configure env
cp .env.example .env
# Fill in: PRIVATE_KEY (deployer EOA with STT for gas + prefund),
#          NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID,
#          ETHERSCAN_API_KEY (optional, for source verification).
#          SHANNON_RPC_URL defaults to https://dream-rpc.somnia.network.

# 2. Deploy
./scripts/deploy.sh
```

### What `scripts/deploy.sh` does

1. `forge build` — compiles the Solidity sources.
2. `forge create src/AutonomousPredictionMarket.sol:AutonomousPredictionMarket --rpc-url "$SHANNON_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast --legacy` — broadcasts the deploy tx.
3. Prefunds the contract with 2 STT (covers 0.66 STT per resolution × ~3 cycles of headroom).
4. Seeds 2 5-minu markets: "Is the capital of France Paris?" + "Did Bitcoin exist before 2010?".
5. Writes the new contract address into `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env` (uses portable `mktemp` + `sed` + `mv` per v47 M1, works on both BSD and GNU sed).
6. Runs `pnpm export-abi` so `lib-web/abi.json` matches the deployed bytecode.
7. Optionally runs `forge verify-contract` against the Shannon Explorer if `ETHERSCAN_API_KEY` is set.

The new contract deploys to a fresh address on the same v15 address family (`0x764Dc…2022b` is the v15 address — v16-v19 source changes are pending deploy). Live bytecode is v15 until the next `deploy.sh` run.

### Optional follow-ups

- `scripts/seed-mock-markets.sh` — adds 4 more markets (with small bets) for demos.
- `scripts/e2e-onchain.sh` — Cast-based end-to-end walk (prefund, create, bet, wait 5 min, `requestResolution`).

## Frontend deploy (Vercel)

```bash
pnpm exec vercel deploy --prod
# vercel.json pins framework=nextjs and the build/install commands.
```

The frontend reads the contract from `NEXT_PUBLIC_CONTRACT_ADDRESS` at build time, so make sure that var is set in the Vercel project settings to the new address from `deploy.sh` (or to the existing v15 address if you didn't redeploy).

## Long-lived relayer (optional)

The repo ships a `Dockerfile` for hosting the relayer. `README.md` → "Relayer hosting" has the full `docker run` flow with a named `autoresolve-state` volume for the on-disk dedup caches.
