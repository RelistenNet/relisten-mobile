# Workstream: Auth Session User Service Client

## Goal

Implement the mobile user-library auth/session layer after local API config is in place. The layer owns secure refresh-token storage, access-token injection for `/api/v3/library`, bounded refresh-on-401 behavior, sign-out/session revoke, recent reauthentication hooks, and account export/delete entry points required before account launch.

## Why This Workstream Exists

Auth cannot be bolted onto the existing catalog client because catalog requests are unauthenticated GETs with caching and URL logging. User-library auth is stateful and security-sensitive. It needs a separate service boundary that can be called by React screens, sync code, foreground hooks, and future share-token flows.

## Mutable Surface

Allowed files and directories:

- New auth/session files under `relisten/user_library/`, `relisten/api/`, or a similarly focused user-library module.
- Secure storage helpers, likely following `relisten/lastfm/lastfm_secrets.ts` patterns with `expo-secure-store`.
- User-library client auth middleware or request wrapper.
- App bootstrap hooks for restoring session state.
- Settings/account screens only for minimal sign-out/export/delete entry points when this workstream is promoted.
- Tests for token storage decisions, refresh retry boundaries, and sign-out behavior.

Out of scope:

- Production Apple/Google provider UI until local Development auth works.
- Full playlist UX.
- Server implementation.

## Main Validator

Run `yarn test -- auth`, `yarn lint`, and `yarn ts:check` from `/Users/alecgorge/code/relisten/relisten-mobile`.

## Fastest Useful Current Check

Targeted auth/session service tests once the harness exists.

## Dependencies or Blockers

Depends on `local-api-dev-config`, `test-harness-foundation`, and a Development-only auth path from `RelistenUserApi`.

## Current Hypothesis

Use a small class/service that wraps the user-library client, stores refresh tokens in SecureStore, keeps access tokens in memory when possible, and performs one bounded refresh retry on 401 before forcing sign-in.

## Next Scoped Step

Promote this workstream after `MOB-API-001` and the API dev-auth endpoint are ready. Claim a ledger experiment before editing.
