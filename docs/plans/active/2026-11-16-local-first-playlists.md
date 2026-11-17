# Local-first playlists

Status: approved 2026-11-16; revised 2026-11-17 to one list of playlists with
optional owners. Milestone 1 not started. Branch `codex/v4-playlists-mobile`, cut
from `codex/v4-mobile-pilot` at `535ec16` (Realm schema 23).

## Purpose and current decisions

A listener can make playlists without an account. They work fully offline:
create, edit, reorder, play, shuffle by group and download. Relisten is an
anonymous, offline-first app, so **playlists without an account are the primary
v1 feature and account sync is a layer on top** (Alec, 2026-11-16).

Many listeners are in their 50s and 60s, so the app never asks them to understand
"local" versus "synced" (Alec, 2026-11-17). There is **one list of playlists on
the device**. Signing in quietly saves them to the account; signing out changes
nothing visible.

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
rows, no resolver hydration, and separate "Mine" and "On this device" lists with
an explicit copy step. All of that is now replaced. Their route list carries
forward below.

Settled decisions this plan builds on:

- A playlist is an ordered list of segments, and each segment is an ordered list
  of entries. A lone track is a one-track segment. Segments may mix recordings.
- An entry references a catalog track by typed `track_` ID only. Catalog data
  comes from Realm; missing tracks are hydrated through
  `POST /api/v4/catalog/resolve`. Mobile never re-checks cached tracks; it
  re-resolves a track when its playback fails.
- Playlists saved to an account are archive-only on the server in v1.
- Segment shuffle ships. Track-level shuffle that ignores segments is deferred.
- Realm `sorted()` on a rank property matches byte order (verified 2026-11-16 on
  Realm 20.2.0), so queries may sort by rank directly.

### Terms

| Term | Meaning |
| --- | --- |
| Playlist, segment, entry | Contract terms. The UI says "playlist", "group" and "track". |
| Owner | The account a playlist is saved to, or none. Never shown as a concept in the UI. |
| Rank | Opaque ordering string for a segment among segments, or an entry within its segment. Never shown. |
| Queue occurrence | One `PlayerQueueTrack` in the player queue. Every enqueue makes new ones. |
| Segment instance | One enqueue of one segment. Its queue occurrences share a `segmentInstanceId`. |

## Milestones

Each milestone is releasable on its own.

1. **Playlists on the device.** Create, edit, play, group shuffle, download,
   restart and restore, with no server. Every playlist has no owner. No server
   work is required.
2. **Saving to an account.** Signing in gives every unowned playlist an owner and
   syncs it to `accounts.relisten.net/v1`: outbox, sync coordinator, library feed
   summaries, history-generation recovery and quota handling. A new device
   downloads the account's playlists. This needs the User Service's delivery-1
   implementation, which has not started.

Milestone 1's end-to-end proof: create a playlist from a show, edit it offline,
restart the app, and play it with group shuffle. Milestone 2 extends that proof
with signing in and syncing to a second device.

## Owners and visibility

Each `Playlist` has an optional `ownerUserId` (milestone 2). Segments and entries
have no owner of their own; they follow their playlist.

**Who sees what.** The app has a *visible owner*: the signed-in account, or, while
signed out, the account most recently signed in on this device
(`PlaylistDeviceState.lastSignedInUserId`). The list shows playlists with no
owner plus playlists owned by the visible owner. Another account's playlists stay
on the device but are hidden until that account signs in again (Alec, 2026-11-17).

| Event | What happens |
| --- | --- |
| Signed out, never signed in | All playlists are unowned and visible. |
| Sign in as A | Every visible unowned playlist gets owner A, and a create command for each is written in the same Realm transaction. A one-time notice says "Your playlists are now saved to your account." A's playlists from the server download alongside them. |
| Sign out of A | Nothing visible changes. A's playlists stay listed and editable. Edits queue in A's outbox and send when A signs in again. |
| Create a playlist while signed out after A | Owner A, so it behaves like the rest of the visible list. |
| Sign in as B after A | A's playlists are hidden. Any unowned playlists get owner B. B's playlists download. Playback stops and the queue clears, as on any account switch today. |
| Sign back in as A | A's playlists reappear and their queued edits send. |

The list is always titled **Playlists**. There is no "On this device" or "Mine"
section. Signed-out playlists are lost if the app is deleted before ever signing
in; the list shows a one-line note offering sign-in to keep playlists safe.

## Existing code to reuse

Favorites already solved most of the account and outbox problems. Follow their
patterns rather than inventing parallel ones.

| Need | Existing pattern |
| --- | --- |
| Acknowledged vs. displayed state on one row | `UserFavorite.acknowledgedPresent` / `effectivePresent` |
| Durable outbox with states and attempts | `FavoriteMutation` |
| When an unsent edit may be replaced | `isTrulyUnsentFavoriteMutation` in `relisten/library/favorite_mutation_compaction.ts` |
| Reject writes from a stale account session | `captureScope` / `isCaptureCurrent` in `relisten/library/favorite_repository.ts` |
| Write many account records in one transaction | `importToActiveAccount` in `relisten/library/anonymous_library_import.ts` |
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

### Schemas 24 and 25 (milestone 1)

`Playlist`

- `playlistId` (primary key, `playlist_` UUIDv7).
- `name`, `description?`, `createdAt`, `updatedAt`.
- `deletedAt?` (indexed): set when an unowned playlist is deleted; it shows in
  Recently deleted and is purged after 30 days.

`PlaylistSegment`

- `segmentId` (primary key), `playlistId` (indexed), `rank`.

`PlaylistEntry`

- `entryId` (primary key), `playlistId` (indexed), `segmentId`, `trackId`
  (indexed `track_` ID), `rank`.

`PlaylistTrackAvailability`

- `trackId` (primary key), `status` (`unavailable`), `checkedAt`.

`PlayerQueueEntry` gains optional `playlistId`, `segmentInstanceId` and
`entryId`. The migration leaves them empty on existing entries.

Deleting a group or track in an unowned playlist removes its rows outright;
nothing else holds their IDs. Deleting a whole unowned playlist sets `deletedAt`
instead, and the startup purge removes it and its rows after 30 days.

### Schema 26 (milestone 2)

- `Playlist` gains:
  - `ownerUserId?` (indexed); empty means unowned
  - `archived` (default false)
  - `serverState?`: `creating`, `synced` or `needs_attention`
  - `appliedRevision?`, `historyGeneration?`, `summaryRevision?`
  - a canonical metadata base: `canonicalName?`, `canonicalDescription?`
- `PlaylistSegment` gains `live` (default true, indexed), `canonicalRank?` and
  `canonicalLive` (default false).
- `PlaylistEntry` gains `live` (default true, indexed), `canonicalSegmentId?`,
  `canonicalRank?` and `canonicalLive` (default false).
- `PlaylistOperation`: `operationId`, `playlistId`, `ownerUserId` (indexed),
  `localSequence`, `operationType`, `payloadJson` (frozen exact contract
  payload), `baseRevision`, `state`, `attemptCount`, `nextAttemptAt?`,
  `lastErrorCode?`, `resultStatus?`, `resultRevision?`, `resultGeneration?`, and
  `failedTrackIds` (for retrying additions that did not land).
- `PlaylistCommand`: persisted create and archive commands with `commandId`,
  `kind`, `playlistId`, `ownerUserId`, `payloadJson`, `state`, attempts and
  result.
- `PlaylistDeviceState`: a single row holding `lastSignedInUserId?`.
- `FavoriteSyncState` gains `historyGeneration`, stored with the library cursor.

For owned playlists, displayed fields are the canonical base plus the pending
overlay. A deleted item stays as a non-live row until the server confirms the
delete. Unowned playlists use the displayed fields alone; their `live` is always
true and their canonical fields stay empty.

Operation states:

| State | Meaning |
| --- | --- |
| `pending` | Not yet sent, or waiting to retry after a transport failure. |
| `in_flight` | Included in a request that has not returned. |
| `acknowledged` | Result received; stays in the overlay until a pull in the same generation reaches its result revision. |
| `quota_paused` | Whole outbox paused after `quota_exceeded`. |
| `archived_hold` | Held because the playlist is archived. |
| `needs_attention` | Rejected, or a create failed terminally; shown to the user. |

### Queries

A playlist screen runs two live queries: its segments sorted by `rank`, and all
its entries (by `playlistId`) sorted by `rank`, both filtered to `live == true`.
It groups entries by `segmentId` in JavaScript. Never run one query per segment,
and never copy a segment's rank onto entries, since `move_segment` would then
rewrite every entry. The playlist list filters by the visibility rule above.

### Limits enforced locally

Unowned playlists follow the contract's limits so that saving them to an account
never fails validation: names are 1–100 characters after trimming and NFC
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
touches a handful of rows even in a 5,000-entry playlist. Every edit also sets
the playlist's `updatedAt`.

Which caller runs depends on whether the playlist has an owner, not on whether
anyone is signed in:

1. **Unowned playlists:** apply and write the changed rows.
2. **Owned playlists, on a user edit:** apply to displayed state, write the
   changed rows, and append the operation to the owner's outbox, in one Realm
   write. This works the same signed in or out. No rebuild.
3. **Owned playlists, after a pull or recovery:** rebuild displayed state by
   resetting it to canonical (metadata, segments and entries) and replaying every
   operation still in the overlay, in order. The rebuild computes in memory, then
   writes only fields whose value changed.

Locally generated ranks are display-only for owned playlists; the server's ranks
arrive through changes.

## Experience design

Revised 2026-11-17 after a fresh UX/UI review.

### Who this is for

Two kinds of listeners use the same screens, and the design serves both:

- **Most listeners**, many in their 50s and 60s, want to save the songs and
  shows they love and press play. They read every word, avoid gestures they
  can't see, worry about breaking things, and never think about accounts,
  syncing or data models.
- **Power users** build long, carefully ordered playlists and reorder them
  often. For them dragging is the primary tool, and it has to be fast and
  precise for single tracks and whole groups alike.

Principles that follow from that:

1. **A playlist looks like a list of songs.** A track on its own is a plain row.
   Only tracks that are kept together get a visible group, so most playlists
   look exactly like what people expect.
2. **Nothing technical is ever shown.** The UI says "playlist", "group", "kept
   together" and "track". It never says segment, entry, rank, sync, local,
   scope, owner or account playlist.
3. **Every action is visible.** Every row and group header has a ••• button.
   Every drag has a menu equivalent. Nothing is gesture-only.
4. **Undo instead of "are you sure?"** Every edit shows a toast with Undo. Only
   deleting a whole playlist asks for confirmation, and even that can be
   restored.
5. **Offline is normal.** Nothing warns about being offline unless an action
   actually needs the internet, and Play works offline with whatever is
   downloaded.
6. **Match the app.** Use the existing Title Case vocabulary ("My Library",
   "Play Next", "Add to End of Queue"), the existing native menus
   (`relisten/components/menus/native_menu_view.tsx`,
   `overflow_menu_trigger.tsx`), the confirmation dialogs
   (`confirm_destructive_action.ts`), dates as YYYY-MM-DD, and the existing row
   style. No artwork.

### Routes

Under `app/relisten/tabs/(myLibrary)/playlists`: the list, `new`,
`[playlistId]` (detail and edit mode are one screen) and `recently-deleted`.

### Where playlists live

My Library (`MyLibraryTabRootPage.tsx`) gains **My Playlists ›** near the top,
after My Listening History and before the venues and shows sections. It lists
the three most recently edited playlists, with **New** at the right of the
header. The header opens the full list.

With no playlists, the section shows "Playlists keep songs in the order you
choose." and **New Playlist**. That line also tells playlists apart from the
heart, which adds to My Library.

### Playlists list

- Titled **Playlists**, with **New Playlist** in the header.
- Each row has three lines and no artwork:
  - the name
  - "38 tracks · 6 hr 4 min"
  - the artists in it: "Widespread Panic, Phish, and 3 more"
- A check icon at the end of the row when every track is downloaded.
- Sorted by most recently edited.
- **Recently Deleted** at the bottom with a count, shown only when something is
  in it.
- Never signed in: a card at the bottom reads "Sign in to keep your playlists
  safe and use them on your other devices." with **Sign In**.
- First load shows skeleton rows.
- Empty state: "Make your first playlist", "Playlists keep songs in the order
  you choose. Tap ••• on any song or show and choose Add to Playlist.", and **New
  Playlist**.
- Duplicate names are allowed. The track count and artist line tell them apart.

### Adding music

- **A track's ••• menu:** **Add to Playlist…** adds that track on its own.
- **A source screen's ••• menu:** **Add Show to Playlist…** adds every track of
  the source being viewed, in order, as one group.
- **Some tracks from a show:** the source screen's ••• menu offers **Select
  Tracks**. Checkboxes appear on every row, and a bottom bar reads "Add 3 Tracks
  to Playlist…". The selection is added as one group.
- **The add sheet** is titled "Add 3 tracks to". When adding more than one track
  it explains "They'll stay together as a group." It lists **New Playlist**
  first, then playlists by most recently edited, each with its track count and
  artist line. A playlist that already has every one of these tracks says
  "Already added" but can still be chosen: duplicates are allowed.
- **After adding:** a toast reads "Added 3 tracks to Cornell + friends" with
  **Undo** and **Open**.
- **Saving a segue one song at a time:** if the added track comes right after
  the playlist's last track in the same source (Fire on the Mountain after
  Scarlet Begonias), the toast offers **Keep with Scarlet Begonias** in place of
  Open. Tapping it groups the two. That covers the common case without Select
  Tracks.

### Creating and renaming

- **New Playlist**, from anywhere, opens a small sheet with one field, the name,
  pre-filled with the show it came from ("Grateful Dead 1977-05-08"), or empty
  with the placeholder "Road trip jams". **Create** is the only button. When
  started from the add sheet, the tracks are added in the same step.
- **Rename…** and **Edit Description…** are in the detail screen's ••• menu, so
  nobody has to discover edit mode to fix a name.

### Playlist detail

**Header**

- The name, an optional description, then "6 tracks · 1 hr 21 min", plus
  "· Downloaded" or "· Downloading 4 of 6".
- **Play** (filled accent) and **Shuffle** (outlined, secondary), side by side.
- An **Edit** text button and a ••• menu: **Rename…**, **Edit Description…**,
  **Download**, **Show Downloaded Only**, **Delete Playlist…**.

**Rows**

- Title, then "Artist · YYYY-MM-DD · Venue", with the duration on the right and
  a 44 pt ••• button. The venue truncates first, never the date.
- The playing track shows an accent title and the equalizer icon. Its group's
  card gets an accent outline while any of its tracks plays.
- A downloaded track shows the download icon; a downloading one shows progress.

**Groups**

- A one-track group is a plain row with no card.
- A multi-track group is a card joined by a thin rail down its left edge, the
  visual equivalent of "Scarlet > Fire". Its header is plain secondary text, not
  accent, so it doesn't look like a link:
  - one source: "Grateful Dead · 1977-05-08 · Barton Hall"; its rows show
    titles only
  - mixed sources: "Kept together · 2 tracks"; each row shows its own show line
- The header ends in a ≡ handle (edit mode) or a ••• button (otherwise).
  Tapping the header opens the group menu, which includes **Go to Show** when
  the group has one source.

**Tracks that can't play**

- A track whose details haven't loaded yet shows "Needs internet to load",
  muted, and is skipped while offline.
- Only when the catalog says a recording is gone does the row show "No longer
  available", with an icon and label rather than dimming. Tapping it offers
  **Remove from Playlist** and **Go to Show**.
- No duration placeholder is shown for either.

**Interaction**

- Tapping a row plays the playlist from that track. The ••• button or a
  long-press opens the row menu. The detail screen never starts a drag; dragging
  lives in edit mode, so a resting thumb can't rearrange a playlist.
- **Shuffle, the first time:** a dismissible inline card under the buttons reads
  "Shuffle keeps groups together, so Scarlet Begonias still flows into Fire on
  the Mountain.", using the first group in that playlist.
- Long playlists show a **Now Playing** pill that jumps to the current track
  when it's off screen.

**Other states**

- **Empty playlist:** "This playlist is empty. Add songs from any show's •••
  menu."
- **Every track unavailable:** Play and Shuffle are disabled, with one line
  explaining "None of these recordings are available right now."
- **Offline with some tracks downloaded:** Play and Shuffle use only downloaded
  tracks, and a quiet line reads "Playing 12 downloaded tracks. The rest need
  internet."

### Editing

**Edit** switches the same screen into edit mode:

- The name and description become text fields at the top.
- Every track row gets a red ⊖ on the left (remove, with Undo) and a ≡ drag
  handle on the right. Group headers get the same ≡ on the right. Every handle
  is the same size and position, so "grab the right edge" always works.
- ⊖ sits clear of the row text with a full 44 pt target. The iOS back-swipe is
  disabled in edit mode so a left-edge tap can't leave the screen.
- Tapping a row opens its row menu.
- **Done** in the top right leaves edit mode. Edits save as they happen; there
  is no Cancel, because Undo covers mistakes.

### Dragging

The ≡ handle starts a drag immediately, with no long-press delay. Handles have a
44 × 44 pt touch target. Toasts hide while a drag is in progress.

**Dragging a track**

- The row lifts (slight scale, accent border, a haptic tap) and the list opens a
  gap where it would land, with a dashed outline.
- **Inside a group:** dropping between two of its tracks keeps it in that group.
- **At a group's edges** the list opens two separate targets, each a full row
  tall, never a hairline. At the top they are "Start of this group" inside the
  card and "Not in a group" above it; at the bottom, "End of this group" and "Not
  in a group" below it. Crossing between them gives a light haptic tick. Labels
  use full-strength accent text.
- **Joining two single tracks:** once the dragged row overlaps at least 60% of a
  single track's middle, that track shows a growing outline. After 0.7 seconds
  it arms, with a distinct haptic and the label "Release to keep these
  together". Releasing then makes a group of the two, with the dragged track
  second. The timer pauses while the list is auto-scrolling. Hovering over a
  group's middle does nothing.
- Dropping back where it started, or dragging off the list, cancels with no
  edit.

**Dragging a group**

- Grabbing a group's ≡ collapses the other groups to a single line each, such
  as "Grateful Dead · 1977-05-08 · Barton Hall" over "Scarlet Begonias, Fire on
  the Mountain · 2 tracks". The collapse animates around the dragged group,
  which stays pinned under the finger, so the list doesn't jump.
- Groups drop only between groups or single tracks, never inside another group.
- On drop, groups expand in place and the list scrolls so the moved group is
  visible.

**Both**

- Auto-scroll near the top and bottom edges speeds up smoothly the closer the
  finger, up to a cap that keeps it precise.
- Reduce Motion replaces the lift and collapse animations with outlines.

**What each drop sends**

| Drop | Operation |
| --- | --- |
| Track within its group or into another group | `move_entry` to that segment |
| Track "Not in a group" | `move_entry` with `new_segment_id`; but if the track was already alone in its group, `move_segment`, which keeps its group ID |
| Track joined onto a single track | `move_entry` into that single track's segment, after it |
| Group | `move_segment` |

### Row menus

Row and group menus use the app's native menu (`native_menu_view.tsx`), as the
existing track menus do. Items are in sections, Title Case, with a menu title
saying where the track is ("In a group with Scarlet Begonias").

**Track menu**

- **Play Next**, **Add to End of Queue**
- **Move Up**, **Move Down**: one step within its group. On a group's first or
  last track the item is disabled with the subtitle "First in group" or "Last in
  group". A track on its own steps past its neighbor, hopping over a whole group.
- **Move to Top**, **Move to Bottom**: as a track not in a group.
- **Take Out of Group** (in a group), subtitle "Goes right after the group".
- **Keep with Fire on the Mountain** (on its own, below a track or group): joins
  that track's group at its end. The item names the actual track above.
- **Go to Show**
- Separator, then **Remove from Playlist** (destructive style).

**Group menu** (from the header's ••• or a tap on the header)

- **Play Group**
- **Move Up**, **Move Down**, **Move to Top**, **Move to Bottom**
- **Ungroup**: each track goes on its own, in the same order.
- **Go to Show** (one source only)
- Separator, then **Remove Group** (destructive style), with Undo.

### Undo

- Every edit, whether from a drag, a menu, ⊖ or the add sheet, shows a toast:
  "Moved Morning Dew", "Removed Eyes of the World", "Added 3 tracks to Cornell +
  friends". When a removal leaves one track in a group, the toast says so:
  "Removed Fire on the Mountain. Scarlet Begonias is now on its own."
- The toast docks directly above the floating mini player and tab bar, never
  over them. The Select Tracks bar follows the same rule.
- It stays for 10 seconds, and longer while a finger is down on it or VoiceOver
  is focused on it.
- Undo applies the inverse edit. A removal is undone by re-inserting the same
  tracks at the same place with new IDs, since a deleted ID can't come back.
  Moves are undone by moving back. For owned playlists the inverse goes through
  the outbox like any edit.
- Undo keeps the last 5 edits in the current visit to a playlist; the toast
  shows the most recent. After undoing one, the next toast offers the one
  before it.

### Deleting a playlist

- **Delete Playlist…** asks, in the app's confirmation dialog, "Delete Cornell
  + friends?" with "You can restore it from Recently Deleted for 30 days." and
  **Delete** and **Cancel**. The wording is the same for every playlist.
- **Unowned:** marks it deleted on the device (`deletedAt`); it's purged after
  30 days.
- **Owned:** sends the online-only archive command (decision 6). The server
  keeps archived playlists, so they're never purged; the "30 days" promise is
  simply always kept. Offline, the dialog is replaced by "Connect to the internet
  to delete this playlist." Signed out, by "Sign in to delete this playlist.
  It's saved to your account."
- **Recently Deleted** lists deleted playlists with "Deleted 3 days ago" and
  **Restore**.

### What people see about accounts

| Moment | Message |
| --- | --- |
| Never signed in | List card: "Sign in to keep your playlists safe and use them on your other devices." |
| First sign-in with playlists | One-time banner on the list: "Your playlists are now saved to your account." |
| Edits waiting more than a minute while online | Detail, small text under the header: "Still saving your changes…" |
| Offline | Nothing. Everything keeps working. |
| Account full | Detail: "Saved on this phone only. Your account is full. Questions? team@relisten.net" |
| Tracks didn't land | Detail: "2 tracks couldn't be added because this playlist changed on another device." **Add Again**, **Dismiss** |
| Deleted on another device | Detail: "This playlist was deleted on another device." **Restore**, **Discard My Changes** |
| Outbox too large while paused | Alert: "We couldn't save your recent changes. Please email team@relisten.net so we can help." |

### Accessibility

- **Text size:** every playlist screen supports Dynamic Type up to the largest
  accessibility sizes. Rows wrap instead of truncating, and the duration moves
  under the title at large sizes.
- **Touch targets:** at least 44 × 44 pt for ⊖, ≡ and •••.
- **VoiceOver:**
  - Rows read naturally, for example "Fire on the Mountain, Grateful Dead,
    1977-05-08, Barton Hall, in a group with Scarlet Begonias, 13 minutes 44
    seconds".
  - Every row exposes its menu's moves as custom actions, so nobody needs to
    drag.
  - Drags announce their target ("End of this group", "Not in a group").
- **Contrast:** all text, including drop-target labels and unavailable rows,
  meets 4.5:1. Unavailable rows use an icon and label, not opacity.
- **No hidden gestures:** everything reachable by long-press is also behind a
  visible ••• button.

### Mockups

Eight phone mockups were reviewed with Alec on 2026-11-17 and revised after the
UX/UI review. They live beside this plan in
`2026-11-16-local-first-playlists-mockups.html` (open it in a browser):

1. My Library section
2. Playlists list
3. Detail with groups and now playing
4. Add sheet and toast
5. Dragging a track at a group's edge
6. Joining two single tracks
7. Dragging a group
8. The native row menu with Undo

They use the app's existing palette (`relisten-blue` 900/950 backgrounds,
`#009DC1` accent) and row style. Implementation should match them, not
introduce a new visual language.

## Catalog hydration and availability

- "Missing" means Realm lacks the track or any of its source, show or artist,
  because the queue's `fromSourceTrack` reads all of them.
- When a playlist screen opens, resolve missing tracks in chunks of 500, following
  `favorite_metadata_hydrator.ts`. Upsert returned entities. Never delete cached
  catalog data or entries because of an omission. Cached tracks are not re-checked.
- Entries that cannot be hydrated yet show "Needs internet to load" and are
  skipped while offline. Only a resolver status of `unavailable` or `retired`
  shows "No longer available" (see Experience design).
- Availability lives in `PlaylistTrackAvailability`, not on `SourceTrack`, whose
  `deletedAt` belongs to catalog sync.
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

- re-resolve its track once, remembering which queue occurrence failed;
- if the result is `unavailable` or `retired`, record it unavailable and skip to
  the next queue occurrence;
- skip at most 3 tracks in a row this way, then stop and show the error, so an
  offline device cannot race through the queue;
- never re-resolve a downloaded track;
- when a resolve result arrives late, always record availability, but skip only
  if the failed occurrence is still the current one. If the user has moved on to
  another track, playback is left alone.

**Offline**

Offline, Play and Shuffle on a playlist enqueue only its downloaded tracks, so
the 3-skip limit is never reached for tracks that simply need the internet.

**Download**

A playlist's Download queues each live entry's track through the existing offline
system. Downloads stay device-global and survive sign-out.

## Account sync (milestone 2)

Follow the contract's Client model section. Mobile specifics:

**Session safety**

The sync coordinator only sends an owner's outbox while that owner is the
signed-in account. Every sync write captures the session before the request and
checks it with `isCaptureCurrent` before writing, as favorites do. A response that
finishes after an account switch writes nothing.

**Saving playlists on sign-in**

- On sign-in as A, in one Realm transaction: set `ownerUserId = A` on every
  visible unowned playlist, write a create command for each with its current
  structure and existing IDs, and record A as `lastSignedInUserId`. No new IDs are
  minted and nothing is copied, so a retry can never make a duplicate.
- A playlist created while A is the visible owner (signed in or out) gets owner A
  and a create command at once.
- Edits made before a create is acknowledged queue as operations with
  `base_revision: 0`, held behind the command.
- After a create is acknowledged, fetch the snapshot to establish the canonical
  base and the server's ranks, then rebuild displayed state and release the held
  operations.
- If a create fails with `quota_exceeded` (the account already has 250 playlists
  or 25,000 tracks), the playlist keeps working on the device. Its create stays
  `needs_attention`, the detail screen says it isn't saved to the account because
  the account is full and offers team@relisten.net, and the create retries after
  any delete in that account syncs.

**Sending**

- Debounce sends for 20 seconds after the last edit (Alec, 2026-11-17; one
  constant). Flush immediately when the editor closes, the user leaves the
  playlist, the app backgrounds, or connectivity returns. The outbox is durable,
  so the delay risks nothing; other devices just see changes later.
- Before sending, compact **truly unsent** operations only (pending, zero
  attempts). An operation **references** an item when it names it as target,
  destination parent or anchor.
  - Two moves of the same item (`move_entry` or `move_segment`) merge into the
    later one unless an operation between them references the item, or the
    earlier move created a group (`move_entry` with `new_segment_id`) that any
    later operation references. Example of the exception: move E into new group
    N, insert F into N, move E into T. Merging would erase N's creation, and
    inserting F would then fail with `parent_missing`. When nothing references the
    new group, merging is safe: E was its only track, so the second move would
    have emptied and deleted it anyway. A move that empties its old group needs
    no exception, since the merged move empties it too.
  - An insert followed by a delete of the same unsent item drops both, but only if
    no other operation references that item.
  - Consecutive `update_metadata` operations merge.
  - Property tests check that replaying the compacted outbox gives the same state
    as replaying the original. They include the move-into-new-group case above,
    both with and without a later reference to the new group.
- Batches are capped at 500 operations and 1.5 MiB of payload. A `413` splits the
  batch and retries, except while `quota_paused`, when the outbox must travel whole.

**Pulling**

- The library feed is an additive extension of the existing favorites feed.
  `favorite_sync_contract.ts` parses the `playlists` snapshot array and
  `playlist_summary` changes, and ignores unknown `change_type` values instead of
  throwing. Playlist summaries route to the playlist sync coordinator.
- A summary for a playlist not on the device creates it with owner A and fetches
  its snapshot. Otherwise pull when the summary revision is ahead of
  `appliedRevision`.
- Apply each changes page in one Realm write, then rebuild displayed state.

**Recovery**

- A `history_generation` mismatch on any playlist or library response, or a
  `410 snapshot_required`, runs restore recovery exactly as the contract lists it:
  resubmit held operations with their original IDs (creates first), fetch
  snapshots, then prune within the new generation. A library-feed mismatch also
  triggers it for every playlist the account owns.
- `parent_missing` and `id_conflict`: mark the operation `needs_attention`, keep
  any track IDs it was adding in `failedTrackIds`, and show "2 tracks couldn't be
  added to Cornell + friends". **Add again** sends one `insert_segment` at the end
  of the playlist with fresh IDs; **Dismiss** drops it.
- `409 playlist_archived`: move the outbox to `archived_hold` and stop resending.
  The detail view says the playlist was deleted on another device and offers
  **Restore** or **Discard changes**. Restoring resumes sending.

**Quota on edits**

- After `422 quota_exceeded`, mark the outbox `quota_paused` and stop resending it
  unchanged. Resend the whole outbox in order when the user adds another edit, or
  when a deletion in another of the owner's playlists syncs.
- If the paused outbox exceeds one batch, keep every edit, show an alert asking
  the user to contact team@relisten.net, and record a diagnostic event.

## Platform surfaces

- **CarPlay** (`relisten/carplay/library.ts`) and **Android Auto**
  (`RelistenMediaLibrary.kt`): a read-only **Playlists** list of visible
  playlists that plays a playlist, in milestone 1. Editing stays on the phone.
  CarPlay already browses from TypeScript. Android Auto's native media library
  exposes only the current and preloaded next tracks, so milestone 1 adds a
  browse-and-select bridge from the native library to the TypeScript queue owner:
  list playlists, and on selection hand the playlist ID to TypeScript, which builds
  the queue.
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
  today), including a persisted queue and existing unowned playlists.
- **Visibility:** each row of the Owners and visibility table, including signing
  out of A, editing, signing in as B (A's playlists hidden, edits still queued for
  A), then signing back in as A (edits send).
- **Experience (milestone 1):**
  - each drop target in the dragging table produces its listed operation,
    including a lone track dropped "on its own" sending `move_segment`
  - every row-menu action and Undo produce the same state as the equivalent
    drag
  - VoiceOver custom actions reach every move
  - every screen works at the largest accessibility text size
  - Recently deleted restores an unowned playlist and purges it after 30 days
  - join-by-hover never arms during auto-scroll or under 60% overlap
  - the toast never overlaps the mini player or tab bar, and hides during drags
  - offline Play with a partly downloaded playlist plays only downloaded tracks
  - the "Keep with…" toast appears when a segue's second track is added
- **Player:** each group-shuffle rule above; enqueue the same playlist twice and
  remove one duplicate; **Play next** keeps grouping; restart restores the exact
  queue occurrence and checkpoint; later playlist edits leave the queue unchanged;
  downloaded playlist tracks play offline; the 3-skip limit. A stale error: track
  A fails, the user selects B, then A's resolve returns `unavailable`; B keeps
  playing and A is marked unavailable.
- **Sync (milestone 2), against a fake server:**
  - signing in saves every unowned playlist with its existing IDs, and a kill
    mid-save resumes without duplicates
  - receipt 43 arriving before delta 42 still pulls after 41
  - a lost create response retries before its children, and edits made before
    acknowledgement apply afterward
  - a restore that reuses revision numbers forces snapshot replacement
  - a quota-failed insert into a single-entry segment applies when resent with
    the deletion of that entry
  - a create failing account quota leaves the playlist working on the device
  - compaction never touches an operation that has started a request, and
    preserves replay results
  - a response arriving after an account switch writes nothing
- **Manual simulator checklist:**
  - Milestone 1: create from a show, add tracks from another show into the same
    group, drag a track out, kill and relaunch, then play with shuffle in airplane
    mode, including over Cast once.
  - Milestone 2: make playlists signed out, sign in and see them sync to a second
    simulator; edit on both, one offline, then reconnect; sign out and confirm
    nothing disappears.

## Decisions

1. **Playlists live on the device; owners are invisible.** One list, titled
   **Playlists**. Signing in gives unowned playlists an owner and syncs them in
   place with their existing IDs; signing out changes nothing visible (Alec,
   2026-11-17). This replaces the earlier "local playlists belong to the device"
   and "new playlists go to the account" decisions and the Save to my account
   milestone.
2. **A second account on the device sees only unowned playlists and its own.**
   Other accounts' playlists stay on the device, hidden until they sign in again
   (Alec, 2026-11-17).
3. **CarPlay and Android Auto get a read-only Playlists list in milestone 1** that
   plays a playlist. Editing stays on the phone (Alec, 2026-11-16).
4. **Save queue as playlist is deferred** past milestone 1 (Alec, 2026-11-16).
5. **The server base is stored as paired fields on each row** (`canonical*` beside
   the displayed fields, plus `live` flags), not as a separate base document or
   per-row JSON (Alec, 2026-11-17). A pull's cost tracks the size of the change,
   and the pattern matches favorites.
6. **Delete archives owned playlists online only.** Owned playlists move to
   **Recently deleted** and can be restored; deleting one requires being online
   and signed in as its owner. No contract change (Alec, 2026-11-17). Unowned
   playlists also go to Recently deleted, for 30 days, so Delete means the same
   thing everywhere (confirmed by Alec, 2026-11-17).
7. **The experience design section is the UX spec** (Alec, 2026-11-17):
   - plain rows for single tracks
   - drag in edit mode with tap equivalents for every move
   - Undo toasts instead of confirmations
   - no artwork, and no account or sync vocabulary
8. **Favorites should move to the same owner model later.** Today they still
   switch between an anonymous set and an account set. That is separate work, and
   cheap while favorites are dev-alpha only.

## Milestone 1 implementation notes (2026-11-17)

Built on `codex/v4-playlists-mobile` and exercised in the iOS simulator against
the production catalog. Where the build differs from the spec above, these
notes win:

- **Schemas.** Schema 24 added the playlist models and queue context. Schema 25
  gives `PlaylistTrackAvailability` a `status` (`unavailable` or `redirected`)
  and a `redirectTrackId`, because catalog redirects only cover songs and venues.
  Account sync therefore starts at schema 26.
- **Toasts** reuse the app's existing floating top message (as the history queue
  Undo does), which never collides with the mini player or tab bar. Toasts appear
  only when an edit changed something. Undo history is in memory: 5 snapshots for
  each of the 10 most recently edited playlists, so Undo still works after leaving
  the screen.
- **Dragging** uses `react-native-draggable-flatlist`, like the player queue.
  Group boundaries are real header and footer rows, so a drop is inside a group
  when it lands after the header or before the footer. Whole groups move in an
  **Arrange Groups** mode, where each group is one row; there is no mid-drag
  collapse. Joining two loose tracks is done with **Keep with…** (row menu, or the
  toast after a drop that lands right under a single track), not hover-to-join.
- **Menus** hide moves that don't apply instead of showing disabled items with
  subtitles; native menu items have no subtitle support.
- **New playlist** shows the suggested name as a placeholder; Create uses it when
  the field is empty.
- **Not built yet:** the first-time shuffle hint, the Now Playing jump pill, the
  sign-in card (playlists don't sync until milestone 2), and **Android Auto**. The
  Android Auto bridge needs native Kotlin, and no JDK 17 or 21 was available to
  compile it.
- **Not verified by hand:** dragging (simulator automation can't hold a touch);
  the drop logic has unit tests instead. CarPlay (type-checked, not run).

## Milestone 2 implementation notes (2026-11-17)

Implemented in `relisten/playlists/sync/` against the local User Service on
`codex/v4-playlist-plan`. Where it departs from the sections above:

- **Undo on account playlists** withdraws the edit's operations while they are
  unsent (the 20-second quiet period). Once sent, Undo says the change is
  already saved. Inverse operations were not built.
- **No outbox compaction.** The quiet period and batching already make one
  request per burst of edits; compaction can follow if batches prove large.
- **Rebuilds run only after server responses** (pulls, acknowledgements,
  withdrawn or refused edits). A listener's edit writes the displayed fields and
  appends its operation, as planned.
- **A create command freezes the structure at claim time** and copies it into
  the canonical fields as a provisional base, so edits made before the create is
  acknowledged replay on top of it. The snapshot fetched after the
  acknowledgement replaces it with the server's ranks.
- **A playlist the account lost** (404 on a batch or snapshot, after a restore
  older than the playlist) is recreated from what the device shows; edits held
  for it are folded into that create.
- **Library history generation** is stored on `FavoriteSyncState`; a change
  starts restore recovery for every playlist the account owns.
- **Schema 26 migration** sets `live = true` on existing rows. Realm gives new
  properties on existing objects their type's zero value, not the schema
  default; without the migration every existing track would be hidden and then
  dropped by the first rebuild. Regression test: `playlist_migration.test.ts`.
- **Verified end to end** in the simulator with one device and a second
  session driven over HTTP: claiming on sign-in, creates, edit batches, pulls of
  another device's insert and rename, concurrent edits from both, archive and
  restore. Not verified: quota pause, `playlist_archived` holds, refused
  additions, restore recovery, and the 413 split.

## Progress

- [x] (2026-11-16) Branch created; scope, favorites, Realm and queue code
  surveyed; plan drafted and revised after a fresh-reader review.
- [x] (2026-11-16) Alec accepted the first round of decisions.
- [x] (2026-11-17) Replaced separate local and account lists with one list and
  optional owners.
- [x] (2026-11-17) Milestone 1: playlists on the device, except Android Auto.
- [ ] Android Auto playlists list (needs a JDK 17 or 21 to build and verify).
- [ ] Milestone 2: saving to an account (after the User Service delivery 1).
