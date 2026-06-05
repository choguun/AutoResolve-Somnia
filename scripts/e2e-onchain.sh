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

echo "[1/7] Prefund contract (0.5 STT)..."
cast send "$CONTRACT" --value 0.5ether --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy

echo "[2/7] Create demo markets..."
cast send "$CONTRACT" "createMarket(string,string,uint256)" \
  "Is the capital of France Paris?" "https://en.wikipedia.org/wiki/Paris" 300 \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy

cast send "$CONTRACT" "createMarket(string,string,uint256)" \
  "Did Bitcoin exist before 2010?" "https://en.wikipedia.org/wiki/Bitcoin" 300 \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy

echo "[3/7] Place bets on market 1..."
cast send "$CONTRACT" "bet(uint256,uint8)" 1 0 --value 0.01ether \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy

cast send "$CONTRACT" "bet(uint256,uint8)" 1 1 --value 0.005ether \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy

echo "[4/7] Read market state..."
cast call "$CONTRACT" "nextMarketId()(uint256)" --rpc-url "$SHANNON_RPC_URL"
cast call "$CONTRACT" "getTotalPool(uint256)(uint256)" 1 --rpc-url "$SHANNON_RPC_URL"
DEPOSIT=$(cast call "$CONTRACT" "getResolutionDeposit()(uint256)" --rpc-url "$SHANNON_RPC_URL" | awk '{print $1}')
echo "Resolution deposit: $DEPOSIT wei"

echo "[5/7] Waiting 305s for market 1 to end..."
sleep 305

echo "[6/7] Request resolution on market 1..."
cast send "$CONTRACT" "requestResolution(uint256)" 1 --value "$DEPOSIT" \
  --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy

echo "[7/7] Trigger autonomous market generation..."
# Prefund so the inference deposit is covered.
cast send "$CONTRACT" --value 0.5ether --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy

GEN_TOPUP=$(cast call "$CONTRACT" "getGenerationFundingStatus()(uint256,uint256,uint256)" --rpc-url "$SHANNON_RPC_URL" | awk 'NR==3 {print $1; exit}')
echo "Inference topUpNeeded: $GEN_TOPUP wei"

for topic in \
  "Will Somnia mainnet launch before 2027?" \
  "Did Bitcoin reach 100,000 USD on any exchange in 2024?"; do
  echo ">> $topic"
  cast send "$CONTRACT" "requestMarketGeneration(string)" "$topic" \
    --value "$GEN_TOPUP" \
    --rpc-url "$SHANNON_RPC_URL" --private-key "$KEY" --legacy \
    | grep -E 'transactionHash|status' || true
  sleep 3
done

echo ""
echo "Done. Poll market status and receipts:"
echo "  cast call $CONTRACT 'getMarket(uint256)(...)' 1 --rpc-url \$SHANNON_RPC_URL"
echo "  cast call $CONTRACT 'nextMarketId()(uint256)' --rpc-url \$SHANNON_RPC_URL"
echo "  cast call $CONTRACT 'scanAgentCreatedMarkets(uint256,uint256)' 0 10 --rpc-url \$SHANNON_RPC_URL"
echo "  pnpm dev → http://localhost:3000/market/1  (resolution demo)"
echo "  pnpm dev → http://localhost:3000/create  (try the AI-Generated tab)"
