#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
PLATFORM="all"

usage() {
  echo "Usage: $0 [testflight|appstore] [--platform ios|android|all]"
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

# Need to pass SENTRY_AUTH_TOKEN to have sourcemaps uploaded
SENTRY_AUTH_TOKEN=$(op read "op://Private/Relisten Sentry SaaS/CI org auth token")
# Xcode export uses /usr/bin/rsync and expects Apple rsync semantics.
# If Homebrew rsync is first in PATH, export can fail with:
# "rsync: on remote machine: --extended-attributes: unknown option".
XCODE_SAFE_PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Gradle for this project fails under JDK 25 (React Native plugin resolution).
# Prefer JDK 21, then 17, unless ANDROID_JAVA_HOME is explicitly provided.
ANDROID_JAVA_HOME="${ANDROID_JAVA_HOME:-}"
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

if [[ -z "$ANDROID_JAVA_HOME" ]]; then
  ANDROID_JAVA_HOME="$(pick_android_java_home)"
fi

if [[ -z "$ANDROID_JAVA_HOME" || ! -x "$ANDROID_JAVA_HOME/bin/java" ]]; then
  echo "Could not find a compatible JDK (21/17). Set ANDROID_JAVA_HOME explicitly."
  exit 1
fi

echo "Sentry auth token: $(echo "$SENTRY_AUTH_TOKEN" | cut -c1-10)..."
echo "Android Java home: $ANDROID_JAVA_HOME"
echo "Android Java version: $("$ANDROID_JAVA_HOME/bin/java" -version 2>&1 | head -n 1)"

build_ios() {
  local profile="$1"
  echo "Building iOS ($profile)..."
  env PATH="$XCODE_SAFE_PATH" SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" npx eas-cli@latest build -p ios --profile "$profile" --local
}

build_android() {
  local profile="$1"
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

case "$TARGET" in
testflight)
  build_target testflight
  ;;
appstore)
  build_target production
  ;;
*)
  usage
  ;;
esac
