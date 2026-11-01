# Prove the v4 catalog through the existing mobile player

This ExecPlan is a living document. Keep Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective current while the pilot is built.

## Purpose / Big Picture

The pilot must load a v4 artist snapshot, open a show, switch sources, and play
the returned files through the existing Realm graph and player. It must preserve
the imported UUIDs that name downloads, queue entries, and playback history.
Normalized venue, song, and track interpretation data is additive: imported
venue labels and track titles remain the facts shown during playback.

A reviewer should be able to run the local v4 API, opt the development app into
the v4 transport, and exercise Grateful Dead's interpreted and partial tracks
plus a raw Spafford show. The same downloaded track must play after an offline
cold restart. This work stops after that C3 journey; it does not add the C5
venue/song destinations or activate v4 for a release.

## Progress

- [x] (2026-10-31) Read the current API handoff, qualification, endpoint
  manifest, contracts, and C3 review checkpoint.
- [x] (2026-10-31) Mapped the current v2/v3 client, Realm schema 17,
  timestamp-guarded repositories, account generation fence, player queue, and
  native artist-to-source journey.
- [ ] Add v4 wire identities, transport selection, conditional GET handling,
  request fences, and reconnect retry.
- [ ] Add schema 18 normalized overlays, owned artist-snapshot membership, and
  applied-query state without changing imported primary keys.
- [ ] Apply artist/show/source/track responses and their validators atomically,
  with focused correction, rollback, stale-result, fallback, and migration
  tests.
- [ ] Add the small track-interpretation review surface while retaining the
  imported title and one-file queue behavior.
- [ ] Measure the real 2,081-show Grateful Dead snapshot and complete the
  iPhone 17 normalized/raw/source-switch/playback/offline-restart journeys.
- [ ] Simplify the changed code, run the full checks, record evidence, and stop
  at Alec's C3 review checkpoint.

## Surprises & Discoveries

- Observation: `ThrottledNetworkBackedBehavior` declares a 15-minute default,
  but the current executor never calls its freshness predicate. The legacy
  client's one-hour cooldown is the effective lower-level guard. V4 therefore
  needs to enforce its own persisted 15-minute check.
- Observation: the legacy client stores its synthetic validator before Realm
  repositories apply the payload. Reusing that path would allow a failed apply
  to commit a validator and would attempt to parse a bodyless 304.
- Observation: the full Grateful Dead snapshot contains 2,081 shows but no
  recording hierarchy. Show/source/track detail can remain lazy without another
  repository family.
- Observation: the existing source screen and queue already expose public
  subscriber-visible playback state. A normalization summary under the imported
  track title is enough for C3 review; the player does not need a new identity.

## Decision Log

- Decision: keep v3 as the default transport and select v4 explicitly with
  `EXPO_PUBLIC_RELISTEN_CATALOG_TRANSPORT=v4`. Rationale: C3 is a local pilot,
  and merging its storage support must not itself activate release traffic.
  The configured catalog origin remains pathless and keeps its existing HTTPS
  validation. Date/Author: 2026-10-31, Codex.
- Decision: add one v4 coordinator with explicit methods for artist list,
  artist catalog, show, source, and track. Rationale: those five ownership
  policies cover the pilot and share the real ETag/freshness/fencing boundary;
  a manifest-driven sync engine would add scope without helping C3.
- Decision: store exact artist-owned memberships in one additive
  `ArtistCatalogSnapshot` row and store normalized resources separately.
  Rationale: omitted snapshot members must not physically delete UUID rows that
  downloads, queues, history, favorites, or other queries still reference.
- Decision: update returned imported objects authoritatively in place rather
  than manufacturing timestamps or passing v4 through v3 DTOs. Rationale: a
  normalization-only correction may leave imported timestamps unchanged, while
  in-place UUID updates preserve all player and offline identities.
- Decision: a configured v4 failure does not silently fall through to v3 for
  the same request. Rationale: automatic per-request mixing would weaken
  response ownership and validator guarantees. The whole transport remains
  selectable so the upgraded build can run entirely on v3.

## Outcomes & Retrospective

Pending implementation and native review.

## Context and Orientation

`relisten/api/client.ts` is the existing v2/v3 client. It computes timestamp
hashes, writes `UrlRequestMetadata`, and applies a one-hour cooldown. V4 code
will live under `relisten/api/v4/` and will not use that metadata path.

`relisten/realm/schema.ts` owns the single Realm configuration. Imported
artists, years, shows, venues, songs, sources, sets, and tracks use raw UUID
string primary keys. `SourceTrackOfflineInfo`, `PlayerState`, and
`PlaybackHistoryEntry` point at those same keys or managed objects. Schema 18
must add models and optional links without reminting or deleting any of them.

`relisten/realm/models/artist_repo.ts`, `year_repo.ts`, and `show_repo.ts`
currently feed the existing screens. The pilot will keep those hooks and make
their network step select the v4 coordinator when configured. Realm streams then
publish the coordinator's transaction without a parallel feature repository.

The current UI path is Artists -> artist years -> year shows -> source picker ->
source tracks. `SourceTrack` becomes the existing `PlayerQueueTrack`; its UUID
also determines `offline/<uuid>.mp3`. The only C3 presentation change belongs in
the current source-track row.

## Plan of Work

1. Define the v4 wire resources used by the five pilot reads. Decode UUID-backed
   `artist_`, `year_`, `show_`, `tour_`, `imported_venue_`, `imported_song_`,
   `source_`, `source_set_`, and `track_` IDs at the adapter. Preserve short
   `venue_`, `song_`, and `artist_venue_` values.
2. Add an injected-fetch transport and one coordinator. The coordinator owns
   exact query keys, 15-minute freshness, matching `If-None-Match`, bodyless
   304 recovery, same-query sequence fences, transport/account generation
   fences, and active-query reconnect retries. It invokes one Realm transaction
   for payload, owned membership, and ETag.
3. Add `CatalogQueryState`, `ArtistCatalogSnapshot`, normalized venue/song and
   artist-venue rows, and embedded track normalization. Full snapshot lists
   replace only their artist owner. Full show/source responses replace only
   returned source/set/track membership. Shared normalized entities and compact
   references patch supplied fields.
4. Select v4 from the existing artist/year/show behaviors. Keep all legacy
   methods and DTOs for configured v3 fallback. Render ordered interpretation
   beneath the imported track title, including partial/unresolved state, without
   adding navigation or changing queue construction.
5. Prove identity-preserving schema migration and the apply failure modes in
   Vitest. Then measure the real snapshot and use RocketSim on the retained
   iPhone 17 for interpreted, partial, raw, source-switch, playback, download,
   cold-restart, and offline playback evidence.

## Concrete Steps

Run all commands from `/Users/alecgorge/code/relisten/relisten-mobile` and begin
shell validation with `nvm use`.

Focused checks during implementation:

    yarn vitest run relisten/api/v4 relisten/realm/v4_catalog_apply.test.ts relisten/realm/migrations/v4_catalog_migration.test.ts

Final checks:

    yarn test
    yarn ts:check
    yarn lint

For simulator review, keep the already-running API on port 43823 and start Metro
without restarting or reseeding that API:

    EXPO_PUBLIC_RELISTEN_CATALOG_ORIGIN=http://127.0.0.1:43823 EXPO_PUBLIC_RELISTEN_CATALOG_TRANSPORT=v4 npx expo start --dev-client

Use the retained iPhone 17 simulator
`063F4104-44E5-480E-94DD-847C0D024D4D`. The change is TypeScript/Realm schema
only, so first try the installed development client; rebuild that same simulator
only if the installed native bundle cannot open schema 18 or lacks the current
JavaScript runtime.

## Validation and Acceptance

Automated evidence must show:

- typed UUID decoding is lossless and short normalized IDs stay strings;
- a normalization-only payload updates the overlay with unchanged imported
  timestamps and does not change the imported title;
- payload, exact owned membership, and ETag either all commit or all roll back;
- a 304 is accepted only with its matching applied state and local graph;
- manual refresh bypasses 15-minute freshness, and reconnect retries a failure;
- older same-query, transport-generation, and account-generation completions do
  not write;
- shallow normalized references retain richer aliases/counts/detail;
- schema 17 -> 18 preserves raw keys, download state/path, queue/checkpoint,
  history links, and typed account/library identities;
- configured v3 still uses the legacy client and leaves additive v4 rows intact.

Native evidence must show:

- Grateful Dead `show_2jn80dqf5ntfxmmkwx11j27gdk`, source
  `source_2wwgekk9qbskw2gp5v68znz9pa`, and medley
  `track_3s1y1rg4yaxa7nqw31wk617b0d` as one playable item with two parts;
- partial `track_7b6v6pgvzqfvhd0s7avr18bdw5` through its returned show/source,
  with the unresolved middle part and imported title intact;
- raw Spafford `show_3pdmj761gph53bb7ad3db8v4x4` browses and plays with
  disabled normalization;
- source switching changes the selected recording and public player state shows
  the selected imported track title;
- after downloading the partial track, terminating the app, disabling network,
  and relaunching, the retained file plays and queue/history restore by UUID;
- the real Grateful Dead snapshot's download, parse, apply, and row-count
  measurements are recorded with their limitations.

## Idempotence and Recovery

The API review database is read-only for this work. Do not restart, reseed,
recalculate, import, or run workers. Correction behavior uses disposable local
test fixtures only.

Realm schema 18 is additive. Reopening repeats guarded existing migrations and
must leave the same objects. A failed v4 transaction keeps the old ETag and
complete graph; the same request can be retried. Switching the configured
transport back to v3 uses the existing paths and does not delete normalized rows.

RocketSim network conditioning must be turned off after offline review. No EAS,
OTA, TestFlight, production mutation, force push, or PR is part of this plan.

## Artifacts and Notes

Record final focused/full test counts, snapshot timing/size, RocketSim live
preview URL, and any native limitations in Outcomes & Retrospective. Keep the
two pre-existing untracked documents outside every commit.

## Interfaces and Dependencies

The pilot depends on the existing `Realm`, `@realm/react`, NetInfo, Expo dev
client, and global fetch implementation. It adds no cache, query library,
database engine, player engine, or server route. The API contract is the native
v4 endpoint set documented in the sibling `RelistenApi` checkout at
`codex/v4-native-recordings` commit `8c119a9ae`.
