#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
PLATFORM="all"
SENTRY_AUTH_TOKEN=""
EXPO_TOKEN="${EXPO_TOKEN:-}"
ANDROID_JAVA_HOME="${ANDROID_JAVA_HOME:-}"
ANDROID_JAVA_HOME_LOGGED=0
EOAS_BIN="${EOAS_BIN:-}"
OTA_RUNTIME_BUILD=""
OTA_IOS_RUNTIME_VERSION="${RELISTEN_IOS_RUNTIME_VERSION:-}"
OTA_ANDROID_RUNTIME_VERSION="${RELISTEN_ANDROID_RUNTIME_VERSION:-}"
OTA_RUNTIME_BUILD_REQUESTED=0
OTA_RUNTIME_EXACT_REQUESTED=0
OTA_RUNTIME_OVERRIDE_REQUESTED=0

usage() {
  cat <<USAGE
Usage: $0 [testflight|appstore|ota-testflight|ota-production] [options]

Options:
  --platform ios|android|all
  --runtime-build BUILD_NUMBER
      OTA only. Publish to runtime versions VERSION+ios.BUILD_NUMBER and VERSION+android.BUILD_NUMBER.
  --ios-runtime-version RUNTIME_VERSION
      OTA only. Override the iOS runtime version exactly.
  --android-runtime-version RUNTIME_VERSION
      OTA only. Override the Android runtime version exactly.

Environment:
  EOAS_BIN
      Optional eoas executable override. Set to /bin/echo for an OTA command dry run.

Examples:
  $0 ota-testflight --runtime-build 6036
  $0 ota-testflight --ios-runtime-version 6.1.0+ios.6036 --android-runtime-version 6.1.0+android.6036
USAGE
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
  --runtime-build)
    shift
    OTA_RUNTIME_BUILD="${1:-}"
    OTA_RUNTIME_BUILD_REQUESTED=1
    OTA_RUNTIME_OVERRIDE_REQUESTED=1
    if [[ -z "$OTA_RUNTIME_BUILD" ]]; then
      usage
    fi
    ;;
  --runtime-build=*)
    OTA_RUNTIME_BUILD="${1#*=}"
    OTA_RUNTIME_BUILD_REQUESTED=1
    OTA_RUNTIME_OVERRIDE_REQUESTED=1
    if [[ -z "$OTA_RUNTIME_BUILD" ]]; then
      usage
    fi
    ;;
  --ios-runtime-version)
    shift
    OTA_IOS_RUNTIME_VERSION="${1:-}"
    OTA_RUNTIME_EXACT_REQUESTED=1
    OTA_RUNTIME_OVERRIDE_REQUESTED=1
    if [[ -z "$OTA_IOS_RUNTIME_VERSION" ]]; then
      usage
    fi
    ;;
  --ios-runtime-version=*)
    OTA_IOS_RUNTIME_VERSION="${1#*=}"
    OTA_RUNTIME_EXACT_REQUESTED=1
    OTA_RUNTIME_OVERRIDE_REQUESTED=1
    if [[ -z "$OTA_IOS_RUNTIME_VERSION" ]]; then
      usage
    fi
    ;;
  --android-runtime-version)
    shift
    OTA_ANDROID_RUNTIME_VERSION="${1:-}"
    OTA_RUNTIME_EXACT_REQUESTED=1
    OTA_RUNTIME_OVERRIDE_REQUESTED=1
    if [[ -z "$OTA_ANDROID_RUNTIME_VERSION" ]]; then
      usage
    fi
    ;;
  --android-runtime-version=*)
    OTA_ANDROID_RUNTIME_VERSION="${1#*=}"
    OTA_RUNTIME_EXACT_REQUESTED=1
    OTA_RUNTIME_OVERRIDE_REQUESTED=1
    if [[ -z "$OTA_ANDROID_RUNTIME_VERSION" ]]; then
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

if [[ "$OTA_RUNTIME_BUILD_REQUESTED" -eq 1 && "$OTA_RUNTIME_EXACT_REQUESTED" -eq 1 ]]; then
  echo "Use either --runtime-build or exact per-platform runtime versions, not both."
  exit 1
fi

if [[ "$OTA_RUNTIME_OVERRIDE_REQUESTED" -eq 1 ]]; then
  case "$TARGET" in
  ota-testflight|ota-production) ;;
  *)
    echo "Runtime version options are only supported by ota-testflight and ota-production."
    exit 1
    ;;
  esac
fi

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

app_version() {
  node -e 'const app = require("./app.json").expo; process.stdout.write(String(app.version ?? "0.0.0"));'
}

configure_ota_runtime_versions() {
  local version=""

  if [[ "$OTA_RUNTIME_BUILD_REQUESTED" -eq 1 ]]; then
    if [[ ! "$OTA_RUNTIME_BUILD" =~ ^[0-9]+$ ]]; then
      echo "--runtime-build must be an integer build number."
      exit 1
    fi

    version="$(app_version)"
    OTA_IOS_RUNTIME_VERSION="${version}+ios.${OTA_RUNTIME_BUILD}"
    OTA_ANDROID_RUNTIME_VERSION="${version}+android.${OTA_RUNTIME_BUILD}"
  fi

  if [[ -n "$OTA_IOS_RUNTIME_VERSION" || -n "$OTA_ANDROID_RUNTIME_VERSION" ]]; then
    if [[ -z "$OTA_IOS_RUNTIME_VERSION" || -z "$OTA_ANDROID_RUNTIME_VERSION" ]]; then
      echo "Provide both --ios-runtime-version and --android-runtime-version, or use --runtime-build."
      exit 1
    fi

    echo "OTA runtime versions:"
    echo "  iOS: $OTA_IOS_RUNTIME_VERSION"
    echo "  Android: $OTA_ANDROID_RUNTIME_VERSION"
  fi
}

run_eoas() {
  if [[ -n "$EOAS_BIN" ]]; then
    "$EOAS_BIN" "$@"
  else
    npx eoas "$@"
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

  configure_ota_runtime_versions
  ensure_expo_token

  echo "Publishing OTA to branch '$branch' (ios+android)..."
  export EXPO_TOKEN
  export RELEASE_CHANNEL="$branch"
  export RELISTEN_IOS_RUNTIME_VERSION="$OTA_IOS_RUNTIME_VERSION"
  export RELISTEN_ANDROID_RUNTIME_VERSION="$OTA_ANDROID_RUNTIME_VERSION"

  run_eoas publish --branch "$branch" --platform all
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
