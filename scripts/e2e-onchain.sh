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
: "${NEXT_PUBLIC_CONTRACT_ADDRESS:?Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env}"

CONTRACT="$NEXT_PUBLIC_CONTRACT_ADDRESS"
KEY="$PRIVATE_KEY"

echo "=== AutoResolve On-Chain E2E ==="
echo "Contract: $CONTRACT"

echo "[1/6] Prefund contract (0.5 STT)..."
cast send "$CONTRACT" --value 0.5ether --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy

echo "[2/6] Create demo markets..."
cast send "$CONTRACT" "createMarket(string,string,uint256)" \
  "Is the capital of France Paris?" "https://en.wikipedia.org/wiki/Paris" 300 \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy

cast send "$CONTRACT" "createMarket(string,string,uint256)" \
  "Did Bitcoin exist before 2010?" "https://en.wikipedia.org/wiki/Bitcoin" 300 \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy

echo "[3/6] Place bets on market 1..."
cast send "$CONTRACT" "bet(uint256,uint8)" 1 0 --value 0.01ether \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy

cast send "$CONTRACT" "bet(uint256,uint8)" 1 1 --value 0.005ether \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy

echo "[4/6] Read market state..."
cast call "$CONTRACT" "nextMarketId()(uint256)" --rpc-url "$SHANNON_RPC_URL"
cast call "$CONTRACT" "getTotalPool(uint256)(uint256)" 1 --rpc-url "$SHANNON_RPC_URL"
DEPOSIT=$(cast call "$CONTRACT" "getResolutionDeposit()(uint256)" --rpc-url "$SHANNON_RPC_URL" | awk '{print $1}')
echo "Resolution deposit: $DEPOSIT wei"

echo "[5/6] Waiting 305s for market 1 to end..."
sleep 305

echo "[6/6] Request resolution on market 1..."
cast send "$CONTRACT" "requestResolution(uint256)" 1 --value "$DEPOSIT" \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy

echo "Done. Poll market status and receipts:"
echo "  cast call $CONTRACT 'getMarket(uint256)(...)' 1 --rpc-url \$SHANNON_RPC_URL"
echo "  pnpm dev → http://localhost:3000/market/1"
