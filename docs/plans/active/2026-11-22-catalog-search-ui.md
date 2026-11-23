# Catalog search in the app: Search tab and Add Tracks

This plan adds two surfaces that call the deployed `GET /v1/search`:
- **Search**, a new tab for finding artists, songs, venues, shows, recordings, reviews and playlists;
- **Add Tracks**, a sheet opened from a playlist that adds exact files to it.

Both share one request layer and one results list, and differ only in what a tap does. The sheet's few extra screens are thin wrappers over data hooks the app already has. Offline, both surfaces search what is downloaded on the device. No server change is needed.

Alec decided three choices on 2026-11-22:

| Decision | Chosen | Alternative not taken |
| --- | --- | --- |
| Where Search lives | A **Search tab**: iOS `role="search"`, a plain tab on Android, a row in the iPad sidebar | A magnifier in the Artists header. It saves a tab and the shared route-folder rename, but hides search one level down. |
| How far Add Tracks browses | **Four screens inside the sheet:** results, a show list for a venue or song, a setlist with **+** on each file, and Other recordings. Artist and tour taps narrow the search in place. Alec added a way out to the full view: see **Open full page** below. If an iOS form sheet can't host a stack, the same stack opens full screen. | Reuse the app's full artist, venue, song and show screens inside the sheet. Each would have to learn about the destination playlist and swap play actions for **+**. |
| First page size for one scope | **Ship today's sizes:** up to **24** rows for Artists, Songs and Venues, and 24 rows across at most 12 shows for Sources and Reviews. A broad Shows query returned **36**. Codex found every release journey's target on page one. Release one shows only the first page, and the size can be revisited after use. | Raise the fixed server limits to about 40, a small server change. Responses grow from roughly 18 kB to 35 kB, and the latency cost is unmeasured. |

Two rounds of Codex review against the code and the live API shaped this version. It takes five simplifications for release one, which Codex reviewed:
- **Private playlists:** an owned private playlist stays hidden from search until it has synced to the device.
- **Other recordings:** opens the show's existing source list.
- **Paging:** one page per catalog scope.
- **Passages:** open their source instead of adding as a group.
- **Empty field:** recently played only.

Alec kept offline search, and accepted a single page as long as it is reasonably large.

The behavior comes from the [server plan](https://github.com/RelistenNet/RelistenApi/blob/master/docs/plans/active/2026-11-22-catalog-search.md) and the [listener journeys](https://github.com/RelistenNet/RelistenApi/blob/master/docs/design/2026-11-21-catalog-search-journeys.md). Its phone journeys, PHONE01–09, are the acceptance test.

## What the listener sees

A `/v1/search` response has two **halves**:
- **Catalog:** artists, songs, venues, shows, performances, recordings, reviews, passages.
- **Playlists:** the listener's own and published ones.

Each half reports whether it was available. An unavailable half shows a retry in its place, never "No results".

**Search tab.**
- **Empty field:** recently played shows.
- **Scope chips:** typing shows results under All, Artists, Songs, Venues, Shows, Sources, Playlists, and Reviews when the response includes a `reviews` count.
- **Interpretation chips:** the clues the server read, such as *Phish* or *2017*. Each can be removed.
- **Taps:** each result opens its screen inside the Search stack. Back returns to the query, the scope and the scroll position.

**Add Tracks sheet.** It opens from the playlist toolbar, the empty-playlist message and edit mode.
- **Empty field:** recently played shows.
- **Typing:** the same results with `mode=add_tracks` and playlists left out.
- **Adding:** a performance row's **+** adds the file it labels. Every setlist in the sheet has **+** on each file.
- **After adding:** the sheet stays open. The row confirms in place, and an Undo bar appears inside the sheet. Adding a file already in the playlist uses the existing duplicate prompt.

**Offline.** Both surfaces switch to one **On this device** list. It covers downloaded artists, shows and tracks, and in Search also local playlists. Downloaded tracks can be added from it.

## What a tap does

The table gives the response field each tap depends on, so a reviewer can check it against a live response.

| Result kind (fields used) | Search tab | Add Tracks |
| --- | --- | --- |
| `artist` (`id`) | Artist page | Narrow in place: artist filter (`artist_id`) as a removable chip |
| `song` (`id` is `song_…` or `imported_song_…`; `artist_id`) | Song page | The song's shows (`useArtistSongShows`), then a setlist focused on the song |
| `venue` (`venue_id`, plus `artist_id` for an imported venue) | Venue page, using `venue_route.ts` | The venue's shows (`useGlobalVenueShows` with the short `venue_` ID, or `useArtistVenueShows` with the artist UUID and imported venue ID), then a setlist |
| `show` (`show_id`, `artist_slug`) | Show page, through `pushShow` | Setlist of the `initial` source, with Other recordings in its header |
| `performance` (`show_id`, `song_id`, `preview.source_id`, `preview.track_id`) | That source, scrolled to the file and highlighted, not played | **+** adds `preview.track_id`. Tapping the row opens that source's setlist focused on the song. |
| `recording` (`id` is the source; `source_id` is empty) | That source | That source's setlist |
| `sequence` (`source_id`, `track_ids[]`) | That source, focused on the first file | That source's setlist, focused on the first file |
| `review` (`source_id`, `show_id`) | The source's reviews page | That source's setlist |
| `tour` (`id`, `artist_id`) | Artist tour page | Narrow in place: tour label with the artist filter, `scope=shows` |
| `playlist` (`id`, `owned`, `public_code`) | A visible local row opens `playlists/[id]`; otherwise `playlists/shared/[public_code]` | Not requested (`ignore=playlists`) |

**IDs.**
- **Typed UUID IDs** become Realm keys through `decodeUuidCatalogId`. These are `artist_`, `show_`, `source_`, `track_`, `tour_`, `imported_song_` and `imported_venue_`.
- **Short IDs:** `song_` and `venue_` pass through unchanged.

**Artists.** Recording, review and passage rows in the All view carry `artist_slug` but no `artist_id`. Those taps load the artist with `useArtistBySlug` before pushing, because `pushShow` reads the loaded `Artist`'s source settings.

**Named sources.** A tap that names a source opens exactly that source. If the source is gone, the screen says the recording is unavailable. Today's show hook falls back to the first source (`show_repo.ts:169`), which would open a different recording.

**Playlists.** An owned private hit with no local row on this device is filtered out until library sync brings the row. Published hits open by public code.

## Design

### Request layer

`relisten/search/` holds the shared code. Neither surface talks to the network directly.

- **`search_types.ts`:** the response fields the app reads, typed from `RelistenUserService/Search/MergedSearch.cs`.
- **`search_client.ts`:** `fetchSearch(api, params, signal)`.
  - **Signed in:** uses `AuthorizedAccountsApiClient.request`, which brings private playlists and refreshes the token on 401.
  - **Signed out:** uses `requestAnonymously`.
  - **Encoding:** `boost_artist_ids` and `ignore` are sent comma-separated.
- **`use_search_session.ts`:** the session hook both surfaces render from. It owns query, scope, removed chips, artist filter and mode.
  - **Invalidation:** a change to any of them invalidates pending results at once, before the 120 ms debounce. Each request aborts its predecessor and carries an increasing `request_id`. A response that isn't the latest is dropped.
  - **Abort:** recognized from the signal, because the transport wraps it as an API error.
  - **Typing and submit:** `typing=true` while typing, `typing=false` on submit. In All, typing skips recordings and reviews. A selected Sources or Reviews scope searches them while typing too.
  - **Artist chip:** removing an explicit artist chip clears `artist_id`.
  - **Account binding:** results are bound to the account they were fetched for. A response or rendered list from another account generation is discarded, so a private playlist card can't survive a sign-out or account switch. There is no response cache.
  - **No jank:** current results stay on screen until the next response for the same account arrives, then are replaced in one render. Both halves arrive in one response, so neither pushes the other down.
- **`search_boosts.ts`:** builds `boost_artist_ids`.
  - **Order:** the destination playlist's artists (Add Tracks only), then favorite artists (`useFavoriteCatalogUuids('artist')`), then the first 3 of `useTopPlayedArtistUuidsOnce(6)`.
  - **Why 6 and not 3:** that hook shares a module cache with the Artists tab's 6-item call, and whichever finishes first sets the cached length.
  - **Encoding:** deduped, encoded with `encodeUuidCatalogId`, and capped at the server's 32.

### Rendering

The results list renders one response. The caller supplies each kind's tap and trailing accessory, which is the only difference between the two surfaces.

| Scope | Renders | More |
| --- | --- | --- |
| All | `catalog.top` in rank order, then `sections.sources`, `sections.reviews`, `sections.passages`, then up to 6 playlist cards. The other `sections` arrays repeat rows in `top`, so they aren't rendered. | The Sources, Reviews and Playlists headers switch to their scope. Passages has no scope, so its header is a plain label. |
| One catalog scope | `catalog.results` from page 1 | None in release one. A more specific query, or the venue and song screens, reach the rest. |
| Playlists | Top-level `playlists` | Follow `playlist_next_page`, even after a page that showed nothing, since hidden hits are filtered after paging. |

Rows show what tells results apart: artist, date, venue, set and duration, and soundboard or soundcheck where marked. Two performance rows from one show stay separate.

### Offline: On this device

`search_local.ts` runs parameterized `CONTAINS[c]` Realm queries on the trimmed query, capped per group. It reuses the Offline tab's completed-download predicates (`realm_filters.ts`).
- **Artists:** `Artist.name`, limited to artists with a completed downloaded track.
- **Shows:** `Show.displayDate`, artist name or venue name, with the same downloaded-track test.
- **Tracks:** `SourceTrack.title` with `offlineInfo.status` `Succeeded`, labeled with artist, show date and source.
- **Playlists (Search only):** local playlists visible to this listener (`visiblePlaylists`), matched on name or description.

**When it shows.** It replaces the catalog half when `useShouldMakeNetworkRequests()` is false, which includes the Always Offline setting, or when the server reports the catalog unavailable. Healthy remote playlist results stay. A successful empty server response stays empty.

**Taps and adds.**
- **Artist or show taps:** narrow the local list to that artist's or show's downloaded tracks.
- **Adding a downloaded track:** **+** on a track row checks that the track is complete and active in Realm and that its file exists. It then calls `addTracks` directly.
- **Online with the catalog unavailable:** the resolver check below still runs first.

### Adding a search result

Today every add starts from a complete Realm `SourceTrack`. Search results carry only a `track_` ID, and a file cached on the device may have been withdrawn upstream since. Every online add from the sheet therefore resolves first.

`addSearchTrack(realm, catalogApi, playlistId, trackId)` in `relisten/playlists/playlist_actions.ts` adds one file. It passes `[[trackId]]` to the existing `addTracks`:
1. **Resolve and check.** `resolveCatalogBatch` gains a pre-apply check that runs before any entity reaches Realm, because the Realm mapper throws on a track with no audio URL. It mirrors `PlaylistTrackResolver.cs` and passes a track only when all of these hold:
   - the reference is `available`;
   - the target ID equals the requested ID;
   - the response's matching track entity has `playable: true`.

   A reference that is unavailable, retired or unplayable raises `TrackUnavailableError`, and the playlist is unchanged. Missing or inconsistent data is retryable. The client `TrackResource` type gains the server's `playable` field.
2. **Apply metadata.** On a pass, the resolver's own write stores the entities and clears any stale `PlaylistTrackAvailability` marker. That marker would otherwise outrank the fresh metadata.
3. **Recheck, then add.** Recheck that the sheet's account and destination are unchanged and editable, and look for an exact duplicate. Then call the existing `addTracks` in its own write, which handles undo, the outbox, sync and the 5,000-entry limit.
   - **Why two writes:** Realm doesn't allow a write inside another write.
   - **If the add fails:** the metadata from step 2 stays cached, which is harmless.
   - **No hydration lock:** hydration only fetches rows already marked `loading`, and the entry is inserted after its metadata exists.

**One pending add at a time.** The sheet disables other **+** buttons while an add or duplicate prompt is pending, and rechecks the destination when a duplicate prompt is confirmed.

**Undo inside the sheet.** The Undo bar is bound to the completed edit and drawn inside the sheet, because the sheet covers the app's global toast. If sync has already sent the edit, Undo reports the existing `sent` outcome.

**Waiting and failure.** While the resolve is in flight, the **+** shows progress. A network failure leaves the playlist unchanged and offers a retry. Five production resolves of one track took **165–308 ms** from a laptop on Wi-Fi.

### Add Tracks sheet

`app/relisten/add-tracks/` is a stack registered in `app/relisten/_layout.tsx`, with `playlistId` as its param. The inner stack owns the header, because `sheetOptions` turns on the outer one.

**Open full page.** Every in-sheet screen other than results has an **Open full page** header action, and a long-press on any result row offers the same thing.
- **What it does:** it closes the sheet and pushes the matching full screen (artist, venue, song, show or source) in the tab the sheet was opened from.
- **What it costs:** the full screens have no **+**, so the listener reopens Add Tracks to keep adding.
- **Why this way:** Add Tracks stays limited to its own small screens, and none of the full screens learn about the destination playlist.

| Screen | Data | Purpose |
| --- | --- | --- |
| `index.tsx` | search session, local search | Field, chips, Recently Played, results or On this device |
| `shows.tsx` | `useGlobalVenueShows`, `useArtistVenueShows` or `useArtistSongShows` | A venue's or song's shows. Each opens `source.tsx`, focused on the song when there is one. |
| `source.tsx` | `useFullShow` | One source's setlist with **+** on each file. Its header opens Other recordings. |
| `recordings.tsx` | `useFullShow` | The show's sources with their credits and upstream IDs. Choosing one opens `source.tsx` focused on the same song. |

**Focus on a song.** Files whose normalization parts include the hit's `song_id` are highlighted. Codex checked this against the live full-show data:
- **July 25, 2017, Lawn Boy:** both files, Set 1 at **29:58** and Encore at **1:28**.
- **Cornell, Scarlet Begonias:** the `117026.flac16` file, at **9:45**.
- **Red Rocks, Creek:** the `ck63` file, at **13:36**.

An `imported_song_…` hit can't match a canonical normalization part. It focuses on the imported song's `normalizedSongId` when it has one. A hit with no usable song ID keeps its exact preview, and other sources open without a focus.

**Recently Played** reuses the existing recent-shows hook and keeps each entry's last-played source.

### Search tab

- **New tab:** `(search)/_layout.tsx` and `(search)/index.tsx`.
- **Shared route folder:** `(artists,myLibrary,offline)` gains `search`. Expo Router expands array groups into one route per group, so the existing route names don't change.
- **Hard-coded lists:** the rename touches four places:
  - `RelistenTabGroupSegment` and the `TabRootStackLayout` titles;
  - the player's tab list in `current_track_navigation_menu.tsx:27`;
  - the show loader's Artists-only exclusion of deleted sources in `show_repo.ts:136`;
  - one test that imports a route file by its literal path.
- **Focus without autoplay:** the source screen gains a `focusTrackUuid` param that scrolls to a file and highlights it without playing it. The existing `playTrackUuid` autoplays, which is wrong for a search tap.

## Tasks

Run `yarn lint`, `yarn ts:check` and the affected Vitest files with every task. Each task ends with something a reviewer can check.

1. **Navigator probe.** Before feature code, build a throwaway two-screen stack in a form sheet, plus the `(search)` tab with the folder rename. Check keyboard, push and back on the iOS simulator and an Android emulator. If the form sheet can't host the stack, switch the sheet to full screen now. Delete the probe screens.
2. **Request layer and local search.** `search_types.ts`, `search_client.ts`, `search_boosts.ts`, `search_local.ts`, `use_search_session.ts`. Tests:
   - **Stale response during the debounce:** a response for the old query arrives after the query changes but before the new request is sent, and is not rendered.
   - **Account switch:** a response completing after an account switch is discarded, and the rendered list is cleared.
   - **Partial availability:** `catalog_availability: "unavailable"` with `catalog: null` shows On this device and keeps playlists, not empty results.
   - **Boosts:** playlist artists come first, duplicates are removed, IDs are encoded, and the list stops at 32.
   - **Local search:** a track that isn't downloaded doesn't match. A downloaded one does, with its show and source.
3. **Add path.** `addSearchTrack`, the pre-apply check and the `playable` field. Tests against a test Realm:
   - **Unplayable:** an available track with `playable: false` and no audio URL is refused with no mapper throw, and the playlist is unchanged.
   - **Warm cache:** a track already complete in Realm but now `unavailable` upstream is refused. This is the PHONE08 guarantee.
   - **Playable:** a playable track is added once, and its row is complete without hydration.
   - **Double tap:** a second tap during a pending add inserts nothing. A later tap on the same file opens the duplicate prompt.
4. **Results list and Search tab.** The list component, every Search-tab tap in the table, `focusTrackUuid`, and the iPad sidebar row. On the simulator against production:
   - PHONE01 and PHONE05 pass;
   - a private playlist created on another device appears in search after sync;
   - existing deep links still open the same screens.
5. **Add Tracks sheet.** The four sheet screens, Open full page, the playlist entry points, Recently Played, and On this device. Run PHONE02–04 and PHONE06–09 against production, using the local stack for PHONE08. Check the exact `track_` IDs in order on the playlist page and on a second device after sync.
6. **Measure.** Time from last keystroke to rendered results on a phone over cellular, for 20 common eval queries. The journeys target a **500 ms p95**, against the server's measured **59 ms** API p95. Record results in a Verification section here. If the target is missed, look at the debounce and payload size first.

## Acceptance

The design's phone journeys pass, with these specifics:
- **PHONE03:** search returns one July 25 `Lawn Boy` preview, the long Set 1 file. The short encore is added from that show's setlist, where both files are highlighted with set and duration.
- **PHONE04:** from the Dead's 1977-05-08 `Scarlet Begonias` result, open Other recordings, choose the source whose upstream ID ends `117026.flac16`, and add its highlighted file.
- **PHONE06:** start in a Phish-only playlist with no artist filter.
  1. Type `red rocks`, tap the venue, and confirm Billy Strings' 2022-05-13 show is in its list.
  2. Go back, type `red rocks creek`, and confirm a Billy Strings performance appears.
  3. Narrow to `billy red rocks creek` and choose the **2022** performance. The live query ranks 2023 first and 2022 second.
  4. From Other recordings, choose `ck63` and assert its exact track ID.
- **PHONE07:** in airplane mode, find and add the downloaded `Creek`. On reconnect the same query shows remote results for the same playlist.
- **PHONE08:** with a complete cached copy of Tokyo's `Twist` on the device, withdraw it upstream. **+** explains it is unavailable and leaves the playlist unchanged.
- **PHONE09:** from Recently Played, open Fukuoka, add `Twist` then `Jam`, and undo `Jam` in the sheet before sync sends it.

## Not in this plan

- **Server changes**, including larger page sizes and a `next_page` field.
- **Infinite paging**, a response cache, recent searches, saved filters and typeahead suggestions.
- **One-tap passage adds** and their one-step Undo.
- **Shows already in the playlist** as an empty-state section.
- **Opening a private playlist** that hasn't synced to the device yet.
- **Exact alternate-file matching** for hits with no `song_id`.
- **A preview player** that leaves the queue alone. Playing a file from the sheet replaces the queue, as the source screen does today.
- **Search analytics** beyond `request_id`.

## Review guidance

- **Sheet screens:** do the four screens cover the journeys without the full browse pages? The venue and song lists exist because searching their names mixes places and versions. Production `capitol theatre` interleaves Port Chester and Passaic.
- **Resolve before every online add:** is the wait on **+** acceptable on cellular?
- **Folder rename:** check the four hard-coded lists above, and Universal Links.
