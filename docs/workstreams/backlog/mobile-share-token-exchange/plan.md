# Workstream: Mobile Share-Token Exchange

## Goal

Implement mobile handling for `/playlist/{shortId}?t=...` after the sanitizer and user-library client exist. Viewer tokens should become short-lived signed-out mobile grants or signed-in Follow/Clone choices. Editor tokens should require sign-in and then convert to collaborator/editor access.

## Why This Workstream Exists

Universal Links can expose sensitive share tokens. The app must scrub the original token immediately, exchange it with `RelistenUserApi`, and store only the grant secret/metadata needed for later tokenless access. This behavior is separate from full playlist editing UX.

## Mutable Surface

Allowed files and directories:

- Playlist/auth route handlers added by the sanitizer workstream.
- User-library client share-token exchange methods.
- Secure storage for mobile grant secrets.
- Scoped Realm/local-only metadata for non-secret grant metadata.
- Tests for token scrubbing, exchange request shape, and header injection.

Out of scope:

- Full playlist editor UX.
- Server share-token implementation.

## Main Validator

Run targeted share-token tests, `yarn lint`, and `yarn ts:check`.

## Fastest Useful Current Check

Pure tests for exchange payload/header construction.

## Dependencies or Blockers

The pure mobile foundation depends on `deep-link-sanitizer`, `auth-session-user-service-client`, and local API config; those are now available. Live validation still depends on server share-token exchange endpoint availability.

## Current Hypothesis

Keep original URL tokens transient and out of storage/loggable metadata. Store only grant selector/device/platform metadata in scoped Realm and grant secrets in SecureStore. Tokenless playlist reads should present `X-Relisten-Mobile-Grant` and `X-Relisten-Device-Id` once a mobile playlist read client/UI exists.

## Next Scoped Step

Run live Universal Link/exchange smoke when `RelistenUserApi` is listening with the share-token endpoint. Defer Follow/Clone/editor choices to the playlist mobile UX workstream.
