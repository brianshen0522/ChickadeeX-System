#!/bin/sh
set -eu

echo "[keycloak-config] Waiting for Keycloak to accept admin credentials..."

RETRY=0
MAX_RETRIES=60
SLEEP_SEC=5

until /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://keycloak:8080 \
  --realm master \
  --user "${KEYCLOAK_ADMIN}" \
  --password "${KEYCLOAK_ADMIN_PASSWORD}" >/dev/null 2>&1
do
  RETRY=$((RETRY+1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "[keycloak-config] Failed to authenticate to Keycloak after $MAX_RETRIES attempts. Exiting." >&2
    exit 1
  fi
  echo "[keycloak-config] Not ready yet (attempt $RETRY/$MAX_RETRIES). Retrying in ${SLEEP_SEC}s..."
  sleep "$SLEEP_SEC"
done

echo "[keycloak-config] Authenticated. Updating realms sslRequired=NONE..."

# Always update master realm
/opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=NONE && \
  echo "[keycloak-config] Set sslRequired=NONE on master realm." || \
  echo "[keycloak-config] Warning: failed to update master realm (continuing)."

# Optionally update an application realm if provided
TARGET_REALM="${KEYCLOAK_REALM:-}"
if [ -n "$TARGET_REALM" ] && [ "$TARGET_REALM" != "master" ]; then
  echo "[keycloak-config] Attempting to set sslRequired=NONE on realm '$TARGET_REALM'..."
  if /opt/keycloak/bin/kcadm.sh get realms/"$TARGET_REALM" >/dev/null 2>&1; then
    /opt/keycloak/bin/kcadm.sh update realms/"$TARGET_REALM" -s sslRequired=NONE && \
      echo "[keycloak-config] Set sslRequired=NONE on realm '$TARGET_REALM'." || \
      echo "[keycloak-config] Warning: failed to update realm '$TARGET_REALM' (continuing)."
  else
    echo "[keycloak-config] Realm '$TARGET_REALM' not found yet; skipping."
  fi
fi

echo "[keycloak-config] SSL requirements updated."

# --- Client bootstrap/update ---
APP_REALM="${KEYCLOAK_REALM:-medical-reports}"
CLIENT_ID="${KEYCLOAK_CLIENT_ID:-medical-reports-client}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost}"
BACKEND_URL="${BACKEND_URL:-http://localhost}"

# Derive normalized redirect URIs and origins
LOGIN_REDIRECT_URI="${BACKEND_URL}/api/auth/sso/redirect"
FRONTEND_ORIGIN="${FRONTEND_URL%/}"
BACKEND_ORIGIN="${BACKEND_URL%/}"

echo "[keycloak-config] Ensuring client '$CLIENT_ID' exists in realm '$APP_REALM'..."

# Verify realm exists; if not, skip client configuration
if /opt/keycloak/bin/kcadm.sh get realms/"$APP_REALM" >/dev/null 2>&1; then
  CLIENT_JSON=$(/opt/keycloak/bin/kcadm.sh get clients -r "$APP_REALM" -q clientId="$CLIENT_ID" 2>/dev/null | tr -d '\n' || true)

  if echo "$CLIENT_JSON" | grep -q '"id"'; then
    CLIENT_INTERNAL_ID=$(echo "$CLIENT_JSON" | sed -n 's/.*"id"\s*:\s*"\([^"]*\)".*/\1/p' | head -n1)
    echo "[keycloak-config] Client exists (id=$CLIENT_INTERNAL_ID). Updating settings..."
  else
    echo "[keycloak-config] Creating client '$CLIENT_ID'..."
    /opt/keycloak/bin/kcadm.sh create clients -r "$APP_REALM" -s clientId="$CLIENT_ID" -s protocol=openid-connect >/dev/null
    CLIENT_INTERNAL_ID=$(/opt/keycloak/bin/kcadm.sh get clients -r "$APP_REALM" -q clientId="$CLIENT_ID" | sed -n 's/.*"id"\s*:\s*"\([^"]*\)".*/\1/p' | head -n1)
  fi

  # Update client config
  /opt/keycloak/bin/kcadm.sh update clients/"$CLIENT_INTERNAL_ID" -r "$APP_REALM" \
    -s enabled=true \
    -s protocol=openid-connect \
    -s publicClient=true \
    -s standardFlowEnabled=true \
    -s implicitFlowEnabled=false \
    -s directAccessGrantsEnabled=false \
    -s serviceAccountsEnabled=false \
    -s "redirectUris=[\"$LOGIN_REDIRECT_URI\",\"$FRONTEND_ORIGIN/*\"]" \
    -s "webOrigins=[\"$FRONTEND_ORIGIN\",\"$BACKEND_ORIGIN\"]" \
    -s rootUrl="$FRONTEND_ORIGIN" \
    -s baseUrl="/" >/dev/null || echo "[keycloak-config] Warning: failed to update client core settings."

  # Update attributes (post logout redirect)
  /opt/keycloak/bin/kcadm.sh update clients/"$CLIENT_INTERNAL_ID" -r "$APP_REALM" \
    -s "attributes.post.logout.redirect.uris=$FRONTEND_ORIGIN/login" >/dev/null || true
else
  echo "[keycloak-config] Realm '$APP_REALM' not found; skipping client configuration."
fi

echo "[keycloak-config] Keycloak configuration complete."
