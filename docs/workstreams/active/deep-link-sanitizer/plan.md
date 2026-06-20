# Workstream: Deep-Link Sanitizer

## Goal

Own sensitive user-library deep links before generic routing can log or serialize secrets. Cold-start and warm-link handling must scrub playlist share token `t`, auth callback `auth_code`, `code`, `state`, and token-like query params before they reach `app/+not-found.tsx`, navigation state, logs, analytics, crash reporting, or error UI.

## Why This Workstream Exists

The design explicitly requires mobile to sanitize share-token and auth callback links before account launch. The current generic not-found route logs `JSON.stringify(globalSearchParams)`, which would leak tokens if `/playlist/{shortId}?t=...` or auth callback URLs fell through. This security slice should land before auth UI, share-token exchange, or playlist routes.

## Mutable Surface

Allowed files and directories:

- `app/+not-found.tsx` for removing sensitive fallback logging and adding safe fallback behavior.
- New route files under `app/` for first-class playlist/share/auth callback handling if needed.
- New `relisten/navigation/`, `relisten/linking/`, or similar helper modules for parsing and sanitizing URLs.
- Existing Last.fm auth listener files only as pattern references, not as shared account auth state.
- Tests for cold-start/warm-link sanitizer behavior once the harness exists.
- `docs/autoplan-user-library-mobile.md`, `docs/loop-ledger-user-library-mobile.md`, and this workstream ledger.

Out of scope:

- Exchanging share tokens with the API server.
- Completing Apple/Google sign-in.
- Building playlist UI.

## Main Validator

Run from `/Users/alecgorge/code/relisten/relisten-mobile`:

    yarn test -- sanitizer
    yarn lint
    yarn ts:check

Manual iOS Simulator validation should later cover opening:

    relisten://playlist/example?t=secret
    https://relisten.net/playlist/example?t=secret
    relisten://auth/callback?auth_code=secret&state=state

and observing that logs/navigation/error UI do not include the secret values.

## Fastest Useful Current Check

Done for `MOB-LINK-001`:

    yarn test -- sanitizer

## Dependencies or Blockers

The sanitizer landed before auth and playlist UI. The Vitest harness is available for future link-safety regressions.

## Current Hypothesis

Extract a pure sanitizer that takes a URL or pathname/query object and returns a redacted route intent. Then make `+not-found` stop logging raw params and add first-class handling for playlist/auth paths before generic web redirect behavior.

## Next Scoped Step

Done for `MOB-LINK-001`. Future work should exchange playlist share tokens in `mobile-share-token-exchange` or consume auth callback codes in `auth-session-user-service-client`; those slices should continue to use the sanitizer before logging or navigation serialization.

## Code Quality Rules

Default to redaction over clever allowlisting. Never log full URLs from user-library auth/share paths. Keep parsing logic pure and independently testable.
