# C2 typed account client execution

This change moves the existing mobile account and favorites clients to the C2
contract. Catalog reads remain on v3. The private-alpha upgrade signs testers
out once while preserving anonymous favorites, catalog data, downloads,
playback history, and the current queue.

## Delivered

- [x] Parse and store complete typed account, session, command, favorite,
      mutation, change, and catalog target IDs.
- [x] Send the C2 username and library request shapes through the existing
      account client and sync loop.
- [x] Convert imported catalog UUID keys only at the catalog/library boundary.
      Keep short normalized song and venue targets opaque and durable.
- [x] Gate account startup on one restartable identity upgrade that clears old
      credentials and account-local state while preserving anonymous favorites
      and released local data.
- [x] Align the existing web cookie client and fixtures without changing its
      CSRF, origin, `no-store`, or logout behavior.
- [x] Verify the local account service and the retained iPhone 17 app flows.

## Ownership and boundaries

`AccountSessionCoordinator` remains the only owner of native sign-in, refresh,
logout, profile refresh, username commands, and account-generation fences.
`FavoriteRepository`, `FavoriteSyncService`, and
`FavoriteRemoteLibraryApplier` remain the only owners of membership, the
mutation outbox, cursors, exact retry, and server changes.

Realm stores the account profile and scope, username command, favorite rows,
mutation rows, sync cursors, catalog models, offline state, player state, and
playback history. SecureStore separately holds the refresh envelope and pending
PKCE transaction. React startup and imperative Realm opens use the same
serialized identity-upgrade gate, so CarPlay cannot observe the old account
schema before React completes startup.

Account-owned IDs stay as complete canonical strings. Imported `artist`,
`show`, `source`, `track`, `tour`, `imported_song`, and `imported_venue` targets
cross the existing UUID-keyed Realm boundary through one lossless UUID/U26
codec. Normalized `song_` and `venue_` targets are not decoded. They remain
saved when v3 cannot hydrate metadata.

The one-time upgrade deletes the unreleased authenticated profile, scope,
cursor, outbox, and pending username/favorite operations. It recreates
anonymous favorite rows with typed primary keys and targets, and resets an
unfinished anonymous import to deferred. It does not run account-transition
effects, touch files, or change catalog/player identities.

## Automated verification

The final mobile worktree passed:

- `yarn test`: 39 files, 254 tests
- `yarn ts:check`
- `yarn lint`
- `yarn test:favorites`: 12 checks
- `git diff --check`
- iOS Debug native build for retained simulator
  `063F4104-44E5-480E-94DD-847C0D024D4D`: `BUILD SUCCEEDED`

The focused coverage includes typed-ID codecs and wrong-prefix rejection,
request/response mapping, exact retry, snapshot/delta apply, normalized target
retention, account-generation fencing, credential/profile comparisons,
malformed-upgrade receipt isolation, and a queued startup retry after protected
storage becomes available. The stale-account test holds a library response,
switches the captured generation, and proves the late response is rejected
without applying it.

The web alignment is commit `402ba3c2e87480e8ab792fe7d81cc191e35c8846` on
`codex/c2-account-client-web`. It passed its 11 browser-session tests,
TypeScript check, and lint; the five reported lint warnings are pre-existing
and outside the three-file C2 diff. The real local HTTPS browser smoke also
passed its development-persona sign-in, typed `/v1/me` and library snapshot,
CSRF-protected logout, and subsequent `401` check.

## Retained-simulator upgrade

The rehearsal upgraded the installed app in place; it did not uninstall or
erase the simulator.

| Evidence | Before | After first C2 launch |
| --- | --- | --- |
| App / Realm | 6.1.4 (6051), schema 15 | 6.2.0 (6052), schema 17 |
| Catalog | 4,356 artists, 40 years, 689 shows, 25 sources, 30 source sets, 490 tracks, 666 venues, 54 tours | exact match |
| Playback | 20-item queue, active index 2, checkpoint and shuffle state | exact match |
| History | 8 entry IDs | exact match |
| Offline | 1 row; 19,023,952-byte file; SHA-256 `c87d0a228d0856f610a6234600af5ecb4d81e7652592584cab2d4db4606f2a9c` | exact match |
| Anonymous favorite | one old UUID-keyed artist row | one losslessly typed artist row |

The old app then created realistic interrupted state: a signed-in Alice
profile, one synced favorite, one offline pending favorite mutation, and one
offline pending username. The first C2 launch cleared only that account-local
state and the old protected credentials. It wrote upgrade marker version 1 at
`2026-10-31T21:34:21.513Z` and selected the anonymous scope. A second launch
left the marker and every retained invariant unchanged, proving the upgrade did
not rerun.

The post-upgrade evidence files are:

- `/tmp/relisten-c2-post-upgrade.json`, SHA-256
  `d1a4dd12108600de99c369fec49f05e1f1f0c366efd670f62ca8049188f493b5`
- `/tmp/relisten-c2-post-second-launch.json`, SHA-256
  `a18bb646ede1df2e19b03d058ef8999c37539416a1640e0c43b7ee5580f5234b`

## Real C2 account and library flows

The retained app completed a real authorization-code, PKCE, token, and
authenticated `/v1/me` flow through the local HTTPS account service. The
first-party ID token supplied typed user `sub` and intentionally omitted `sid`;
the authenticated access-token `/v1/me` response supplied the typed native
session. A present ID-token `sid` is still validated and compared, while an
omitted one no longer rejects the issuer's established token shape.

The restored identity was:

- user `user_01k8000000e008000000000001`
- session `session_01m69yjt70f81s5gt70t01zrng`
- username changed through a typed command from `c2_listener` to
  `c2_mobile_listener`

The initial library pull saved nine active memberships, one for every C2 kind:
`artist`, `show`, `source`, `track`, `tour`, `imported_song`,
`imported_venue`, `song`, and `venue`. The normalized song and venue remained
present while v3 metadata was unavailable. Adding and removing Billy Strings
proved the online favorite round trip. The final active target set exactly
matched the original seeded nine, with no pending mutation or username command
at revision 44.

The final signed-in capture is
`/tmp/relisten-c2-final-signed-in.json`, SHA-256
`36e6ef66c6d094d598efc294113030890224c4fee4ec2907c9f49f5bb535ecc0`.
It matches the retained catalog, history, offline, marker, and pre-logout queue
invariants.

### Exact retry across termination

With the local service stopped, the app stored this operation:

- mutation `mutation_01m69yt0gee7tvpj1hke5kdqny`
- favorite `favorite_01m69ym085evca67thxwb408er`
- target `artist_2j6a67avy742qfafsr2zzk646n` (Billy Strings)
- desired state `favorite`, local sequence 5

The row was unchanged after app termination. After the service returned, app
relaunch restored the same typed session and drained the same row. The isolated
server database contains exactly one receipt for that mutation and one matching
`favorite_added` change at revision 43. A separate cleanup mutation removed
Billy at revision 44.

The offline capture is
`/tmp/relisten-c2-offline-pending-favorite.json`, SHA-256
`6ed9d512791a94f24b370e6e452c5552beda178247c940077e5fab1e9e82421c`.

## Logout and final state

Explicit logout revoked native session
`session_01m69yjt70f81s5gt70t01zrng` and its sole OpenIddict authorization
family at `2026-10-31T21:50:36.754986Z`. Local scope changed to anonymous and
blocked that session from restoration. After termination and relaunch, the app
still showed the signed-out account screen.

Catalog data, history, the offline file, the upgrade marker, and the converted
anonymous favorite remained unchanged. Existing logout behavior intentionally
clears `PlayerState` and the queue through
`PlaybackAccountTransitionEffects`; queue preservation was proved across the
upgrade and ordinary authenticated restart, not across explicit sign-out.

The pre-relaunch logout capture is
`/tmp/relisten-c2-post-sign-out.json`, SHA-256
`a24c471622290f0fddc5821581e234926621f1f7ced15e3e06e6491eb5739714`.
The post-relaunch proof is
`/tmp/relisten-c2-post-logout-relaunch.json`, SHA-256
`c6bdfce42df61d99e709d67ac7229bfb1de17cefcd20aea29b1100a43dd39cbc`.

No API or web service was deployed, no production data was changed, and v4
catalog adoption remains outside C2.
