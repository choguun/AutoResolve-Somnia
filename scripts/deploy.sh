#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${SHANNON_RPC_URL:=https://dream-rpc.somnia.network}"

if [ -z "${PRIVATE_KEY:-}" ]; then
  echo "Error: PRIVATE_KEY is not set. Copy .env.example to .env and add your key."
  exit 1
fi

echo "Building contracts..."
forge build

echo ""
echo "Deploying AutonomousPredictionMarket to Shannon..."
DEPLOY_OUT=$(forge create src/AutonomousPredictionMarket.sol:AutonomousPredictionMarket \
  --rpc-url "$SHANNON_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --legacy 2>&1)

echo "$DEPLOY_OUT"

CONTRACT=$(echo "$DEPLOY_OUT" | awk '/Deployed to:/ {print $3}')
if [ -z "$CONTRACT" ]; then
  echo "Error: could not parse deployed contract address"
  exit 1
fi

echo "Prefunding and seeding markets..."
# v16 (H1): bumped prefund 1 → 2 STT. v15 prefund covered the parse +
# inference deposit (0.62 STT) for ~1.6 resolutions before draining. v16's
# `retryInferenceFromCache` spends another inference deposit (0.3 STT) on
# a single underfunded-inference recovery, and the v8+ MAX_BET path can
# trigger parse retries for `attemptCount` markets. 2 STT covers ~3
# resolution cycles or ~3 retry-inference cycles — enough for the relayer
# to drain a missed-block burst without the operator manually refilling.
# v45 (L2): the "~6" claim was a stale typo from the v16 draft (when
# getResolutionDeposit was estimated at ~0.3 STT). The real number is
# 0.01 + 0.3 + 0.01 + 0.3 = 0.62 STT per resolution, so 2 STT ≈ 3.2
# cycles. The "~3 retry-inference cycles" half of the sentence was
# correct and is preserved.
cast send "$CONTRACT" --value 2ether --rpc-url "$SHANNON_RPC_URL" --private-key "$PRIVATE_KEY" --legacy

cast send "$CONTRACT" "createMarket(string,string,uint256)" \
  "Is the capital of France Paris?" "https://en.wikipedia.org/wiki/Paris" 300 \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$PRIVATE_KEY" --legacy

cast send "$CONTRACT" "createMarket(string,string,uint256)" \
  "Did Bitcoin exist before 2010?" "https://en.wikipedia.org/wiki/Bitcoin" 300 \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$PRIVATE_KEY" --legacy

if grep -q "^NEXT_PUBLIC_CONTRACT_ADDRESS=" .env 2>/dev/null; then
  # v47 (M1): portable .env rewrite. The pre-v47 `sed -i '' ...` is BSD-sed
  # syntax (empty arg = no backup extension); on GNU sed (Linux / CI /
  # Vercel runner) it errors with "sed: -i may not be used with stdin" and
  # deploy.sh exits before pnpm export-abi runs, leaving .env pointing at
  # the placeholder 0x0000…0000. The mktemp + mv rewrite is portable on
  # BSD sed, GNU sed, and BusyBox sed.
  TMP_ENV=$(mktemp) && \
    sed "s|^NEXT_PUBLIC_CONTRACT_ADDRESS=.*|NEXT_PUBLIC_CONTRACT_ADDRESS=$CONTRACT|" .env > "$TMP_ENV" && \
    mv "$TMP_ENV" .env
else
  echo "NEXT_PUBLIC_CONTRACT_ADDRESS=$CONTRACT" >> .env
fi

pnpm export-abi

# v55 (M1): Shannon Explorer is a Blockscout v2 instance — no API key required.
# The pre-v55 invocation (`forge verify-contract --chain-id 50312 --etherscan-api-key ...`)
# fell back to Sourcify, which doesn't have chain 50312 in its supported list
# and errors with "Chain 50312 not found". The working flow uses the Blockscout
# verifier endpoint (the v2 API at `shannon-explorer.somnia.network/api`),
# which accepts a POST without any auth.
if [ -n "${ETHERSCAN_API_KEY:-}" ]; then
  echo ""
  echo "NOTE: ETHERSCAN_API_KEY is set but no longer needed for Shannon —"
  echo "      Shannon Explorer is Blockscout v2 and accepts verification"
  echo "      without any API key. The key will be ignored. Unset it in"
  echo "      .env to silence this message."
fi

echo ""
echo "Verifying source on Shannon Explorer (Blockscout v2, no API key)..."
forge verify-contract \
  --rpc-url "$SHANNON_RPC_URL" \
  --verifier blockscout \
  --verifier-url "https://shannon-explorer.somnia.network/api" \
  "$CONTRACT" \
  src/AutonomousPredictionMarket.sol:AutonomousPredictionMarket \
  || echo "  (verification attempt failed; you can retry manually: see DEPLOY.md 'Source verification')"

echo ""
echo "Deployed: $CONTRACT"
echo "Updated .env NEXT_PUBLIC_CONTRACT_ADDRESS"
echo "Run: pnpm dev"
