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

    yarn test -- link
    yarn lint
    yarn ts:check

If the harness does not exist yet, run `yarn lint` and `yarn ts:check` and record that sanitizer tests are pending.

Manual iOS Simulator validation should later cover opening:

    relisten://playlist/example?t=secret
    https://relisten.net/playlist/example?t=secret
    relisten://auth/callback?auth_code=secret&state=state

and observing that logs/navigation/error UI do not include the secret values.

## Fastest Useful Current Check

After the test harness exists:

    yarn test -- sanitizer

The exact command may change; update this plan after `test-harness-foundation` lands.

## Dependencies or Blockers

The sanitizer can start before auth and playlist UI. A test harness is preferred before implementation so the dangerous cases are locked down mechanically.

## Current Hypothesis

Extract a pure sanitizer that takes a URL or pathname/query object and returns a redacted route intent. Then make `+not-found` stop logging raw params and add first-class handling for playlist/auth paths before generic web redirect behavior.

## Next Scoped Step

Claim experiment `MOB-LINK-001` in this ledger before editing code. Add sanitizer tests first if the harness exists; otherwise add the sanitizer with `ts:check`/lint and immediately backfill tests when the harness lands.

## Code Quality Rules

Default to redaction over clever allowlisting. Never log full URLs from user-library auth/share paths. Keep parsing logic pure and independently testable.
