# Prove the v4 catalog through the existing mobile player

This ExecPlan is a living document. Keep Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective current while the pilot is built.

## Purpose / Big Picture

The pilot must follow the app's existing browsing journey without downloading an
artist's entire catalog. It loads artists, one artist's years, one selected
year's show summaries, and then the selected show's recording detail. Source and
track detail remain available for direct use, but venue, song, tour, and era
collections load only when a screen needs them. Navigation must not replace the
removed full-artist request with an eager fan-out across those lists.

The mobile adapter must preserve the imported UUIDs used by downloads, queue
entries, playback history, favorites, and routes. Normalized venue, song, and
track data remains additive and internal. Browsing and playback continue to show
imported venue labels and track titles.

A reviewer should be able to opt the development app into v4 and follow Artists
-> Grateful Dead -> years -> 1985 -> show -> source -> playable track. The same
downloaded track must remain playable after an offline cold restart. V3 remains
the release default. After accepting that checkpoint, the work now continues
with on-demand venue and song destinations plus global canonical venue
favorites; those screens must reuse the same endpoint-local ownership model.

## Progress

- [x] (2026-10-31) Added typed v4 identities, an explicit transport, conditional
  GET handling, 15-minute freshness, same-query fencing, and reconnect retry.
- [x] (2026-10-31) Added normalized Realm overlays without changing imported
  primary keys, offline filenames, queue entries, history, or favorites.
- [x] (2026-10-31) Kept track normalization internal after native review. Track
  rows show one imported title and its duration, without `Interpreted`,
  `Partial interpretation`, or a duplicate normalized title.
- [x] (2026-10-31) Verified playback, source switching, download, and offline
  restore on the retained iPhone 17 against the first pilot implementation.
- [x] (2026-11-01) Confirmed the corrected API contract. The combined
  `/artists/{artistId}/catalog` route and its dedicated server implementation
  are removed.
- [x] (2026-11-01) Replaced the mobile full-artist request with the years list
  and selected-year detail routes. Deleted snapshot-only wire, apply, Realm, and
  test code.
- [x] (2026-11-01) Repeated the real artist -> years -> year -> show -> source
  journey and source switching on the retained iPhone 17 after the overlap fix.
  Source 2 exposed distinct transfer metadata and track ordering, and playback
  changed to its `Tuning` track without a normalization-status label.
- [x] (2026-11-01) Repeated the downloaded-track cold restart with Always
  Offline Mode and catalog origin `127.0.0.1:9`. Cached UI rendered immediately,
  restored `Beat/It/On/Down/The/Line#` stopped at 16 seconds, and explicit Play
  advanced the UUID-named local MP3 to 26 seconds. Restored normal mode and the
  review origin afterward.
- [x] (2026-11-01) Added mixed venue browse/detail, mixed song browse/detail
  with lazy matched recordings, and a separate My Library Venues destination
  for global canonical venue favorites. The pre-cutover v3 path remains, with
  no v4-to-v3 rollback support, and no eager artist-wide fan-out was added.

## Surprises & Discoveries

- `ThrottledNetworkBackedBehavior` declares a 15-minute default, but its
  executor does not call the freshness predicate. The v4 coordinator therefore
  owns a persisted 15-minute freshness check.
- The legacy client writes its synthetic validator before Realm repositories
  apply a payload. V4 cannot reuse that path because a failed apply must not
  commit its validator, and a bodyless 304 must not be parsed as JSON.
- The earlier API handoff prescribed one full-artist response. The corrected
  server contract deliberately has no combined artist-catalog endpoint. Each
  collection has its own route and replacement boundary.
- The corrected Grateful Dead years response is 8,760 bytes. The selected 1985
  response is 181,598 bytes. The removed full-artist response was historically
  6,984,020 bytes. The comparison explains the route correction; the removed
  response is not part of the mobile performance target.
- The server replay compared 12 collection/detail responses before and after
  removing the combined route. Their bodies and ETags were byte-identical, and
  all 12 conditional reads returned bodyless 304 responses.
- Artist and year routes can mount before their parent artist bootstrap
  finishes. Both artist-owned v4 reads now coalesce with that bootstrap and
  force it once only if the parent is still missing or tombstoned.
- Removing one large request does not order writes from different query keys. A
  reproduced older selected-year response overwrote a newer full-show rating;
  the still-valid show ETag then returned 304 and made the stale value durable.
  The client now drops only the affected show-detail validator, so the next show
  read repairs that shared row. Other cross-query ownership questions remain
  outside this narrow fix.
- RocketSim network conditioning was unavailable during the first review. The
  offline restart instead used Always Offline Mode and an unreachable loopback
  catalog origin. That proved catalog independence and local-file playback,
  not system-wide radio loss.
- A shared normalized venue or song can arrive through browse and detail routes.
  Invalidating detail on every compact upsert created a download loop. The
  writer now invalidates only when a compact field it owns changes; unchanged
  second opens make no song or recording request.
- An active canonical song favorite may hydrate into an empty Realm that does
  not yet contain its artist. Favorite hydration now performs the existing
  artist bootstrap once, rechecks the captured account, and then applies the
  song patch without changing membership.
- Canonical venue and song detail routes do not preserve the requested ID across
  a merge. They return the survivor. A strict mobile route-ID check would reject
  a valid response: the review API returns `venue_jjc2sxek` for the retained
  alias `venue_e9z3ebnb`. UUID-backed imported and playback routes still require
  exact identity.
- An applied query flag alone is not proof that its cached projection is intact.
  Empty cached lists remain usable offline, but refresh errors are suppressed
  only when the root and every exact query member still project successfully.
- TypeScript and ESLint did not catch two React Compiler constraints: a
  conditional default hook argument and memo dependencies the compiler could
  not preserve. The native Metro pass did; both hooks now derive defaults in
  their bodies and the unnecessary projection memos are gone.

## Decision Log

- Decision: keep v3 as the default and select v4 only with
  `EXPO_PUBLIC_RELISTEN_CATALOG_TRANSPORT=v4`. The pilot must not activate
  release traffic by merging its storage support. Date/Author: 2026-10-31,
  Codex.
- Decision: use `GET /artists`, `GET /artists/{artistId}/years`, and
  `GET /artists/{artistId}/years/{yearId}` for navigation. Fetch the selected
  show through `GET /shows/{showId}`. Do not call every artist collection during
  artist or year navigation. Date/Author: 2026-11-01, Alec.
- Decision: each complete endpoint replaces only its own membership, including
  an empty list. The years endpoint owns that artist's year membership; year
  detail owns that year's show membership; full show/source responses own only
  their returned recording children. Retain imported rows and richer recording
  data needed by offline playback, favorites, history, and other queries.
  Date/Author: 2026-11-01, Alec.
- Decision: persist the payload, endpoint membership, and ETag in one Realm
  transaction. A failed fetch or apply keeps the previous graph and validator.
  Do not add artist-wide invalidation or a generic synchronization framework.
  Date/Author: 2026-11-01, Alec.
- Decision: reject detail responses whose top-level artist, year, show, source,
  or track identity does not match the requested route. Reuse a validator only
  while the matching local response remains usable.
- Decision: update returned imported objects in place. Normalization-only
  corrections may retain imported timestamps, while stable UUID keys preserve
  player and offline identity.
- Decision: keep normalization state and parts out of the source-track row. The
  imported title is the listener-facing label. Realm may retain normalization
  for catalog behavior and future screens with a defined listener need.
- Decision: retain per-query same-request fencing. Do not describe the removal
  of the combined endpoint as a general fix for cross-query shared-entity races.
  When a selected-year response rewrites a returned show summary, invalidate
  only that show's detail validator in the same transaction. Do not add a
  dependency graph, global revision, or broad invalidation framework.
- Decision: venue and song browse screens consume the server's mixed canonical
  and imported entries in returned order. The client does not choose entry type
  from normalization state or artist feature flags. Detail and matched-track
  collections load only after their destination is opened. Date/Author:
  2026-11-01, Alec.
- Decision: canonical venue favorites use the global `venue_` identity and a
  separate My Library Venues destination. They do not imply artist, year, or
  show favorites. Imported venue favorites keep their existing artist-scoped
  behavior. Date/Author: 2026-11-01, Alec.
- Decision: canonical song matches are navigation metadata, not replacement
  listener labels. Browse/detail may show the canonical song, but recording rows
  keep the imported track title and navigate through the existing source route
  for queue and playback ownership. Date/Author: 2026-11-01, Alec.
- Decision: keep mixed browse order in each endpoint's existing
  `CatalogQueryState.resultIds`. Do not add venue/song browse Realm models,
  redirect tables, or a generic invalidation graph. Date/Author: 2026-11-01,
  Alec and Codex.
- Decision: keep canonical venue favorites in the existing account-scoped
  `UserFavorite` model. Hydration may patch available or redirected metadata,
  but unavailable or retired results do not remove or rewrite the exact saved
  target. Date/Author: 2026-11-01, Alec and Codex.
- Decision: canonical detail reads accept a returned merge survivor and validate
  the response's internal artist, venue, show, source, and song relationships.
  Exact requested-ID checks remain only on identity-preserving UUID routes.
  Date/Author: 2026-11-01, Codex.
- Decision: rollout is one-way. Retain v3 only as the pre-cutover path while the
  pilot is disabled; once an install uses v4, it is not required to switch back
  to v3. Do not add reverse-transition routing or cache compatibility branches.
  Date/Author: 2026-11-01, Alec.

## Outcomes & Retrospective

The server correction is complete. `GET /api/v4/artists/{artistId}/catalog`
returns 404, its DTO and dedicated reader are deleted, and Swagger exposes the
smaller collection and detail routes. The existing years, selected-year, show,
source, and track response contracts and validators did not change.

The native reviews established these behaviors, which later catalog screens must
preserve:

- `Mama Tried -> Me And My Uncle` remained one row, one queue item, and one
  playable file. Both normalized parts remained internal.
- Switching sources changed the source UUID, Archive.org URL, queue, and public
  player title.
- `Beat/It/On/Down/The/Line#` kept its imported title while retaining an
  unresolved normalized part internally. Its download matched MD5 and used
  `offline/eb36cd68-6ff7-7ee2-d064-eade0285b785.mp3`.
- With the catalog origin set to unreachable `127.0.0.1:9`, the final cold
  launch rendered cached content and the offline banner without a blocking
  loader. It restored that track at 16.352 seconds in a stopped, ready-to-play
  state. Explicit Play advanced to 26 seconds from
  `offline/eb36cd68-6ff7-7ee2-d064-eade0285b785.mp3`.
- A raw Spafford show used the same track-row presentation and played imported
  track `High Beams` without normalization.

The corrected mobile implementation deletes the full-snapshot DTO, Realm
models, apply/freshness code, and snapshot-only tests. Realm drops the
development-only types when schema 20 opens. No explicit migration remains for
the obsolete full-catalog query state because current code cannot address that
unreleased endpoint key.

The final automated pass ran 50 files and 335 tests successfully. `yarn
ts:check`, `yarn lint`, and `git diff --check` also passed. Before the final
overlap fix, the retained iPhone 17 issued this sequence while navigating real
screens:

- `GET /artists/artist_3qmp7zjbg1rpebhtyfy43096vj/years`
- `GET /artists/artist_3qmp7zjbg1rpebhtyfy43096vj/years/year_59t8nz8n0m6e4c2ej2aq9dbkb9`
- `GET /shows/show_0g6k9yvhk8v3ewbmxewrz0dby1`, only after selecting
  an uncached show

No `/catalog` request occurred. Selecting source 1 opened its 22 imported track
rows. `Feel Like A Stranger` became the public player title and played; the row
had no listener-facing normalization subtitle. The RocketSim live preview was
`http://127.0.0.1:4996/?token=8901ea4a7975421a9af5b56deca04301`.
The post-fix C3 review repeated source switching and the existing-file offline
cold restart. Its RocketSim screenshots are
`/tmp/relisten-c3-source-switch.png`,
`/tmp/relisten-c3-offline-restored.png`, and
`/tmp/relisten-c3-offline-playing.png`. The live preview was
`http://127.0.0.1:4996/?token=d34dd9d6ccc549b9999ccaa1ca4dfa76`.
Always Offline Mode proves catalog independence and local-file playback; it does
not disable the simulator's radio.

The corrected catalog implementation is commit `d90c779`; the listener-facing
track-row cleanup is commit `4205563`; the overlap repair is `4456a60`; and the
final scaffolding deletion is `097ea26`. C3 is accepted. Venue, song, and venue
favorite implementation continued from that checkpoint and is commit
`912d580`.

The follow-on native pass established the completed feature behavior:

- Grateful Dead venue browse returned 544 mixed entries. Artist-scoped Red Rocks
  detail showed 20 shows; the global My Library detail showed 176 shows grouped
  across artists. Favoriting and removing Red Rocks changed the venue library
  only; the two existing show favorites were unchanged.
- Imported venue fallback remained separate. Opening `Ace's Studio` showed its
  imported name, locality, one-show membership, and ordinary artist-scoped
  favorite action.
- Grateful Dead song browse returned 547 ordered mixed entries: 402 canonical
  songs and 145 imported songs. Imported `(I'm A) Road Runner` detail showed its
  two shows without a canonical recordings action.
- Canonical `China Cat Sunflower` showed 567 shows and exposed its 4,459 matched
  recordings only after the recordings destination opened. Rows used imported
  track titles, dates, imported venue labels, and duration; no normalization
  status appeared.
- Selecting `China Cat Sunflower \\>` opened the exact 1968-01-17 source and
  started that imported track. The source page and mini-player retained the
  imported title. The clean screenshot is
  `/tmp/relisten-c5-song-recording-playing-clean.png`.
- Joe Russo's Almost Dead has the legacy `songs` feature disabled, but its v4
  Songs action remained enabled and opened 307 canonical songs.

The live RocketSim preview for this pass is
`http://127.0.0.1:4996/?token=d34dd9d6ccc549b9999ccaa1ca4dfa76`.

The catalog transport is selected once when `RelistenApiClient` is constructed.
There is no runtime switch, reverse migration, or v4-to-v3 cache adapter. The
remaining dual repository branches exist only while the unreleased pilot is
opted in; after the one-way cutover, the v3 catalog branch can be deleted in a
separate cleanup.

## Context and Orientation

`relisten/api/client.ts` is the existing v2/v3 client and the bridge to the v4
coordinator. V4 transport and route ownership live under `relisten/api/v4/`.
`CatalogQueryState` stores the ETag, freshness timestamps, retry state, and
ordered result UUIDs for one exact endpoint.

`relisten/realm/models/artist_repo.ts`, `year_repo.ts`, and `show_repo.ts` feed
the existing screens. The v4 branch of those repositories must update Realm;
Realm streams then publish the result without a parallel repository family.

Imported artists, years, shows, venues, songs, sources, sets, and tracks use raw
UUID string primary keys. `SourceTrackOfflineInfo`, `PlayerState`, and
`PlaybackHistoryEntry` refer to those keys or managed objects. Schema changes
must not remint or delete imported identities.

The authoritative API loading rules are in the sibling checkout:

- `docs/plans/active/2026-10-29-v4-api/review/mobile-handoff.md`
- `docs/plans/active/2026-10-29-v4-api/contracts.md#load-collections-as-needed`
- `docs/plans/active/2026-10-29-v4-api/endpoints.json`

## Plan of Work

1. Replace the full-artist wire type and client method with a year list resource
   and a year-with-shows resource. Use the typed year-ID route because the
   existing year screen already has that identity.
2. Apply the years list by upserting returned years and replacing only that
   artist's active year membership. Apply selected-year detail by upserting the
   year and show summaries and replacing only that year's active show
   membership. Preserve richer show/source/set/track and offline objects.
3. Remove full-snapshot-only DTOs, Realm models, mapping helpers, freshness
   checks, tests, and migration assertions. Keep shared artist, year, show,
   venue, tour, normalized-song, source, and track mapping code.
4. Remove the diagnostic UTF-8 copy used only to calculate response body bytes.
   Keep download, parse, total, and apply timing where those measurements do not
   require copying the response.
5. Point the existing years and selected-year repositories at their matching v4
   routes. Leave v3 methods and DTOs unchanged for the pre-cutover release; do
   not add a path back to them after v4 is enabled.
6. Prove route identity, endpoint-local replacement, atomic ETag apply, damaged
   cache recovery, imported identity preservation, and the absence of a
   `/catalog` request. Then repeat the real iPhone 17 browsing and playback
   journey.
7. Project venue and song browse entries from exact ordered query membership,
   retaining separate canonical and imported route identities without new
   browse tables.
8. Load artist venue, global venue, imported venue, canonical song, imported
   song, and canonical recording detail only when opened. Preserve cached empty
   results while exposing damaged-cache refresh failures.
9. Reuse account-scoped favorites for canonical venue membership and hydrate
   missing metadata through the existing resolver without changing exact saved
   targets.
10. Prove mixed browsing, global venue favorites, lazy recordings, exact-track
    playback, imported labels, and canonical redirects on the retained
    simulator and real review API.

## Concrete Steps

Run commands from `/Users/alecgorge/code/relisten/relisten-mobile` and begin
shell validation with `nvm use`.

Focused checks during implementation:

    yarn vitest run relisten/api/v4 relisten/realm/v4_catalog_apply.test.ts relisten/realm/migrations/v4_catalog_migration.test.ts

Final checks:

    yarn test
    yarn ts:check
    yarn lint
    git diff --check

For simulator review, use the API on port 43823 and start Metro with:

    EXPO_PUBLIC_RELISTEN_CATALOG_ORIGIN=http://127.0.0.1:43823 EXPO_PUBLIC_RELISTEN_CATALOG_TRANSPORT=v4 npx expo start --dev-client

Use the retained iPhone 17 simulator
`063F4104-44E5-480E-94DD-847C0D024D4D`. Reinstall the app on that simulator if
the schema correction requires fresh development data; do not create another
simulator.

## Validation and Acceptance

Automated evidence must show:

- no production mobile call or wire DTO refers to `/artists/{id}/catalog`;
- artist years use `/artists/{artistId}/years` and replace only that artist's
  year membership, including an empty result;
- selected-year shows use `/artists/{artistId}/years/{yearId}` and replace only
  that year's show membership;
- route artist/year mismatches commit neither payload nor ETag;
- selected-year summary refresh preserves source/set/track graphs, download
  state, and shows belonging to another year;
- an older selected-year response cannot leave a newer full-show correction
  hidden behind a stale detail validator;
- payload, endpoint membership, and ETag commit or roll back together;
- a 304 is accepted only with matching applied state and usable local data;
- manual refresh bypasses freshness, reconnect retries failure, and an older
  same-query completion cannot overwrite a forced refresh;
- shallow normalized references retain richer aliases and counts;
- migration preserves raw imported keys, download state/path, queue/checkpoint,
  history links, and typed account/library identities;
- pre-cutover configuration still uses the legacy client;
- transport parsing no longer makes a second UTF-8 copy solely to count bytes.
- venue and song browse preserve the server's ordered canonical/imported
  membership and do not refetch unchanged detail;
- canonical merge aliases open the returned survivor without weakening exact
  UUID route checks;
- applied-empty browse/detail remains visible after a stale offline refresh,
  while incomplete cached projections still surface repair failures; and
- canonical venue favorite hydration preserves exact membership across
  available, redirected, unavailable, and retired resolver results.

Native evidence must show:

- the app requests artist years, then only the selected year's show summaries,
  before requesting the selected show's detail;
- the Grateful Dead medley and partial track remain one playable imported item
  with no listener-facing normalization subtitle;
- source switching changes the selected recording and public player state;
- the raw Spafford show browses and plays without normalization; and
- downloaded playback and queue/checkpoint restoration still use imported UUIDs
  with the catalog origin unreachable.

## Idempotence and Recovery

The API review database is read-only for this work. Do not reseed, recalculate,
import, or run workers. Correction tests use disposable Realm files.

Reopening the current Realm schema must preserve imported and personal objects.
A failed v4 transaction keeps the prior ETag and complete graph, so the same
endpoint can retry. The configuration can remain on v3 before cutover. Once v4
is enabled, reverse transition to v3 is not a supported recovery path.

No broad ETag invalidation, generic sync engine, EAS build, OTA, TestFlight,
production mutation, force push, or PR is part of this plan.

## Artifacts and Notes

Record final focused/full test counts, corrected-route requests, schema result,
RocketSim preview URL, and native limitations in Outcomes & Retrospective. Keep
the two pre-existing untracked documents outside every commit.

## Interfaces and Dependencies

The pilot uses the existing `Realm`, `@realm/react`, NetInfo, Expo dev client,
and global fetch implementation. It adds no cache library, database engine,
player engine, server route, or generic synchronization layer. The corrected API
contract and public-request ownership are in `RelistenApi` commit `55ad6af1a` on
`codex/v4-native-recordings`.

## November 4 simplification execution

Alec approved the one-way mobile v4 cutover, removal of duplicate canonical song
memberships, and focused boundary tests. Keep conditional GETs, the 15-minute
freshness interval, transactional application, retries, and overlap repair.

Progress:
- [ ] Remove duplicate NormalizedSong lists; consolidate the unreleased v4 schema as 18.
- [ ] Make existing catalog repositories v4-only and wire remaining callers,
  including cold CarPlay, discovery, tours, date links, reviews and telemetry.
- [ ] Replace route-only assertions with successful payload/application checks.
- [ ] Verify migration, empty/offline membership, playback and source switching;
  run tests, TypeScript and lint, then review readability and simplicity.

The query's ordered result IDs own membership. Shared records retain playback
identity, downloads, queues, history and favorites. Do not add another cache or
eagerly load unrelated collections. The server's existing v2/v3 support remains
for older releases. This work changes the mobile build; it does not deploy it.

Alec clarified that v4 normalization storage has never shipped. Do not keep
migrations for intermediate pilot schemas18–20. Schema18 is the single final v4
addition above the account client's schema17. Keep the existing schema17 upgrade
preservation test. Reinstall the retained simulator app if its pilot database
uses an intermediate layout; no compatibility code is needed for that database.
