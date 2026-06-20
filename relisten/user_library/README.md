# User Library Mobile Architecture

This folder owns mobile state that belongs to a user rather than to the shared
catalog cache. Catalog Realm rows such as `Artist`, `Show`, `Source`, and
`SourceTrack` still represent public Relisten data. User-library rows are scoped
by the active user-data scope so signed-out device data, authenticated account
data, and external/share-grant data can coexist without overwriting each other.

## Runtime Shape

The mobile app intentionally has two API clients:

- `RelistenApiClient` remains the read-heavy catalog client. It keeps catalog
  URL shape, caching, ETag, and rate-limit behavior.
- `RelistenUserLibraryApiClient` is mutation-oriented. It targets
  `/api/v3/library`, adds bearer tokens when provided, and sends no-store
  headers by default.

`relisten/api/config.ts` resolves separate environment variables for the two
base URLs. For iOS Simulator local development, start Metro with:

```sh
EXPO_PUBLIC_RELISTEN_CATALOG_API_BASE_URL=http://localhost:3823/api \
EXPO_PUBLIC_RELISTEN_USER_API_BASE_URL=http://localhost:5119 \
npx expo start --dev-client
```

## Scope Model

`user_data_scope.ts` defines stable scope ids. Every user-owned Realm primary
key is built from `(scopeId, localId)` with `scopedUserDataPrimaryKey`.

`active_user_data_scope_service.ts` maintains the single active scope row:

- anonymous scope for signed-out local behavior;
- authenticated scope for user-account data;
- external scope reserved for future provider/share-grant flows.

Readers should assume scoped rows are not deleted during sign-out. Signing out
only moves the active scope back to anonymous and marks session metadata signed
out.

## Auth

`auth_session.ts` owns token lifecycle. Access tokens stay in memory. Refresh
tokens live in `SecureStoreUserLibraryRefreshTokenStore`, not Realm. A session
generation counter rejects stale refresh/sign-in results if sign-out or another
auth transition happens while an async request is in flight.

`auth_session_realm_service.ts` mirrors non-secret session metadata into Realm
and activates the authenticated scope. Realm metadata is for UI/sync decisions;
it is not a credential store.

`development_auth.ts` and `development_auth_panel.tsx` are development-only
entry points that call the real local user-library API development session
endpoint. They do not fake authenticated state locally.

## Sync Loop

`user_library_sync_bootstrap.tsx` is the app-level bridge. It watches:

- active scope changes;
- network availability;
- pending playlist operations;
- pending scoped playback-history rows;
- foreground transitions.

`user_library_sync_runner.ts` serializes sync work for the current active
authenticated scope. The order is intentional:

1. replay local playlist operations from the outbox;
2. flush pending scoped playback history;
3. pull server sync changes and tombstones;
4. persist the sync cursor only after the pull response is applied.

The runner checks the active scope before and after each network phase. If the
user signs out or switches scope mid-run, it stops with `stale_scope` rather
than applying data to the wrong scope.

## Favorites

Favorites are in a migration phase:

- signed-out behavior still uses legacy `isFavorite` booleans on catalog rows;
- authenticated behavior uses scoped `UserFavorite` rows;
- `LibraryIndex` reads from the active authenticated scope when present, and
  falls back to catalog booleans otherwise.

`favorite_sync.ts` migrates device-local catalog favorites into scoped rows once
per installation. That import is intentionally one-way: after authenticated sync
begins, server state and scoped rows are the source of truth.

`favorite_state.ts` performs optimistic mutations and restores the previous
scoped row if the API call fails. This keeps existing heart UI responsive while
preserving server-backed correctness for signed-in users.

## Playback History

The app still records legacy catalog playback history through
`PlaybackHistoryReporter`. Authenticated sessions also journal a scoped
`ScopedPlaybackHistoryEntry` with a client event UUID, device id, source track,
and optional playlist attribution.

`playback_history_batch.ts` treats `clientEventUuid` as the idempotency key. A
server `accepted` or `duplicate` result marks the row synced. History-disabled
results are blocked. Missing or unknown per-event results are failed so a later
sync can retry with visible state.

## Playlists

Playlist support is service-layer foundation, not a full UI yet.

`playlist_sync.ts` applies server snapshots into scoped `UserPlaylist` and
`UserPlaylistEntry` rows. Each server snapshot replaces the active entry set for
that playlist; entries missing from the snapshot are soft-deleted.

`playlist_operation_outbox.ts` persists local playlist mutations as
`PendingUserOperation` rows keyed by operation idempotency key. Replay is ordered
by creation time. If one operation for a playlist fails, later operations for
that playlist are skipped for the run so they do not apply against an unknown
base revision.

`playlist_read.ts` reads playlists by UUID or short id, applies snapshots, and
builds a hydration plan that separates playable entries, catalog-missing
entries, and server-unavailable entries.

`share_token_exchange.ts` handles `/playlist/:id?t=...` links. The token
exchange can use the current authenticated session, but it also works for
anonymous scope by storing a mobile access grant. Grant metadata lives in Realm;
the grant secret lives in secure storage and is joined back into request headers
only when reading the playlist.

## What Is Not Built Yet

This branch does not include the playlist-building UI. There is no playlist
detail screen, create playlist flow, add-to-playlist picker, reorder UI, or share
management UI. The current UI surface is development sign-in, scoped favorites,
and a transient share-link exchange route.
