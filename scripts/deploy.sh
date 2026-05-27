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
cast send "$CONTRACT" --value 1ether --rpc-url "$SHANNON_RPC_URL" --private-key "$PRIVATE_KEY" --legacy

cast send "$CONTRACT" "createMarket(string,string,uint256)" \
  "Is the capital of France Paris?" "https://en.wikipedia.org/wiki/Paris" 300 \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$PRIVATE_KEY" --legacy

cast send "$CONTRACT" "createMarket(string,string,uint256)" \
  "Did Bitcoin exist before 2010?" "https://en.wikipedia.org/wiki/Bitcoin" 300 \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$PRIVATE_KEY" --legacy

if grep -q "^NEXT_PUBLIC_CONTRACT_ADDRESS=" .env 2>/dev/null; then
  sed -i '' "s|^NEXT_PUBLIC_CONTRACT_ADDRESS=.*|NEXT_PUBLIC_CONTRACT_ADDRESS=$CONTRACT|" .env
else
  echo "NEXT_PUBLIC_CONTRACT_ADDRESS=$CONTRACT" >> .env
fi

pnpm export-abi

echo ""
echo "Deployed: $CONTRACT"
echo "Updated .env NEXT_PUBLIC_CONTRACT_ADDRESS"
echo "Run: pnpm dev"
