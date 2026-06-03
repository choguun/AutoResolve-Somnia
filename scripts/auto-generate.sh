#!/usr/bin/env bash
# Loop over a list of topics and submit a `requestMarketGeneration` call for each.
# The Somnia LLM Inference agent (inferToolsChat) decides question / source / duration
# and yields ABI-encoded `createMarket` calldata back to the contract.
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
TOPICS_FILE="${1:-scripts/topics.txt}"

if [ -z "${PRIVATE_KEY:-}" ]; then
  echo "Error: PRIVATE_KEY is not set. Copy .env.example to .env and add your key."
  exit 1
fi

if [ -z "${NEXT_PUBLIC_CONTRACT_ADDRESS:-}" ]; then
  echo "Error: NEXT_PUBLIC_CONTRACT_ADDRESS is not set (run scripts/deploy.sh first)."
  exit 1
fi

if [ ! -f "$TOPICS_FILE" ]; then
  echo "Error: topics file not found at $TOPICS_FILE"
  exit 1
fi

CONTRACT="$NEXT_PUBLIC_CONTRACT_ADDRESS"
RPC="$SHANNON_RPC_URL"
KEY="$PRIVATE_KEY"

echo "Reading inference topUpNeeded from $CONTRACT..."
TOPUP=$(cast call "$CONTRACT" "getGenerationFundingStatus()(uint256,uint256,uint256)" --rpc-url "$RPC" | awk 'NR==3 {print $1; exit}')
if [ -z "$TOPUP" ] || [ "$TOPUP" = "0" ]; then
  echo "TopUpNeeded is 0; prefunding contract with 1 STT..."
  cast send "$CONTRACT" --value 1ether --rpc-url "$RPC" --private-key "$KEY" --legacy >/dev/null
  TOPUP=$(cast call "$CONTRACT" "getGenerationFundingStatus()(uint256,uint256,uint256)" --rpc-url "$RPC" | awk 'NR==3 {print $1; exit}')
fi
echo "Inference topUpNeeded: $TOPUP wei"

echo ""
echo "Submitting $(wc -l < "$TOPICS_FILE" | tr -d ' ') topics from $TOPICS_FILE..."
while IFS= read -r topic || [ -n "$topic" ]; do
  # Skip blank lines and comments.
  case "$topic" in ""|\#*) continue ;; esac
  echo ""
  echo ">> $topic"
  TX=$(cast send "$CONTRACT" "requestMarketGeneration(string)" "$topic" \
    --value "$TOPUP" \
    --rpc-url "$RPC" \
    --private-key "$KEY" \
    --legacy 2>&1) || {
      echo "  (tx failed, continuing)"
      echo "$TX" | tail -3
      sleep 2
      continue
  }
  echo "$TX" | grep -E 'transactionHash|status' || true
  sleep 3
done < "$TOPICS_FILE"

echo ""
echo "Done. Poll nextMarketId and the GenerationRequested events for the new market ids."
echo "Verify with:"
echo "  cast call \"$CONTRACT\" \"nextMarketId()(uint256)\" --rpc-url \"$RPC\""
echo "  cast call \"$CONTRACT\" \"scanAgentCreatedMarkets(uint256,uint256)\" 0 10 --rpc-url \"$RPC\""
