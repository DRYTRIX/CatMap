#!/usr/bin/env bash
# Create an upload keystore for Play Store release signing.
# Run from frontend/android: bash scripts/create-keystore.sh
set -euo pipefail

KEYSTORE="${1:-catmap-upload.keystore}"
ALIAS="${2:-catmap}"

if [ -f "$KEYSTORE" ]; then
  echo "Keystore already exists: $KEYSTORE"
  exit 1
fi

keytool -genkey -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=CatMap, OU=Mobile, O=Drytrix, L=Unknown, ST=Unknown, C=US"

cat > keystore.properties <<EOF
storeFile=../$KEYSTORE
storePassword=PROMPT_AT_BUILD
keyAlias=$ALIAS
keyPassword=PROMPT_AT_BUILD
EOF

echo ""
echo "Created $KEYSTORE and keystore.properties template."
echo "Edit keystore.properties with your real passwords before bundleRelease."
