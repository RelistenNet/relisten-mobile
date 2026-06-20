# Workstream: Local API Dev Config

## Goal

Make Relisten mobile able to run in the iOS Simulator against separate local catalog and user-library API servers without editing source code. The catalog API client keeps its current read-heavy caching behavior. The user-library API client is separate and prepared for auth, refresh, mutation, and no-store behavior.

## Why This Workstream Exists

The current mobile client is optimized for unauthenticated catalog reads and hardcodes `https://api.relisten.net/api`. User-library endpoints under `/api/v3/library` have different caching, logging, auth, and retry needs. A clean local config slice prevents later auth, sync, and playlist work from adding one-off base URL switches or accidentally sending user-library requests through catalog ETag/rate-limit paths.

## Mutable Surface

Allowed files and directories:

- `relisten/api/client.ts` only for preserving catalog client behavior or extracting shared low-level helpers.
- New `relisten/api/config.ts` or equivalent for API base URL selection.
- New `relisten/api/user_library_client.ts` or equivalent for user-library requests.
- `app.config.js`, `app.json`, and Expo env documentation only if needed to pass local base URLs into JS.
- `README.md` or a focused docs note if a local iOS Simulator recipe is needed.
- Test files/config created by `test-harness-foundation` when that harness exists.
- `docs/autoplan-user-library-mobile.md`, `docs/loop-ledger-user-library-mobile.md`, and this workstream ledger.

Out of scope:

- Auth token storage and refresh-on-401 behavior beyond placeholder seams.
- Queue V2, Realm user data, playlist UI, Cast, or CarPlay changes.
- Server changes in `/Users/alecgorge/code/relisten/RelistenApi`.

## Main Validator

Run from `/Users/alecgorge/code/relisten/relisten-mobile`:

    yarn lint
    yarn ts:check

After the test harness exists, also run the targeted API config tests.

For local smoke, after `RelistenUserApi` is running on `http://localhost:5119`, the iOS Simulator path should be able to issue a user-library health or profile request to the local base URL and a catalog request to the selected catalog base URL. Until the mobile app has a UI trigger, a small debug/service probe is acceptable if it does not ship to production surfaces.

## Fastest Useful Current Check

    yarn test -- api-config

## Dependencies or Blockers

No code dependency blocks base URL configuration. Full local auth smoke depends on the API thread landing or documenting a Development-only auth path in `RelistenUserApi`.

## Current Hypothesis

The smallest durable slice is to introduce explicit catalog and user-library base URL config, keep `RelistenApiClient` as the catalog client, and add a new user-library client with no catalog cache/rate-limit behavior. Environment variable names should be stable and explicit, for example `EXPO_PUBLIC_RELISTEN_CATALOG_API_BASE_URL` and `EXPO_PUBLIC_RELISTEN_USER_API_BASE_URL`.

## Next Scoped Step

Done for `MOB-API-001`. When local catalog and user-library servers are running, use `runLocalApiBaseUrlProbe` to verify live routing from a development-only caller.

## Code Quality Rules

Do not add a generic networking framework. Keep catalog and user-library clients separate in name and behavior. Redact or avoid full URL logging for user-library requests because auth codes, share tokens, and grants may appear in URLs or headers during development.
