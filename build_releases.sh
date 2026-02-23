#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"

usage() {
  echo "Usage: $0 [testflight|appstore]"
  exit 1
}

if [[ -z "$TARGET" ]]; then
  usage
fi

# Need to pass SENTRY_AUTH_TOKEN to have sourcemaps uploaded
SENTRY_AUTH_TOKEN=$(op read "op://Private/Relisten Sentry SaaS/CI org auth token")

echo "Sentry auth token: $(echo "$SENTRY_AUTH_TOKEN" | cut -c1-10)..."

build_ios() {
  local profile="$1"
  echo "Building iOS ($profile)..."
  env SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" npx eas-cli@latest build -p ios --profile "$profile" --local
}

build_android() {
  local profile="$1"
  echo "Building Android ($profile)..."
  env ANDROID_HOME="$HOME/Library/Android/sdk" SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" npx eas-cli@latest build -p android --profile "$profile" --local
}

case "$TARGET" in
testflight)
  build_ios testflight
  build_android testflight
  ;;
appstore)
  build_ios production
  build_android production
  ;;
*)
  usage
  ;;
esac
