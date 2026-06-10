#!/usr/bin/env bash
# v56 (L1) ops: clear the relayer service-level health_check_path on
# Railway. The MCP `update_service` tool would do this, but the
# current MCP session is unauthorized, and the CLI has no
# `update` subcommand. The only programmatic path is to call the
# Railway GraphQL API directly with a user-provided API token.
#
# Usage:
#   RAILWAY_TOKEN=railway_xxx_... bash scripts/railway-clear-healthcheck.sh
#
# Get a token from https://railway.com/account/tokens
# ("Create Token" → name it "autoresolve-ops" → copy the value).
# The token is the only auth header the API needs; no project ID
# env var is required because the project + service + environment
# IDs are hard-coded below (extracted from the relayer's
# project config in ~/.railway/config.json).

set -euo pipefail

PROJECT_ID="4bff28bc-4927-4c50-a058-3285ad213e97"
SERVICE_ID="260dded9-9fa5-47e9-abde-7457e1207c48"
ENVIRONMENT_ID="820bf729-6d5e-4508-b601-4ec51109a39c"

if [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "Error: RAILWAY_TOKEN env var is not set." >&2
  echo "" >&2
  echo "Get a token from https://railway.com/account/tokens and set it:" >&2
  echo "  RAILWAY_TOKEN=railway_xxx_... bash scripts/railway-clear-healthcheck.sh" >&2
  exit 1
fi

echo "[railway-clear-healthcheck] Project:  $PROJECT_ID"
echo "[railway-clear-healthcheck] Service:  $SERVICE_ID"
echo "[railway-clear-healthcheck] Env:      $ENVIRONMENT_ID"
echo ""

# Railway's GraphQL mutation to clear a service-level config field.
# `serviceInstanceUpdate` accepts a partial config object; passing
# healthCheckPath: null removes the field. The `patch` argument is
# a JSON Merge Patch that applies only the keys you pass.
MUTATION='
mutation serviceInstanceUpdate($serviceId: String!, $environmentId: String!, $patch: ServiceInstanceUpdate!) {
  serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, patch: $patch) {
    healthCheckPath
    restartPolicyType
  }
}'

VARIABLES=$(cat <<EOF
{
  "serviceId": "$SERVICE_ID",
  "environmentId": "$ENVIRONMENT_ID",
  "patch": {
    "healthCheckPath": null
  }
}
EOF
)

echo "[railway-clear-healthcheck] Sending serviceInstanceUpdate mutation..."
RESPONSE=$(curl -sS -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  --data "$(jq -n --arg query "$MUTATION" --argjson variables "$VARIABLES" '{query: $query, variables: $variables}')"
)

echo "[railway-clear-healthcheck] Response:"
echo "$RESPONSE" | python3 -m json.tool

if echo "$RESPONSE" | grep -q '"healthCheckPath":null'; then
  echo ""
  echo "[railway-clear-healthcheck] OK: healthCheckPath cleared"
  echo "[railway-clear-healthcheck] Next step: trigger a redeploy to apply the change."
  echo "  railway up --detach --service relayer --environment production"
else
  echo ""
  echo "[railway-clear-healthcheck] FAIL: response did not confirm clear." >&2
  echo "  Inspect the response above for an error message." >&2
  exit 1
fi
