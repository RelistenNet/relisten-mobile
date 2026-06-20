# Ledger: Playlist Mobile UX

## MOB-UX-CLAR-001 - UX execution plan and open questions

Status: completed 2026-06-20T06:34:56Z by root Codex agent on branch `codex/scoped-realm-user-data`.

Start commit: `dd1b04c`.

Mutable surface:

- `docs/workstreams/backlog/playlist-mobile-ux/plan.md`
- `docs/workstreams/backlog/playlist-mobile-ux/ledger.md`
- root AutoPlan board/progress entries

Goal:

Promote the previously thin playlist UX placeholder into a concrete UX execution contract without implementing screens before product copy and flow decisions are made.

Result:

- Defined source contracts from the server/mobile design doc.
- Captured current foundation status and remaining blockers.
- Added a UX rubric aligned with the existing app.
- Added screen map for My Library, playlist detail, add-to-playlist, edit/reorder, sharing/follow/clone, and invitations.
- Split UI implementation into five scoped slices.
- Added open grill-me prompts for the decisions that block polished UI.

Validation:

- docs-only review
- `git diff --check`

Next action:

Ask the open UX questions, then implement `MOB-UX-001` only after the read-only playlist/library surface decisions are clear.

## MOB-UX-001A - playlist read and hydration service foundation

Status: completed 2026-06-20T18:54:00Z by root Codex agent on branch `codex/scoped-realm-user-data`.

Start commit: `2dbc960`.

Mutable surface:

- `relisten/user_library/playlist_read.ts`
- `relisten/user_library/playlist-read.test.ts`
- root AutoPlan/workstream docs

Goal:

Add the non-UI service boundary needed by read-only playlist screens: direct playlist reads through the user-library client, mobile-grant header selection, snapshot application through the existing sync applier, and a conservative catalog hydration planner that reports missing active source-track UUIDs without inventing partial catalog rows.

Result:

- Added `getUserLibraryPlaylist()` for `GET /api/v3/library/playlists/{playlistUuidOrShortId}` using existing no-store user-library client behavior.
- Added deterministic scope-bounded mobile-grant header selection for playlist reads using scoped grant metadata plus SecureStore-backed secrets.
- Added `applyReadUserLibraryPlaylistSnapshot()` as a thin wrapper around `applyUserLibraryPlaylistSnapshot()` so direct reads and pull sync share persistence behavior.
- Added a pure `playlistCatalogHydrationPlan()` that separates playable, missing, unavailable, and deleted playlist entries and deduplicates missing source-track UUIDs.
- Avoided importing catalog model classes in the service test path; Realm source-track checks use the schema name to keep Vitest out of React Native Flow sources.

Validation:

- `yarn test -- playlist-read`
- `yarn lint`
- `yarn ts:check`
- `git diff --check`
- explorer subagent `019ee65d-a09e-70b2-9946-dc71b2a8040f` confirmed this should reuse `applyUserLibraryPlaylistSnapshot`, `buildMobileAccessGrantHeaders`, and a pure hydration planner until the server returns richer catalog hydration data.
- reviewer subagent `019ee661-4da1-74b1-b80d-5be7259b518f` found missing scope filtering for mobile grant selection and a misleading Realm write contract; fixes require the active `scopeId`, added mixed-scope coverage, and made `applyReadUserLibraryPlaylistSnapshot()` own its write transaction.

Next action:

continue. Wire this service into `MOB-UX-001` after the read-only playlist/library UX decisions are settled.
