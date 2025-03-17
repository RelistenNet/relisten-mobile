#!/usr/bin/env bash

# Need to pass SENTRY_AUTH_TOKEN to have sourcemaps uploaded
SENTRY_AUTH_TOKEN=$(op read "op://Private/Relisten Sentry SaaS/CI org auth token")

echo "Sentry auth token: " $(echo $SENTRY_AUTH_TOKEN |cut -c1-10)...

env SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN npx eas-cli@latest build -p ios -e production --local
env ANDROID_HOME=$HOME/Library/Android/sdk SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN npx eas-cli@latest build -p android -e production --local
