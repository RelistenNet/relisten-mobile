# CarPlay Experience Design

## Goals
- Mirror core Relisten flows in CarPlay: browse artists → years → shows → sources → tracks with playable queues.
- Provide Offline and My Library entry points without exposing unsafe actions for in-car use.
- Integrate Now Playing with basic queue visibility and control (play/pause/next/prev, shuffle/repeat, select from Up Next).
- Reuse existing Realm-backed behaviors/executors for data loading; avoid bespoke network calls.

## Tabs & Root Templates
- **Browse**: Online catalog, full hierarchy down to track selection/queueing.
- **My Library**: Quick access to favorites, recent history, and downloads with drill-down to the same hierarchy. (Offline tab was removed in favor of this.)
- **Now Playing**: System now-playing template with Up Next/Album Artist buttons, plus a queue list for "what's next" management.

## Screen Flow Details
### Browse (online)
1. **Artists List**
   - Uses `artistsNetworkBackedBehavior(realm, false).sharedExecutor(apiClient)`.
   - Sections: Favorites (if any), Featured, All (alphabetical). Shows disclosure indicator for drill-down.
2. **Years List (per artist)**
   - `yearsNetworkBackedModelArrayBehavior(realm, false, artistUuid)`; grouped or flat sorted ascending.
   - Items show year, show count, source count; disclosure to shows.
3. **Shows List (per year)**
   - `YearShowsNetworkBackedBehavior(realm, artistUuid, yearUuid, userFilters)`.
   - Items: date, venue/location, indicators for SBD/offline/favorite; disclosure to sources.
4. **Sources List (per show)**
   - `ShowWithFullSourcesNetworkBackedBehavior` via `useFullShow` analogue; sources sorted with `sortSources`.
   - Item text: source description/taper; detail: rating, duration; indicator for offline/favorite; disclosure to tracks.
5. **Tracks List (per source)**
   - Flatten `source.sourceSets` by set index/track position.
   - Item text: track number + title; detail: duration; offline indicator.
   - Selecting a track replaces the queue with that source’s tracks starting at the selected index and starts playback; also pushes now playing template if not visible.

### My Library
- Root list sections:
  - **Resume / Now Playing** (if a track is active) → opens queue/now playing.
  - **Recently Played**: last N shows from playback history; selecting goes to Sources list for that show (auto-selects favored/best source).
  - **Favorite Artists**: filtered from artists results (`isFavorite`), drills into Years flow.
  - **Favorite Shows**: Realm query of `show.isFavorite || hasOfflineTracks`; selecting opens Sources list.
  - **Downloads**: shortcut into Offline hierarchy root.
- Uses cached Realm data; refreshable via shared executors where applicable for artists/shows.

### Now Playing & Queue
- **Now Playing Template**: enabled globally; album artist button jumps to artist/years flow; Up Next opens queue list.
- **Queue List Template**:
  - Sections: Now Playing (with progress), Up Next (ordered queue), Later/History if available.
  - Selecting an item jumps playback to that track; optional actions row for `Shuffle`, `Repeat` toggle, `Clear Queue` (if safe).
  - Uses `RelistenPlayer` state/queue listeners to keep `isPlaying` and `playbackProgress` in sync.

## Data/Behavior Notes
- All list templates attach teardown handlers on the shared executors to avoid leaks when CarPlay disconnects.
- Default selection behavior: start playback immediately and replace queue with the scoped list (source tracks) unless explicitly choosing "Play next"/"Add to queue" options (if provided via accessory actions).
- Sorting uses existing helpers: artist.sortName, year ascending, show by displayDate, sources via `sortSources`, tracks by set index → track position.

## Open Questions / Clarifications Needed
- Should the Offline tab strictly avoid network calls (`LocalOnly`), or allow refresh if online while still filtering to offline-capable items?
- Are CarPlay-safe actions for downloads/favorites allowed (e.g., toggle favorite, download/remove)? Currently planning read-only library/offline views with playback only.
- For queue management, is reordering/removing tracks desired, or is jump-to-track + shuffle/repeat toggles sufficient for MVP?
- Album artist button behavior: should it open the artist → years flow or simply the artist page analogue (e.g., favorite toggle)?
