# Local-first playlists

Status: approved 2026-11-16 after a fresh-reader review; milestone 1 not started. Branch `codex/v4-playlists-mobile`, cut from
`codex/v4-mobile-pilot` at `535ec16` (Realm schema 23).

## Purpose and current decisions

A listener can make playlists without an account. They work fully offline:
create, edit, reorder, play, shuffle by group and download. Signing in adds
syncing playlists to the account and copying local playlists into it. Relisten is
an anonymous, offline-first app, so **signed-out local playlists are the primary
v1 feature and account sync is a layer on top** (Alec, 2026-11-16).

The server contract is frozen in the API repository on branch
`codex/v4-playlist-plan`:
[Private playlist contracts](../../../../RelistenApi-v4-playlists/docs/plans/active/2026-11-16-v4-playlist-contracts.md),
with decisions in
[Deliver playlists using v4 catalog identities](../../../../RelistenApi-v4-playlists/docs/plans/active/2026-11-06-v4-playlists.md).
That contract wins on anything about the wire, ranks, operation semantics or
recovery. This plan owns the mobile model, screens, sync client and player.

This plan replaces the playlist portions of
`2026-07-18-relisten-mobile-account-library-ux-rollout.md` and
`2026-07-18-relisten-mobile-accounts-library-sync-and-sonos-implementation.md`.
Those assumed recording-only blocks, server-hydrated snapshots carrying catalog
rows, and no resolver hydration; all three are now wrong. Their route list,
signed-out states and copy-to-account intent carry forward below.

Settled decisions this plan builds on:

- A playlist is an ordered list of segments, and each segment is an ordered list
  of entries. A lone track is a one-track segment. Segments may mix recordings.
- An entry references a catalog track by typed `track_` ID only. Catalog data
  comes from Realm; missing tracks are hydrated through
  `POST /api/v4/catalog/resolve`. Mobile never re-checks cached tracks; it
  re-resolves a track when its playback fails.
- Account playlists are archive-only in v1.
- Segment shuffle ships. Track-level shuffle that ignores segments is deferred.
- Realm `sorted()` on a rank property matches byte order (verified 2026-11-16 on
  Realm 20.2.0), so queries may sort by rank directly.

### Terms

| Term | Meaning |
| --- | --- |
| Playlist, segment, entry | Contract terms. The UI says "playlist", "group" and "track". |
| Rank | Opaque ordering string for a segment among segments, or an entry within its segment. Never shown. |
| Queue occurrence | One `PlayerQueueTrack` in the player queue. Every enqueue makes new ones. |
| Segment instance | One enqueue of one segment. Its queue occurrences share a `segmentInstanceId`. |

## Milestones

Each milestone is releasable on its own.

1. **Local playlists.** Everything works in the anonymous scope with no server:
   create, edit, play, group shuffle, download, restart and restore. No server
   work is required.
2. **Account playlists.** Sync to `accounts.relisten.net/v1`: outbox, sync
   coordinator, library feed summaries, archive, history-generation recovery and
   quota handling. This needs the User Service's delivery-1 implementation, which
   has not started.
3. **Save to my account.** Copy one local playlist, or all of them, into the
   account as independent private playlists. The local originals stay.

Milestone 1's end-to-end proof: create a playlist from a show, edit it offline,
restart the app, and play it with group shuffle. Milestone 2 extends that proof
with sync to a second device.

## Where playlists appear

| Situation | Playlist list shows | New playlists go to |
| --- | --- | --- |
| Signed out | **Playlists** (local) | Local |
| Signed in, milestone 1 | **On this device** (local) | Local |
| Signed in, milestone 2+ | **Mine** (account), **On this device** (local, if any), **Archived playlists** row | Account |

Local playlists belong to the device, like downloads, and are visible to anyone
using the app, signed in or out. Local playlists are never folded into **Mine** automatically.
Signed-out playlists are lost if the app is deleted; the list shows a one-line
note offering sign-in to keep playlists across devices (milestone 2+).

## Existing code to reuse

Favorites already solved most of the scope and outbox problems. Follow their
patterns rather than inventing parallel ones.

| Need | Existing pattern |
| --- | --- |
| Scope every row to anonymous or an account | `scopeId` on `UserFavorite`, `ANONYMOUS_ACCOUNT_SCOPE_ID` in `relisten/realm/models/accounts/active_account_scope.ts` |
| Acknowledged vs. displayed state on one row | `UserFavorite.acknowledgedPresent` / `effectivePresent` |
| Durable outbox with states and attempts | `FavoriteMutation` |
| When an unsent edit may be replaced | `isTrulyUnsentFavoriteMutation` in `relisten/library/favorite_mutation_compaction.ts` |
| Reject writes from a stale account scope | `captureScope` / `isCaptureCurrent` in `relisten/library/favorite_repository.ts` |
| Copy anonymous data into an account with receipts | `AnonymousLibraryImportService` (`importToActiveAccount`) and `AnonymousFavoriteImport` |
| Library feed client | `relisten/library/favorite_sync_contract.ts`, `favorite_sync_service.ts`, `favorite_sync_coordinator.tsx` |
| Resolver hydration | `relisten/library/favorite_metadata_hydrator.ts` |
| Fresh queue identity per enqueue | `PlayerQueueTrack.newOccurrence()` in `relisten/player/relisten_player_queue.tsx` |
| Persisted queue and shuffle order | `PlayerQueueEntry`, `PlayerShuffleOrder`, `PlayerState.upsert` in `relisten/realm/models/player_state.ts` |
| Account switch stops playback and clears queues | `relisten/accounts/account_transition_effects.ts`, `relisten/player/playback_account_transition_effects.ts` |

Add the `fractional-indexing` npm package (Rocicorp), pinned, for rank generation.

## Realm model

Each milestone adds only its own models, in its own schema version. Catalog
references stay typed strings, not Realm links, so entries survive catalog
eviction, as `UserFavorite` does.

### Schema 24 (milestone 1)

`Playlist`

- `playlistId` (primary key, `playlist_` UUIDv7), `scopeId` (indexed).
- `name`, `description?`, `createdAt`, `updatedAt`.

`PlaylistSegment`

- `segmentId` (primary key), `playlistId` (indexed), `scopeId`, `rank`.

`PlaylistEntry`

- `entryId` (primary key), `playlistId` (indexed), `segmentId`, `trackId`
  (indexed `track_` ID), `scopeId`, `rank`.

Local deletes remove rows outright; local playlists have no tombstones, because
nothing else holds their IDs. Copying to an account always uses fresh IDs.

`PlayerQueueEntry` gains optional `playlistId`, `segmentInstanceId` and
`entryId`. The migration leaves them empty on existing entries.

### Schema 25 (milestone 2)

- `Playlist` gains `archived`, `serverState` (`creating`, `synced`,
  `needs_attention`), `appliedRevision?`, `historyGeneration?` and
  `summaryRevision?`.
- `PlaylistSegment` and `PlaylistEntry` gain `live` (indexed) and canonical
  fields: `canonicalRank?`, `canonicalLive`, and for entries
  `canonicalSegmentId?`. In the account scope, displayed fields are canonical plus
  the overlay; deleted items stay as non-live rows until a pull removes them.
- `PlaylistOperation`: `operationId`, `playlistId`, `scopeId`, `localSequence`,
  `operationType`, `payloadJson` (frozen exact contract payload), `baseRevision`,
  `state`, `attemptCount`, `nextAttemptAt?`, `lastErrorCode?`, `resultStatus?`,
  `resultRevision?`, `resultGeneration?`, and `failedTrackIds` (for retrying
  additions that did not land).
- `PlaylistCommand`: persisted create and archive commands with `commandId`,
  `kind`, `playlistId`, `payloadJson`, `state`, attempts and result.
- The library cursor's stored state gains `historyGeneration`.

Operation states:

| State | Meaning |
| --- | --- |
| `pending` | Not yet sent, or waiting to retry after a transport failure. |
| `in_flight` | Included in a request that has not returned. |
| `acknowledged` | Result received; stays in the overlay until a pull in the same generation reaches its result revision. |
| `quota_paused` | Whole outbox paused after `quota_exceeded`. |
| `archived_hold` | Held because the playlist is archived. |
| `needs_attention` | Rejected, or a create failed terminally; shown to the user. |

### Schema 26 (milestone 3)

`PlaylistCopyJob` and `PlaylistCopyReceipt`; see Save to my account.

### Queries

A playlist screen runs two live queries: its segments sorted by `rank`, and all
its entries (by `playlistId`) sorted by `rank`. It groups entries by `segmentId`
in JavaScript. Never run one query per segment, and never copy a segment's rank
onto entries, since `move_segment` would then rewrite every entry.

### Limits enforced locally

Local playlists follow the contract's limits so that copying to an account never
fails validation: names are 1–100 characters after trimming and NFC
normalization; an empty description is stored as `null`; at most 5,000 entries
per playlist. A new playlist defaults to the name of the show it was created
from, or "New playlist".

## One operation engine

All edits go through a pure function, `applyPlaylistOperation(state, operation)`,
in `relisten/playlists/playlist_operations.ts`. It implements the contract's seven
operation types and placement rules exactly:

- Anchors that are tombstoned or in another parent count as absent, and an
  inverted pair keeps only `after`, so placement never fails.
- Emptying a segment removes it after anchors are resolved.
- New ranks come from `generateKeyBetween`.

It returns the set of rows it changed. Callers write only those rows, so one edit
touches a handful of rows even in a 5,000-entry playlist.

The same function serves three callers, so local and synced playlists behave
identically:

1. **Local playlists:** apply and write the changed rows.
2. **Account playlists, on a user edit:** apply to displayed state, write the
   changed rows, and append the operation to the outbox, in one Realm write. No
   rebuild.
3. **Account playlists, after a pull or recovery:** rebuild displayed state by
   resetting it to canonical and replaying every operation still in the overlay,
   in order. The rebuild computes in memory, then writes only fields whose value
   changed.

Locally generated ranks are display-only for account playlists; the server's
ranks arrive through changes.

## Screens and entry points

Routes keep the July layout under `app/relisten/tabs/(myLibrary)/playlists`:
list, `archived` (milestone 2), `new`, `[playlistId]` and `[playlistId]/edit`.

**Adding to a playlist**

- From a track menu: add the track as a new one-track group at the end.
- From a source screen: **Add to playlist** adds that source's tracks as one
  group, in source order. Long-pressing tracks first narrows it to the selected
  ones. A show with several sources uses the source being viewed.
- The picker lists writable playlists and offers **New playlist**.

**Detail**

- Name, description, track count, estimated duration, Play, Shuffle, Download
  and Edit.
- Groups render as blocks. A block from one recording is headed by its artist,
  date and venue. A mixed block shows each track's own show line.
- Unavailable tracks are dimmed and skipped by playback, but never removed.
- Account playlists show **Waiting to sync** while operations are pending, plus
  the quota, archived or support notices described under Account sync.

**Editor gestures and the operations they send**

| Gesture | Operation |
| --- | --- |
| Rename or edit description | `update_metadata` |
| Drag a track within its group | `move_entry` to the same segment |
| Drag a track into another group | `move_entry` to that segment |
| Drag a track into the gap between groups | `move_entry` with `new_segment_id` |
| Drag a group | `move_segment` |
| Remove a track | `delete_entry` (removing a group's last track removes the group) |
| Remove a group | `delete_segment` |
| Add tracks into an existing group | `insert_entries` |

Splitting a group in place is not supported in v1 (the contract has no
`split_segment`): a track dragged out lands between whole groups. Merging two
groups is done by dragging tracks.

**Deleting and archiving**

- Account playlists: **Archive playlist** and **Unarchive**. No delete.
- Local playlists: **Delete playlist**, with confirmation.

## Catalog hydration and availability

- "Missing" means Realm lacks the track or any of its source, show or artist,
  because the queue's `fromSourceTrack` reads all of them.
- When a playlist screen opens, resolve missing tracks in chunks of 500, following
  `favorite_metadata_hydrator.ts`. Upsert returned entities. Never delete cached
  catalog data or entries because of an omission. Cached tracks are not re-checked.
- Entries that cannot be hydrated yet render as placeholders ("Track unavailable
  offline") and are skipped by playback.
- Availability is stored on the playlist side, not on `SourceTrack`, whose
  `deletedAt` belongs to catalog sync: a small `PlaylistTrackAvailability` record
  keyed by `trackId` with `status` and `checkedAt`, added in schema 24.
- Resolver statuses: `available` clears any record; `unavailable` and `retired`
  mark the track unavailable; `redirected` upserts the target track, and playback
  uses the target while the entry keeps its original `trackId`.

## Playback

Extend the existing queue; do not replace it.

**Context on queue occurrences**

- `PlayerQueueTrack` gains optional `playlistId`, `segmentInstanceId` and
  `entryId`. `newOccurrence()` copies them, so **Play next** and **Add to end**
  keep grouping. Callers that enqueue a playlist create one new
  `segmentInstanceId` per segment per enqueue call.
- `writePlayerState`, `loadSavedQueueTracks` and the queue-changed comparison in
  `PlayerState.upsert` save and restore the new fields.
- Queueing the same playlist twice creates new occurrences and new segment
  instances, never merged ones. Playlist edits never rewrite an active queue.

**Group shuffle**

Occurrences without a `segmentInstanceId` (ordinary show or track enqueues)
shuffle individually, exactly as today. Occurrences sharing one move as a block
and keep their internal order. `PlayerShuffleOrder.entryIds` still stores the
flat result, so restore is unchanged. Rules, each with a test:

- `reshuffleTracks` keeps the current track first, followed by the rest of its
  group in order. Earlier tracks of that group become their own block.
- **Shuffle** on the playlist detail screen enqueues the playlist, picks a random
  group, and starts at its first track.
- **Play next** while shuffled inserts after the current group, not inside it.
- Dragging a track out of its group in the queue while shuffled is allowed. That
  occurrence keeps its `segmentInstanceId`, and the next reshuffle regroups by
  original order.

**Playback failure**

Today `onNativePlayerError` in `relisten/player/relisten_player.tsx` logs and shows
a toast. For a streamed occurrence with playlist context:

- re-resolve its track once;
- if the result is `unavailable` or `retired`, record it unavailable and skip to
  the next queue occurrence;
- skip at most 3 tracks in a row this way, then stop and show the error, so an
  offline device cannot race through the queue;
- never re-resolve a downloaded track.

**Download**

A playlist's Download queues each live entry's track through the existing offline
system. Downloads stay device-global and survive sign-out.

## Account sync (milestone 2)

Follow the contract's Client model section. Mobile specifics:

**Scope safety**

Every sync write captures the account scope before the request and checks it with
`isCaptureCurrent` before writing, as favorites do. A response that finishes after
an account switch writes nothing.

**Creating**

- A playlist created in the account scope writes a `PlaylistCommand` (create) with
  its full initial structure. Edits made before acknowledgement are queued as
  operations with `base_revision: 0` and held behind the command.
- After the create is acknowledged, fetch the snapshot to establish the canonical
  base and the server's ranks, then rebuild displayed state and release the held
  operations.

**Sending**

- Debounce sends for 2 seconds after the last edit. Flush when the editor closes,
  the app backgrounds, or connectivity returns.
- Before sending, compact **truly unsent** operations only (pending, zero
  attempts). An operation **references** an item when it names it as target,
  destination parent or anchor.
  - Two moves of the same item merge into the later one only if no operation
    between them references that item.
  - An insert followed by a delete of the same unsent item drops both, but only if
    no other operation references that item.
  - Consecutive `update_metadata` operations merge.
  - Property tests check that replaying the compacted outbox gives the same state
    as replaying the original.
- Batches are capped at 500 operations and 1.5 MiB of payload. A `413` splits the
  batch and retries, except while `quota_paused`, when the outbox must travel whole.

**Pulling**

- The library feed is an additive extension of the existing favorites feed.
  `favorite_sync_contract.ts` parses the `playlists` snapshot array and
  `playlist_summary` changes, and ignores unknown `change_type` values instead of
  throwing. Playlist summaries route to the playlist sync coordinator.
- Pull a playlist when its summary revision is ahead of `appliedRevision`; fetch an
  unknown playlist by snapshot.
- Apply each changes page in one Realm write, then rebuild displayed state.

**Recovery**

- A `history_generation` mismatch on any playlist or library response, or a
  `410 snapshot_required`, runs restore recovery exactly as the contract lists it:
  resubmit held operations with their original IDs (creates first), fetch
  snapshots, then prune within the new generation. A library-feed mismatch also
  triggers it for every account playlist.
- `parent_missing` and `id_conflict`: mark the operation `needs_attention`, keep
  any track IDs it was adding in `failedTrackIds`, and show "2 tracks couldn't be
  added to Cornell + friends". **Add again** sends one `insert_segment` at the end
  of the playlist with fresh IDs; **Dismiss** drops it.
- `409 playlist_archived`: move the outbox to `archived_hold` and stop resending.
  The detail view says the playlist was archived on another device and offers
  **Unarchive** or **Discard changes**. Unarchiving resumes sending.

**Quota**

- After `422 quota_exceeded`, mark the outbox `quota_paused` and stop resending it
  unchanged. Resend the whole outbox in order when the user adds another edit, or
  when a deletion in another account playlist syncs.
- If the paused outbox exceeds one batch, keep every edit, show an alert asking
  the user to contact team@relisten.net, and record a diagnostic event.

**Account switching**

Switching or signing out follows the existing transition: stop playback, clear
queues, change scope. Account playlists stay in Realm under their scope and
reappear when that account signs in again.

## Save to my account (milestone 3)

**Records**

- `PlaylistCopyJob`: one per user action, with `destinationScopeId`, the ordered
  list of source playlist IDs, and `state` (`running`, `stopped_quota`, `done`).
- `PlaylistCopyReceipt`: one per source playlist, with `sourcePlaylistId`,
  `destinationPlaylistId`, `commandId`, `sourceFingerprint` and `state`
  (`queued`, `sent`, `copied`, `failed_quota`).

**Flow**

- **Save to my account** (one playlist) and **Add local playlists to this
  account** (all uncopied) both create one job. In a single Realm transaction they
  write the job, every receipt, and every create command with fresh playlist,
  segment and entry IDs, as `importToActiveAccount` does for favorites. A kill at
  any point leaves complete records; the coordinator resumes any `running` job at
  startup.
- The account copy appears in **Mine** immediately, shown as **Saving…** until its
  create is acknowledged. Retries resend the identical command, so a copy is never
  duplicated.
- The local original is never moved, renamed or deleted.
- If a create fails with `quota_exceeded`, that receipt becomes `failed_quota`,
  its pending account row is removed, the job stops as `stopped_quota`, and the
  remaining receipts stay `queued`. The list shows the limit; retrying the job
  resumes from the first unfinished receipt.
- **Uncopied** means no `copied` receipt for this account. A playlist edited
  after its copy shows **Save changes as a new copy** on its detail screen, but
  bulk copy skips it.

## Platform surfaces

- **CarPlay** (`relisten/carplay/library.ts`) and **Android Auto**
  (`RelistenMediaLibrary.kt`): a read-only **Playlists** list that plays a
  playlist, in milestone 1. Editing stays on the phone.
- **Cast:** playlist playback uses the existing queue, so Cast needs no new work;
  verify it once in milestone 1.
- **Offline library, search and analytics:** milestone 1 adds a "downloaded only"
  filter to playlist detail, and analytics events for create, add, play and
  shuffle. Search over playlist names is deferred.

## Verification

Follow `AGENTS.md`: run affected Vitest files, `yarn ts:check` and `yarn lint`.

- **Operation engine:** every contract operation and placement rule, duplicates,
  emptying segments, and moving into a new segment next to the emptied one. A
  timing test rebuilds a 5,000-entry playlist and checks it writes only changed
  fields.
- **Realm:** rank sort matches byte order (regression test for the 2026-11-16
  check). Migrations 23 → 24 → 25 on new fixtures (only `schema_16.json` exists
  today), including a persisted queue. Scope isolation between anonymous and
  account rows.
- **Player:** each group-shuffle rule above; enqueue the same playlist twice and
  remove one duplicate; **Play next** keeps grouping; restart restores the exact
  queue occurrence and checkpoint; later playlist edits leave the queue unchanged;
  downloaded playlist tracks play offline; the 3-skip limit.
- **Sync (milestone 2), against a fake server:**
  - receipt 43 arriving before delta 42 still pulls after 41
  - a lost create response retries before its children, and edits made before
    acknowledgement apply afterward
  - a restore that reuses revision numbers forces snapshot replacement
  - a quota-failed insert into a single-entry segment applies when resent with
    the deletion of that entry
  - compaction never touches an operation that has started a request, and
    preserves replay results
  - a response arriving after an account switch writes nothing
- **Copy (milestone 3):** a kill mid-job resumes without duplicates; quota failure
  stops the job and leaves later playlists queued; local originals stay intact.
- **Manual simulator checklist:**
  - Milestone 1: create from a show, add tracks from another show into the same
    group, drag a track out, kill and relaunch, then play with shuffle in airplane
    mode, including over Cast once.
  - Milestone 2: edit on two simulators, one offline, then reconnect.

## Decisions (Alec, 2026-11-16)

1. **Local playlists belong to the device**, like downloads. They stay visible
   signed out and when signed in to any account. Favorites differ: anonymous
   favorites are offered for import rather than shown alongside account favorites.
2. **New playlists go to the account once milestone 2 ships.** **On this device**
   keeps only playlists created while signed out or before milestone 2.
3. **Local playlists can be deleted**, with confirmation. Account playlists stay
   archive-only. Deleting a copied local playlist does not affect the account copy.
4. **CarPlay and Android Auto get a read-only Playlists list in milestone 1** that
   plays a playlist. Editing stays on the phone.
5. **Save queue as playlist is deferred** past milestone 1.

## Progress

- [x] (2026-11-16) Branch created; scope, favorites, Realm and queue code
  surveyed; plan drafted and revised after a fresh-reader review.
- [x] (2026-11-16) Alec accepted all five open decisions.
- [ ] Milestone 1: local playlists.
- [ ] Milestone 2: account playlists (after the User Service delivery 1).
- [ ] Milestone 3: Save to my account.
