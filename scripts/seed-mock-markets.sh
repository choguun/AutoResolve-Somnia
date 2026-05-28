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
: "${PRIVATE_KEY:?Set PRIVATE_KEY in .env}"

CONTRACT="$NEXT_PUBLIC_CONTRACT_ADDRESS"
COMMON_ARGS=(--rpc-url "$SHANNON_RPC_URL" --private-key "$PRIVATE_KEY" --legacy)

create_market() {
  local question="$1"
  local source="$2"
  local duration="$3"

  cast send "$CONTRACT" "createMarket(string,string,uint256)" \
    "$question" "$source" "$duration" "${COMMON_ARGS[@]}"
}

place_bet() {
  local market_id="$1"
  local option="$2"
  local amount="$3"

  cast send "$CONTRACT" "bet(uint256,uint8)" "$market_id" "$option" \
    --value "$amount" "${COMMON_ARGS[@]}"
}

echo "Seeding mock markets on $CONTRACT"
START_ID="$(cast call "$CONTRACT" "nextMarketId()(uint256)" --rpc-url "$SHANNON_RPC_URL")"
echo "First new market id: $START_ID"

create_market \
  "Will Somnia Shannon testnet remain online today?" \
  "https://status.somnia.network/" \
  300

create_market \
  "Does the Encode Club Agentathon page mention Somnia?" \
  "https://www.encodeclub.com/programmes/agentathon" \
  900

create_market \
  "Is ETH trading above 3000 USD on CoinGecko?" \
  "https://www.coingecko.com/en/coins/ethereum" \
  3600

create_market \
  "Does the Somnia docs site include agent documentation?" \
  "https://docs.somnia.network/" \
  86400

place_bet "$START_ID" 0 0.03ether
place_bet "$START_ID" 1 0.01ether
place_bet "$((START_ID + 1))" 0 0.025ether
place_bet "$((START_ID + 1))" 1 0.015ether
place_bet "$((START_ID + 2))" 1 0.02ether
place_bet "$((START_ID + 2))" 0 0.012ether
place_bet "$((START_ID + 3))" 0 0.04ether
place_bet "$((START_ID + 3))" 1 0.008ether

NEXT_ID="$(cast call "$CONTRACT" "nextMarketId()(uint256)" --rpc-url "$SHANNON_RPC_URL")"
echo "Done. nextMarketId: $NEXT_ID"
