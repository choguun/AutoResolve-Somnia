# How to deploy this repo

The repo ships a one-shot deploy script plus a Vercel deploy for the frontend.

## Contract deploy (Somnia Shannon Testnet, chain id 50312)

```bash
# 1. Configure env
cp .env.example .env
# Fill in: PRIVATE_KEY (deployer EOA with STT for gas + prefund),
#          NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID.
# ETHERSCAN_API_KEY is no longer needed — Shannon Explorer is Blockscout v2
# and accepts verification without any API key (see "Source verification"
# below). SHANNON_RPC_URL defaults to https://dream-rpc.somnia.network.

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
7. Verifies the source on Shannon Explorer via Blockscout v2 (no API key required; see below).

The new contract deploys to a fresh address — the v15 address `0x764Dc…2022b` is now historical; the v19+v40+v45 bytecode is at `0x48556EA096F4abFFB569916a138Ec946B54A85dE` (deploy tx `0x7b7fec…002f8` on 2026-06-09). Live bytecode changes every `deploy.sh` run.

### Source verification

The deploy script runs Blockscout v2 verification as its final step. The flow:

```bash
forge verify-contract \
  --rpc-url "$SHANNON_RPC_URL" \
  --verifier blockscout \
  --verifier-url "https://shannon-explorer.somnia.network/api" \
  <CONTRACT_ADDRESS> \
  src/AutonomousPredictionMarket.sol:AutonomousPredictionMarket
```

**No API key is required.** The pre-v55 invocation (`--etherscan-api-key ...`) fell back to Sourcify, which doesn't have chain 50312 in its supported list and errors with `"Chain 50312 not found"`. The Blockscout endpoint accepts a POST without any auth. After the call returns, the verification is async — poll `https://shannon-explorer.somnia.network/api/v2/smart-contracts/<lowercase-address>` until `is_verified: true` (typically 10-30s).

To verify manually after the fact:

```bash
forge verify-contract \
  --rpc-url https://dream-rpc.somnia.network \
  --verifier blockscout \
  --verifier-url "https://shannon-explorer.somnia.network/api" \
  0x48556ea096f4abffb569916a138ec946b54a85de \
  src/AutonomousPredictionMarket.sol:AutonomousPredictionMarket
```

Note: `AutonomousPredictionMarket` has no constructor arguments, so the autodetect works. For contracts that take constructor args, you'll need to pass them via `--constructor-args ...` or `--constructor-args-path <file>`.

### Optional follow-ups

- `scripts/seed-mock-markets.sh` — adds 4 more markets (with small bets) for demos.
- `scripts/e2e-onchain.sh` — Cast-based end-to-end walk (prefund, create, bet, wait 5 min, `requestResolution`).

## Frontend deploy (Vercel)

```bash
pnpm exec vercel deploy --prod
# vercel.json pins framework=nextjs and the build/install commands.
```

The frontend reads the contract from `NEXT_PUBLIC_CONTRACT_ADDRESS` at build time, so make sure that var is set in the Vercel project settings to the new address from `deploy.sh` (or to the existing address if you didn't redeploy).

## Long-lived relayer (Railway)

The repo ships a `Dockerfile` for hosting the relayer. Setup:

```bash
# From the repo root, with railway CLI linked to your project:
railway up --detach --service relayer --environment production --message "deploy"
```

Or use the Railway dashboard. The relayer reads `PRIVATE_KEY` and `NEXT_PUBLIC_CONTRACT_ADDRESS` from the service's env vars; attach a volume at `/app/state` for the parse-failure LRU and submitted-topics Set. See `README.md` → "Relayer hosting" for the full flow.

## Local dev

```bash
pnpm install
forge build
pnpm dev    # http://localhost:3000
```

