# Ledger: Mobile Share-Token Exchange

## MOB-SHARE-001 - exchange client and mobile grant storage

Status: completed 2026-06-20T06:31:53Z by root Codex agent on branch `codex/scoped-realm-user-data`.

Start commit: `8e52855`.

Mutable surface:

- `relisten/user_library/share_token_exchange.ts`
- mobile grant secure-store implementation files under `relisten/user_library/`
- focused share-token exchange tests under `relisten/user_library/`
- scoped route usage only if the existing `/playlist/[playlistId]` route can trigger exchange without persisting or forwarding the URL token

Validator:

- `yarn test -- share-token sanitizer api-config`
- `yarn test`
- `yarn ts:check`
- `yarn lint`
- `git diff --check`

Goal:

Add the mobile share-token exchange foundation: typed request helper, grant token parsing, secret storage boundary, scoped Realm metadata upsert, and grant header construction for later tokenless playlist reads. Keep the original URL token transient and out of storage/loggable metadata.

Result:

- Added typed `POST /api/v3/library/playlists/{playlistUuidOrShortId}/share-tokens/exchange` client helper.
- Added `/playlist/[playlistId]` route exchange handling while preserving tokenless redirect/navigation params.
- Stored only grant selector/device/platform metadata in scoped Realm and grant secrets in SecureStore.
- Added tokenless read header construction with `X-Relisten-Mobile-Grant` and `X-Relisten-Device-Id`.
- Added regressions for Expo SecureStore-compatible keys and active-scope changes during an in-flight exchange.

Validation:

- `yarn test -- share-token-exchange sanitizer api-config`
- `yarn test`
- `yarn ts:check`
- `yarn lint`
- `git diff --check`
- subagent review and re-review

Follow-up:

Run live Universal Link/exchange smoke when local `RelistenUserApi` exposes the share-token endpoint. Wire `buildMobileAccessGrantHeaders` into tokenless playlist reads when the playlist read UI/client exists. Follow/Clone/editor UX remains deferred to the playlist mobile UX workstream.
