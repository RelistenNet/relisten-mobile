#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
PLATFORM="all"
SENTRY_AUTH_TOKEN=""
EXPO_TOKEN="${EXPO_TOKEN:-}"
ANDROID_JAVA_HOME="${ANDROID_JAVA_HOME:-}"
ANDROID_JAVA_HOME_LOGGED=0

usage() {
  echo "Usage: $0 [testflight|appstore|ota-testflight|ota-production] [--platform ios|android|all]"
  exit 1
}

if [[ -z "$TARGET" ]]; then
  usage
fi
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
  --platform|-p)
    shift
    PLATFORM="${1:-}"
    if [[ -z "$PLATFORM" ]]; then
      usage
    fi
    ;;
  ios|android|all)
    PLATFORM="$1"
    ;;
  *)
    usage
    ;;
  esac
  shift
done

# Xcode export uses /usr/bin/rsync and expects Apple rsync semantics.
# If Homebrew rsync is first in PATH, export can fail with:
# "rsync: on remote machine: --extended-attributes: unknown option".
XCODE_SAFE_PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Gradle for this project fails under JDK 25 (React Native plugin resolution).
# Prefer JDK 21, then 17, unless ANDROID_JAVA_HOME is explicitly provided.
java_major_version() {
  local java_home_path="$1"
  "$java_home_path/bin/java" -version 2>&1 | awk -F'"' '/version/ { split($2, parts, "."); print parts[1]; exit }'
}

pick_android_java_home() {
  local candidate=""
  local detected_major=""

  # Android Studio bundles a compatible JBR; prefer it if available.
  for candidate in \
    "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do
    if [[ -x "$candidate/bin/java" ]]; then
      detected_major="$(java_major_version "$candidate")"
      if [[ "$detected_major" == "21" || "$detected_major" == "17" ]]; then
        echo "$candidate"
        return
      fi
    fi
  done

  # Fallback to system-discovered JDK, but only accept exact major 21 or 17.
  for java_version in 21 17; do
    candidate="$(/usr/libexec/java_home -v "$java_version" 2>/dev/null || true)"
    if [[ -n "$candidate" && -x "$candidate/bin/java" ]]; then
      detected_major="$(java_major_version "$candidate")"
      if [[ "$detected_major" == "$java_version" ]]; then
        echo "$candidate"
        return
      fi
    fi
  done
}

ensure_sentry_token() {
  if [[ -z "$SENTRY_AUTH_TOKEN" ]]; then
    # Needed so Sentry sourcemaps are uploaded during release builds
    SENTRY_AUTH_TOKEN="$(op read "op://Private/Relisten Sentry SaaS/CI org auth token")"
    echo "Sentry auth token: $(echo "$SENTRY_AUTH_TOKEN" | cut -c1-10)..."
  fi
}

ensure_expo_token() {
  if [[ -z "$EXPO_TOKEN" ]]; then
    EXPO_TOKEN="$(op read "op://Private/Relisten OTA Expo access token/credential")"
  fi

  if [[ -z "$EXPO_TOKEN" ]]; then
    echo "Could not load EXPO_TOKEN from 1Password."
    exit 1
  fi
}

ensure_android_java_home() {
  local detected_major=""

  if [[ -z "$ANDROID_JAVA_HOME" ]]; then
    ANDROID_JAVA_HOME="$(pick_android_java_home)"
  fi

  if [[ -z "$ANDROID_JAVA_HOME" || ! -x "$ANDROID_JAVA_HOME/bin/java" ]]; then
    echo "Could not find a compatible JDK (21/17). Set ANDROID_JAVA_HOME explicitly."
    exit 1
  fi

  detected_major="$(java_major_version "$ANDROID_JAVA_HOME")"
  if [[ "$detected_major" != "21" && "$detected_major" != "17" ]]; then
    echo "ANDROID_JAVA_HOME points to Java $detected_major. Use JDK 21 or 17."
    exit 1
  fi

  if [[ "$ANDROID_JAVA_HOME_LOGGED" -eq 0 ]]; then
    echo "Android Java home: $ANDROID_JAVA_HOME"
    echo "Android Java version: $("$ANDROID_JAVA_HOME/bin/java" -version 2>&1 | head -n 1)"
    ANDROID_JAVA_HOME_LOGGED=1
  fi
}

build_ios() {
  local profile="$1"
  ensure_sentry_token
  echo "Building iOS ($profile)..."
  env PATH="$XCODE_SAFE_PATH" SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" npx eas-cli@latest build -p ios --profile "$profile" --local
}

build_android() {
  local profile="$1"
  ensure_sentry_token
  ensure_android_java_home
  echo "Building Android ($profile)..."
  env JAVA_HOME="$ANDROID_JAVA_HOME" PATH="$ANDROID_JAVA_HOME/bin:$PATH" ANDROID_HOME="$HOME/Library/Android/sdk" SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" npx eas-cli@latest build -p android --profile "$profile" --local
}

build_target() {
  local profile="$1"
  case "$PLATFORM" in
  ios)
    build_ios "$profile"
    ;;
  android)
    build_android "$profile"
    ;;
  all)
    build_ios "$profile"
    build_android "$profile"
    ;;
  *)
    usage
    ;;
  esac
}

publish_ota() {
  local branch="$1"

  if [[ "$PLATFORM" != "all" ]]; then
    echo "OTA publish always targets both platforms. Remove --platform or use --platform all."
    exit 1
  fi

  ensure_expo_token

  echo "Publishing OTA to branch '$branch' (ios+android)..."
  env EXPO_TOKEN="$EXPO_TOKEN" RELEASE_CHANNEL="$branch" npx eoas publish --branch "$branch" --platform all
}

case "$TARGET" in
testflight)
  build_target testflight
  ;;
appstore)
  build_target production
  ;;
ota-testflight)
  publish_ota testflight
  ;;
ota-production)
  publish_ota production
  ;;
*)
  usage
  ;;
esac
