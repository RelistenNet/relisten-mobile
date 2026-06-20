# Workstream: Playlist Mobile UX

## Goal

Design and implement the user-facing mobile playlist UX now that auth, scoped Realm rows, Queue V2, sync/outbox, history upload, Cast/CarPlay identity, and mobile share-token exchange have foundation coverage.

M1 success is not a polished social playlist product. M1 success is a coherent mobile workflow where a user can:

- See owned, followed, collaborative, and invited playlists in My Library.
- Open public/unlisted/private-access playlist links without leaking URL tokens.
- Play playlist entries with Queue V2 identity, duplicate-track correctness, block shuffle, Cast/CarPlay metadata, and history attribution.
- Add a track or contiguous source range to a playlist through the existing source/show surfaces.
- Understand read-only, signed-out, follower, collaborator, owner, offline, unavailable-track, and sync-conflict states.

## Source Contracts

- Design doc Section 10 defines visibility, access levels, web/mobile expectations, Follow, Clone, and collaborator invitations.
- Design doc Section 3 defines playlist entry identity, block ordering, duplicate tracks, unavailable entries, and partial-offline block behavior.
- Design doc Section 12 defines the mobile hydration contract: default playlist reads return raw UUIDs, and mobile must ensure full catalog graph hydration before playback.
- Design doc Section 15 lists the explicit mobile UX surfaces: My Library sections, signed-out states, Add to Playlist, add source range as block, reorder, invite inbox, Follow/Clone, unavailable tracks, partial-offline blocks, and sync result states.

## Current Foundation Status

Available:

- Separate user-library API client and local base URL config.
- Development-only sign-in surface with real access/refresh token behavior.
- Active scoped Realm user-data scope and scoped playlist/favorite/history rows.
- Playlist pull sync and local operation outbox/replay.
- Queue V2 item identity for catalog and playlist entries.
- Playlist Queue V2 construction from scoped playlist entries.
- Cast custom data and CarPlay row identity.
- Mobile share-token exchange, SecureStore grant secrets, scoped grant metadata, and tokenless grant headers.
- Non-UI playlist read service, mobile grant header selection, shared snapshot application, and missing source-track hydration planning.

Blocked or deferred:

- Live local API smokes now pass for auth/profile, favorites, history batch upload, pull sync, playlist operation, and share-token exchange against `http://localhost:5119`.
- Playlist mutation adapters exist only at the operation/outbox layer; no UI has been wired to create operations.
- Mobile playlist read/hydration client needs the server's final default read shape, especially `show_uuid`/`source_uuid` availability for catalog hydration.
- Follow, Clone, share-token management, invite acceptance, and conflict presentation need product decisions before user-facing implementation.

## UX Rubric

- Fit the existing app: quiet, dense, list-first, and native-feeling. Use existing tab/root stack patterns, `SectionHeader`, action sheets, and source/show rows.
- Prefer direct workflows over explanatory screens. Empty states can name the state and provide one clear action; do not add tutorial copy.
- Preserve offline-first expectations: a playlist can be visible even if some entries are unavailable or not downloaded; playback filters only at play time.
- Keep credential-sensitive states boring: no raw tokens in UI, params, logs, analytics, error messages, or persisted navigation state.
- Treat "block" as an internal term until product copy is chosen. User-facing copy must use one consistent label.

## Screen Map

### My Library Root

Mutable surface: `relisten/pages/tab_roots/MyLibraryTabRootPage.tsx`, `app/relisten/tabs/(myLibrary)/`, and focused playlist components.

Sections:

- Active Downloads.
- Recently Played.
- Listening Statistics.
- Owned Playlists.
- Following.
- Collaborations.
- Invitations.
- Recent Playlist Activity.

Signed-out state:

- Keep existing local library content.
- Show a compact account row only when playlist sections would otherwise be useful: sign in to sync playlists and save shared playlists.
- Do not hide local favorites/history behind account prompts.

Empty states:

- Owned: "No playlists yet" with create action once create UX exists.
- Following: empty until the user follows a shared playlist.
- Collaborations: empty unless accepted collaborator rows exist.
- Invitations: hidden when empty; visible at top when pending.

### Playlist Detail

Routes:

- Existing public entry route: `app/playlist/[playlistId].tsx`.
- Internal route to add when implemented: `app/relisten/tabs/(myLibrary)/playlist/[playlistId].tsx`.
- Shared screen component under a new focused playlist module, for example `relisten/user_library/playlist_screen/`.

States:

- Owner/editor: editable metadata/actions, add/reorder/remove where implemented.
- Follower: read-only playlist, Unfollow action.
- Token viewer or anonymous public viewer: read-only playlist, sign-in prompt for Follow/Clone when applicable.
- Editor token signed out: require sign-in before editor access; exact copy/flow is an open question.
- Deleted/no-longer-available: retain a clear unavailable state rather than dropping the row silently.

Content:

- Header: name, owner/creator, visibility/access badge, track count, duration when available.
- Primary action: Play.
- Secondary actions: Shuffle, Follow/Unfollow, Clone, Share, Edit, More.
- Entries: grouped visually when they share a block/segment, but still show each track occurrence separately.
- Unavailable entry: disabled grey row, counted in length but skipped in playback.
- Partial-offline block: show per-entry offline indicators and a block-level partial indicator once copy is settled.

### Add to Playlist

Entry points:

- Existing track dots action on source/show track rows.
- Player track menu for the current queue item.
- Future source-level action for "Add range as block".

Flow:

- Action sheet: Add to Playlist, then playlist picker.
- Playlist picker: recent/owned editable playlists, create new playlist, search if the list is long.
- Add single track: enqueue one outbox operation and optimistically update local scoped rows if the repository supports it.
- Add contiguous source range: select start/end or use a source-track multi-select mode; generate stable entry UUIDs, one shared `block_uuid`, ordered track inputs, and placement intent. Any local `block_position` values are provisional and must be reconciled from the canonical server snapshot.

### Edit/Reorder

M1 order:

- Implement after read/play/add workflows work.
- Use existing dependency `react-native-reorderable-list` only if it fits the current source-list ergonomics.
- Reorder whole blocks/segments as one unit at the playlist level.
- Reorder within a block by integer `block_position`.
- Surface sync result states after replay: applied, noop, conflict, rejected, skipped dependency.

### Sharing, Follow, Clone, Collaborators

Owner:

- Create/revoke share links.
- Visibility changes are server-owned side effects of share-token creation for private playlists.
- Invite collaborator by username once server search/invite endpoints are available.

Signed-in viewer:

- Follow creates a live reference in the Following section.
- Clone creates an independent owned copy and moves the user to the clone.
- A followed playlist can still be cloned later.

Signed-out viewer:

- Public or unlisted token access can show a read-only playlist.
- Follow/Clone/editor actions lead to sign-in.
- The short-lived mobile grant keeps tokenless reopened links working until it expires.

Invitation inbox:

- Show pending invitations in My Library.
- Accept gives editor access.
- Decline removes the invite.
- Push notifications are out of M1.

## Implementation Slices

### MOB-UX-001: Read-Only Playlist Library Surfaces

Goal: Add My Library playlist sections, recent playlist activity, and a read-only playlist detail screen backed by scoped Realm playlist rows.

Prerequisite service work complete in `MOB-UX-001A`: use `getUserLibraryPlaylist()`, `mobileAccessGrantHeadersForPlaylistRead()`, `applyReadUserLibraryPlaylistSnapshot()`, and `playlistCatalogHydrationPlan()` rather than adding new request or persistence helpers in UI components.

Mutable surface:

- `relisten/pages/tab_roots/MyLibraryTabRootPage.tsx`
- `app/relisten/tabs/(myLibrary)/playlist/[playlistId].tsx`
- new playlist components/repositories under `relisten/user_library/`

Validator:

- Focused pure tests for playlist section grouping/sorting.
- `yarn lint`
- `yarn ts:check`
- iOS Simulator My Library smoke.

### MOB-UX-002: Playlist Read, Grant Headers, Hydration, Playback

Goal: Read a playlist by UUID/short ID, include mobile grant headers when available, hydrate missing catalog rows, and launch playlist Queue V2 playback.

Mutable surface:

- user-library playlist read client/repository
- catalog hydration helper
- playlist screen play button
- Queue V2 playlist playback caller

Validator:

- Focused tests for grant header selection, hydration missing-row planning, unavailable entries, and Queue V2 playback inputs.
- Existing Queue V2 tests.
- iOS Simulator playlist play smoke.

### MOB-UX-003: Add Track and Add Range as Segment

Goal: Wire source/show track menus to playlist operation outbox for adding one track or a contiguous source range.

Mutable surface:

- source track context menu
- playlist picker component
- playlist operation adapter
- optimistic scoped playlist repository

Validator:

- Focused tests for operation construction, idempotency keys, block UUID generation, ordered range inputs, provisional placement handling, and signed-out disabled behavior.
- iOS Simulator action-sheet smoke.

### MOB-UX-004: Follow, Clone, Share Link, and Signed-Out Prompts

Goal: Add viewer relationship actions once product copy and server endpoints are clear.

Mutable surface:

- playlist detail actions
- relationship client helpers
- My Library Following section
- share-token owner UI

Validator:

- Focused tests for signed-out/signed-in action availability and response application.
- iOS Simulator share-link smoke when local API is available.

### MOB-UX-005: Edit, Reorder, Invitations, and Conflicts

Goal: Add owner/editor editing flows, collaborator invitations, and visible sync-conflict results.

Mutable surface:

- playlist detail edit mode
- reorder UI
- invitations section
- conflict status components

Validator:

- Focused tests for reorder operation construction, accepted/declined invite state, and per-operation result mapping.
- iOS Simulator reorder/invite smoke.

## Open Questions / Grill-Me Prompts

These block polished UI implementation:

1. User-facing block label: use "Segment" for M1, or choose another term such as "Group" or "Run"?
2. Should M1 support creating an empty playlist from My Library, or only create playlists during Add to Playlist?
3. For "Add range as block", should the UI be start/end selection, multi-select, or a quick action from a source track row?
4. Signed-out share viewer: should the playlist open read-only immediately with a subtle sign-in row, or should there be an upfront prompt?
5. Follow vs Clone hierarchy: should Follow be the primary CTA and Clone secondary, or should the app ask the user to choose every time?
6. Editor-token signed-out flow: can the user view read-only before sign-in, or should the app block on sign-in because the token's purpose is editor access?
7. Invitations: where should the required M1 accept/decline actions live, and what copy should distinguish pending invitations from accepted collaborations?
8. Conflict presentation: inline banner on playlist detail, a My Library activity row, or per-operation status only when editing?
9. Partial-offline block copy: what should the app call a block/segment when only some tracks are downloaded?
10. Share-link management: should owners see link creation/revocation in M1 mobile, or should mobile only re-share existing links at first?

## Main Validator

Every implementation slice must run:

- focused signal tests for the changed behavior
- `yarn lint`
- `yarn ts:check`
- iOS Simulator smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` when UI changes

Run full `yarn test` for shared repository, queue, sync, or playback changes.

## Next Scoped Step

Ask the open UX questions above, then start `MOB-UX-001` if the answers allow a read-only playlist/library surface without blocking on mutation copy.
