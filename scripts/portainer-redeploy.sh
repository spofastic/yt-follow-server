#!/usr/bin/env bash
# Zieht das :latest-Image neu und deployt den yt-follow Portainer-Stack (Git-Stack).
#
# Erwartet (aus .claude/settings.local.json -> env, nicht im Repo):
#   PORTAINER_URL    z. B. http://10.10.10.100:9000
#   PORTAINER_TOKEN  Portainer Access-Token (My account -> Access tokens)
# Optionale Argumente: $1 = Stack-ID (Default 122), $2 = Endpoint-ID (Default 9)
set -euo pipefail

# Fallback: Werte aus der lokalen (gitignorierten) Settings-Datei lesen, falls die
# Env-Variablen in der Session noch nicht geladen sind.
SETTINGS="$(dirname "$0")/../.claude/settings.local.json"
if [ -z "${PORTAINER_URL:-}" ] && [ -f "$SETTINGS" ]; then
  PORTAINER_URL="$(grep -o '"PORTAINER_URL"[[:space:]]*:[[:space:]]*"[^"]*"' "$SETTINGS" | sed 's/.*"\([^"]*\)"$/\1/')"
fi
if [ -z "${PORTAINER_TOKEN:-}" ] && [ -f "$SETTINGS" ]; then
  PORTAINER_TOKEN="$(grep -o '"PORTAINER_TOKEN"[[:space:]]*:[[:space:]]*"[^"]*"' "$SETTINGS" | sed 's/.*"\([^"]*\)"$/\1/')"
fi

URL="${PORTAINER_URL:?PORTAINER_URL nicht gesetzt}"
TOKEN="${PORTAINER_TOKEN:?PORTAINER_TOKEN nicht gesetzt}"
STACK_ID="${1:-122}"
ENDPOINT_ID="${2:-9}"

echo "Redeploy Stack ${STACK_ID} (Endpoint ${ENDPOINT_ID}) auf ${URL} ..."
curl -sS -m 180 -w '\nHTTP %{http_code}\n' -X PUT \
  -H "X-API-Key: ${TOKEN}" \
  -H "Content-Type: application/json" \
  "${URL}/api/stacks/${STACK_ID}/git/redeploy?endpointId=${ENDPOINT_ID}" \
  -d '{"env":[{"name":"HOST_PORT","value":"8080"},{"name":"POLL_MINUTES","value":"30"},{"name":"TZ","value":"Europe/Berlin"}],"prune":false,"pullImage":true,"repositoryReferenceName":"refs/heads/main"}'
