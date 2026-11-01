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
the release default. Venue and song destination screens remain outside this
pilot.

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
  and selected-year detail routes. Delete snapshot-only wire, apply, Realm, and
  test code.
- [x] (2026-11-01) Ran focused and full automated checks, then repeated the real
  artist -> years -> year -> show -> source journey on iPhone 17. Record the
  final counts and commit hashes here.

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
- Removing one large request does not order writes from different remaining
  query keys. Selected-year and show-detail responses can both update shared
  `Show` summary fields. An older full-show response could also reactivate a
  show that a newer selected-year membership omitted, and embedded year data
  can similarly overlap the years list. Same-query fencing still applies, but
  this correction does not claim to solve cross-query ownership ordering.
- RocketSim network conditioning was unavailable during the first review. The
  offline restart instead used Always Offline Mode and an unreachable loopback
  catalog origin. That proved catalog independence and local-file playback,
  not system-wide radio loss.

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
  of the combined endpoint as a fix for cross-query shared-entity races. Record
  a reproduced overlap separately if one affects this journey.

## Outcomes & Retrospective

The server correction is complete. `GET /api/v4/artists/{artistId}/catalog`
returns 404, its DTO and dedicated reader are deleted, and Swagger exposes the
smaller collection and detail routes. The existing years, selected-year, show,
source, and track response contracts and validators did not change.

The first native review established these behaviors, which the corrected route
implementation must preserve:

- `Mama Tried -> Me And My Uncle` remained one row, one queue item, and one
  playable file. Both normalized parts remained internal.
- Switching sources changed the source UUID, Archive.org URL, queue, and public
  player title.
- `Beat/It/On/Down/The/Line#` kept its imported title while retaining an
  unresolved normalized part internally. Its download matched MD5 and used
  `offline/eb36cd68-6ff7-7ee2-d064-eade0285b785.mp3`.
- With the catalog origin set to unreachable `127.0.0.1:9`, cold launch restored
  that track and its 10.230-second checkpoint in a stopped, ready-to-play state.
  An explicit Play resumed the UUID-named local file.
- A raw Spafford show used the same track-row presentation and played imported
  track `High Beams` without normalization.

The corrected mobile implementation deletes the full-snapshot DTO, Realm
models, apply/freshness code, and snapshot-only tests. Realm schema 19 removed
those development-only types and only the legacy full-catalog query state; the
existing simulator database opened with its player state intact.

The final automated pass ran 48 files and 324 tests successfully. `yarn
ts:check`, `yarn lint`, and `git diff --check` also passed. The retained iPhone
17 then issued this sequence while navigating real screens:

- `GET /artists/artist_3qmp7zjbg1rpebhtyfy43096vj/years`
- `GET /artists/artist_3qmp7zjbg1rpebhtyfy43096vj/years/year_59t8nz8n0m6e4c2ej2aq9dbkb9`
- `GET /shows/show_0g6k9yvhk8v3ewbmxewrz0dby1`, only after selecting
  an uncached show

No `/catalog` request occurred. Selecting source 1 opened its 22 imported track
rows. `Feel Like A Stranger` became the public player title and played; the row
had no listener-facing normalization subtitle. The RocketSim live preview was
`http://127.0.0.1:4996/?token=8901ea4a7975421a9af5b56deca04301`.
The earlier offline/download/source-switching evidence was not repeated because
this correction did not change their identities or player code; schema and
apply regressions retained that coverage.

The corrected catalog implementation is commit `d90c779`; the listener-facing
track-row cleanup is commit `4205563`. This plan record is committed separately
after those implementation commits.

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
   routes. Keep v3 methods and DTOs unchanged for configured fallback.
6. Prove route identity, endpoint-local replacement, atomic ETag apply, damaged
   cache recovery, imported identity preservation, and the absence of a
   `/catalog` request. Then repeat the real iPhone 17 browsing and playback
   journey.

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
- payload, endpoint membership, and ETag commit or roll back together;
- a 304 is accepted only with matching applied state and usable local data;
- manual refresh bypasses freshness, reconnect retries failure, and an older
  same-query completion cannot overwrite a forced refresh;
- shallow normalized references retain richer aliases and counts;
- migration preserves raw imported keys, download state/path, queue/checkpoint,
  history links, and typed account/library identities;
- configured v3 still uses the legacy client; and
- transport parsing no longer makes a second UTF-8 copy solely to count bytes.

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
endpoint can retry. Switching the configured transport back to v3 uses existing
paths and does not delete normalized rows.

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
contract is in `RelistenApi` commit `802e461df` on
`codex/v4-native-recordings`.
