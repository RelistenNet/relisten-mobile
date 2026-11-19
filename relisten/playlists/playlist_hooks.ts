import { useMemo } from 'react';
import Realm from 'realm';
import { useObject, useQuery, useRealm } from '@/relisten/realm/schema';
import {
  Playlist,
  PLAYLIST_DEVICE_STATE_ID,
  PlaylistDeviceState,
  PlaylistCommand,
  PlaylistEntry,
  PlaylistOperation,
  PlaylistSegment,
  PlaylistTrackAvailability,
} from '@/relisten/realm/models/playlists/playlist';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import {
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';
import {
  orderedGroups,
  type EntryState,
  type PlaylistGroup,
  type SegmentState,
} from '@/relisten/playlists/playlist_operations';
import { formatUuidTypedId, parseUuidTypedId } from '@/relisten/util/typed_uuid_id';
import {
  contextOf,
  entryContext,
  entryStateOf,
  renderableDescription,
  segmentStateOf,
} from '@/relisten/playlists/guide/guide_rows';
import {
  type GuideTextContext,
  sanitizeGuideMarkdown,
} from '@/relisten/playlists/guide/guide_markdown';
import type { PlaylistSnapshotResponse } from '@/relisten/playlists/sync/playlist_wire';

export const trackIdForSourceTrack = (sourceTrack: Pick<SourceTrack, 'uuid'>) =>
  formatUuidTypedId('track', sourceTrack.uuid);

/**
 * The catalog track for an entry, following a recorded redirect, or null when it
 * hasn't been loaded onto this device yet.
 */
export function sourceTrackFor(realm: Realm, trackId: string): SourceTrack | null {
  const redirect = realm.objectForPrimaryKey(PlaylistTrackAvailability, trackId);
  const playableId =
    redirect?.status === 'redirected' && redirect.redirectTrackId
      ? redirect.redirectTrackId
      : trackId;
  const uuid = parseUuidTypedId(playableId, 'track');
  if (!uuid) {
    return null;
  }
  return renderable(realm.objectForPrimaryKey(SourceTrack, uuid));
}

/** Playlist rows read the show, source and artist, so a track without them can't render yet. */
function renderable(track: SourceTrack | null | undefined): SourceTrack | null {
  return track && track.deletedAt == null && track.show && track.source && track.artist
    ? track
    : null;
}

/**
 * What rows know about the catalog: which tracks are gone, and the track each
 * entry plays. Hooks build it from the live queries they watch, so rows are
 * rebuilt from exactly what changed; code outside React reads Realm directly.
 */
interface CatalogView {
  unavailable: ReadonlySet<string>;
  trackFor(trackId: string): SourceTrack | null;
}

function catalogViewOf(
  availability: Iterable<PlaylistTrackAvailability>,
  tracks: Iterable<SourceTrack>
): CatalogView {
  const byUuid = new Map([...tracks].map((track) => [track.uuid, track]));
  const redirects = redirectTargets(availability);
  return {
    unavailable: unavailableIds(availability),
    trackFor: (trackId) => {
      const uuid = parseUuidTypedId(redirects.get(trackId) ?? trackId, 'track');
      return uuid ? renderable(byUuid.get(uuid)) : null;
    },
  };
}

/**
 * The visible owner is the signed-in account, or the last one signed in on this
 * device. Lists show unowned playlists plus that owner's; another account's
 * playlists stay on the device, hidden until it signs in again.
 */
export function useVisibleLibraryUserId(): string | null {
  return useObject(PlaylistDeviceState, PLAYLIST_DEVICE_STATE_ID)?.lastSignedInUserId ?? null;
}

const VISIBLE = '(libraryUserId == null OR libraryUserId == $0)';

/** The playlists lists show, most recently edited first. Used by screens and CarPlay. */
export function visiblePlaylists(rows: Realm.Results<Playlist>, libraryUserId: string | null) {
  return rows
    .filtered(`${VISIBLE} AND deletedAt == null AND archived == false`, libraryUserId)
    .sorted('updatedAt', true);
}

export function usePlaylists() {
  const libraryUserId = useVisibleLibraryUserId();
  return useQuery(Playlist, (rows) => visiblePlaylists(rows, libraryUserId), [libraryUserId]);
}

/** The visible playlists the listener made, which are the ones music can be added to. */
export function useEditablePlaylists() {
  const libraryUserId = useVisibleLibraryUserId();
  return useQuery(
    Playlist,
    (rows) => visiblePlaylists(rows, libraryUserId).filtered('access == $0', 'owner'),
    [libraryUserId]
  );
}

/** Deleted device playlists (kept 30 days) and archived account playlists. */
export function useDeletedPlaylists() {
  const libraryUserId = useVisibleLibraryUserId();
  return useQuery(
    Playlist,
    (rows) =>
      rows
        .filtered(`${VISIBLE} AND (deletedAt != null OR archived == true)`, libraryUserId)
        .sorted([
          ['deletedAt', true],
          ['updatedAt', true],
        ]),
    [libraryUserId]
  );
}

/** The playlist, unless it belongs to an account other than the current one. */
export function usePlaylist(playlistId: string) {
  const owner = useVisibleLibraryUserId();
  const playlist = useObject(Playlist, playlistId);
  return playlist && (!playlist.libraryUserId || playlist.libraryUserId === owner)
    ? playlist
    : null;
}

/** `text` is a text block: it has no track and is never played, downloaded or loaded. */
export type PlaylistTrackStatus = 'playable' | 'loading' | 'unavailable' | 'text';

export interface PlaylistRowEntry {
  entry: EntryState;
  sourceTrack: SourceTrack | null;
  status: PlaylistTrackStatus;
  /** The description sanitized for rendering: a track's note or a text block's text. */
  descriptionMarkdown?: string;
}

export interface PlaylistRowGroup {
  segment: SegmentState;
  entries: PlaylistRowEntry[];
  /** The group's description, sanitized for rendering. */
  descriptionMarkdown?: string;
}

/** The catalog track IDs among entries, without text blocks. */
export function entryTrackIds(entries: Iterable<{ trackId?: string }>): string[] {
  return [...entries].flatMap((entry) => (entry.trackId ? [entry.trackId] : []));
}

/**
 * The fields rows display. Sync bookkeeping (the `canonical*` fields) is left
 * out so confirming an edit doesn't rebuild an open playlist; rows leaving or
 * joining the query always notify, whatever the key paths.
 */
const DISPLAYED_SEGMENT_FIELDS = [
  'segmentId',
  'rank',
  'live',
  'description',
  'descriptionMarkdown',
  'descriptionMarkdownKey',
];
const DISPLAYED_ENTRY_FIELDS = [...DISPLAYED_SEGMENT_FIELDS, 'entryId', 'trackId'];

/** The playlist's groups in order, with each entry's catalog track and whether it can play. */
export function usePlaylistGroups(playlistId: string): PlaylistRowGroup[] {
  const realm = useRealm();
  const segments = useQuery(
    {
      type: PlaylistSegment,
      query: (rows) => rows.filtered('playlistId == $0 AND live == true', playlistId),
      keyPaths: DISPLAYED_SEGMENT_FIELDS,
    },
    [playlistId]
  );
  const entries = useQuery(
    {
      type: PlaylistEntry,
      query: (rows) => rows.filtered('playlistId == $0 AND live == true', playlistId),
      keyPaths: DISPLAYED_ENTRY_FIELDS,
    },
    [playlistId]
  );
  const trackIds = useStableIds(entryTrackIds(entries));
  const { availability, tracks } = useCatalogTracks(trackIds);

  return useMemo(
    () => buildRowGroups(realm, segments, entries, catalogViewOf(availability, tracks)),
    [realm, segments, entries, availability, tracks]
  );
}

/**
 * The same IDs, as an array that only changes when the set does. The catalog
 * queries take it as a dependency, so a reorder or note edit keeps their
 * listeners instead of re-subscribing.
 */
function useStableIds(ids: Iterable<string>): string[] {
  const key = [...new Set(ids)].sort().join('\n');
  return useMemo(() => (key === '' ? [] : key.split('\n')), [key]);
}

/**
 * Groups for a public playlist that isn't stored on this device, read from its
 * snapshot. Guide text is sanitized here rather than stored; it updates as the
 * catalog loads its tracks, like a stored playlist's.
 */
export function useSnapshotRowGroups(
  segments: PlaylistSnapshotResponse['segments']
): PlaylistRowGroup[] {
  const realm = useRealm();
  const snapshot = useMemo(() => snapshotRows(segments), [segments]);
  const { availability, tracks } = useCatalogTracks(snapshot.trackIds);

  return useMemo(() => {
    const catalog = catalogViewOf(availability, tracks);
    return orderedGroups(snapshot.states).map((group) => ({
      segment: group.segment,
      descriptionMarkdown: snapshot.markdown(group.segment.segmentId, { kind: 'segment' }),
      entries: group.entries.map((entry) =>
        rowEntry(
          entry,
          catalog,
          snapshot.markdown(entry.entryId, entryContext(realm, entry.trackId))
        )
      ),
    }));
  }, [realm, snapshot, availability, tracks]);
}

/**
 * A snapshot's segments and entries as row states, its track IDs, and its
 * guide text. Rows rebuild each time a track loads, and sanitizing is the
 * costly step (about 5 ms per 2,000 characters), so each description is
 * sanitized once per context: a track note again only when its track's
 * duration becomes known.
 */
function snapshotRows(segments: PlaylistSnapshotResponse['segments']) {
  const descriptions = new Map<string, string>();
  const states = {
    segments: new Map<string, SegmentState>(),
    entries: new Map<string, EntryState>(),
  };
  const trackIds = new Set<string>();
  for (const segment of segments) {
    states.segments.set(segment.segment_id, { segmentId: segment.segment_id, rank: segment.rank });
    if (segment.description) {
      descriptions.set(segment.segment_id, segment.description);
    }
    for (const entry of segment.entries) {
      const state: EntryState = {
        entryId: entry.entry_id,
        segmentId: segment.segment_id,
        rank: entry.rank,
      };
      if (entry.track_id) {
        state.trackId = entry.track_id;
        trackIds.add(entry.track_id);
      }
      states.entries.set(entry.entry_id, state);
      if (entry.description) {
        descriptions.set(entry.entry_id, entry.description);
      }
    }
  }

  const sanitized = new Map<string, string>();
  const markdown = (id: string, context: GuideTextContext) => {
    const description = descriptions.get(id);
    if (!description) {
      return undefined;
    }
    const key = `${id}|${context.kind}|${context.kind === 'track' ? (context.durationSeconds ?? '') : ''}`;
    let result = sanitized.get(key);
    if (result === undefined) {
      result = sanitizeGuideMarkdown(description, context);
      sanitized.set(key, result);
    }
    return result;
  };

  return { states, trackIds: [...trackIds], markdown };
}

/**
 * The catalog records a playlist's rows read: availability for its tracks,
 * and the tracks themselves. Both are live queries, so rows rebuild as tracks
 * load and downloads finish.
 */
function useCatalogTracks(trackIds: string[]) {
  // Only this playlist's availability records, so a resolver write for another
  // playlist doesn't rebuild these rows. `checkedAt` changes on every recheck
  // without changing what rows show.
  const availability = useQuery(
    {
      type: PlaylistTrackAvailability,
      query: (rows) => rows.filtered('trackId IN $0', trackIds),
      keyPaths: ['status', 'redirectTrackId'],
    },
    [trackIds]
  );
  // Entries only hold IDs, so watch the catalog tracks rows actually render: the
  // redirect target when a recording moved, otherwise the entry's own track.
  const trackUuids = useStableIds(playableTrackUuids(trackIds, availability));
  // Rows read download status, soft deletion, and the show, source, and artist
  // links. Download progress is left out so ticks don't rebuild the playlist;
  // the row's download pie watches `percent` itself.
  const tracks = useQuery(
    {
      type: SourceTrack,
      query: (rows) => rows.filtered('uuid IN $0', trackUuids),
      keyPaths: [
        'uuid',
        'deletedAt',
        // The link itself changes when a download starts; its fields as it runs.
        'offlineInfo',
        'offlineInfo.status',
        'offlineInfo.type',
        'show',
        'source',
        'artist',
      ],
    },
    [trackUuids]
  );
  return { availability, tracks };
}

/** The same groups outside React, for CarPlay and other non-UI callers. */
export function readPlaylistRowGroups(realm: Realm, playlistId: string): PlaylistRowGroup[] {
  return buildRowGroups(
    realm,
    realm.objects(PlaylistSegment).filtered('playlistId == $0 AND live == true', playlistId),
    realm.objects(PlaylistEntry).filtered('playlistId == $0 AND live == true', playlistId),
    {
      unavailable: unavailableIds(realm.objects(PlaylistTrackAvailability)),
      trackFor: (trackId) => sourceTrackFor(realm, trackId),
    }
  );
}

function redirectTargets(availability: Iterable<PlaylistTrackAvailability>) {
  return new Map(
    [...availability]
      .filter((row) => row.status === 'redirected' && row.redirectTrackId)
      .map((row) => [row.trackId, row.redirectTrackId!])
  );
}

function playableTrackUuids(
  trackIds: string[],
  availability: Iterable<PlaylistTrackAvailability>
): string[] {
  const redirects = redirectTargets(availability);
  return [
    ...new Set(trackIds.map((id) => parseUuidTypedId(redirects.get(id) ?? id, 'track'))),
  ].filter((uuid): uuid is string => uuid !== null);
}

function unavailableIds(rows: Iterable<PlaylistTrackAvailability>): ReadonlySet<string> {
  return new Set([...rows].filter((row) => row.status === 'unavailable').map((row) => row.trackId));
}

function buildRowGroups(
  realm: Realm,
  segments: Iterable<PlaylistSegment>,
  entries: Iterable<PlaylistEntry>,
  catalog: CatalogView
): PlaylistRowGroup[] {
  const segmentRows = new Map([...segments].map((s) => [s.segmentId, s]));
  const entryRows = new Map([...entries].map((e) => [e.entryId, e]));
  const groups: PlaylistGroup[] = orderedGroups({
    segments: new Map([...segmentRows].map(([id, row]) => [id, segmentStateOf(row)])),
    entries: new Map([...entryRows].map(([id, row]) => [id, entryStateOf(row)])),
  });
  // Only rows with a description pay for the context lookup (a catalog read for tracks).
  const markdownOf = (row: PlaylistSegment | PlaylistEntry | undefined) =>
    row?.description ? renderableDescription(row, contextOf(realm, row)) : undefined;

  return groups.map(({ segment, entries: groupEntries }) => ({
    segment,
    descriptionMarkdown: markdownOf(segmentRows.get(segment.segmentId)),
    entries: groupEntries.map((entry) =>
      rowEntry(entry, catalog, markdownOf(entryRows.get(entry.entryId)))
    ),
  }));
}

function rowEntry(
  entry: EntryState,
  catalog: CatalogView,
  descriptionMarkdown: string | undefined
): PlaylistRowEntry {
  if (!entry.trackId) {
    return { entry, sourceTrack: null, status: 'text', descriptionMarkdown };
  }
  const sourceTrack = catalog.trackFor(entry.trackId);
  const status: PlaylistTrackStatus = catalog.unavailable.has(entry.trackId)
    ? 'unavailable'
    : sourceTrack
      ? 'playable'
      : 'loading';
  return { entry, sourceTrack, status, descriptionMarkdown };
}

/** Totals for a playlist, shared by list rows and the playlist header. */
export interface PlaylistSummary {
  durationSeconds: number;
  /** Most frequent first. */
  artistNames: string[];
  /** Tracks that can be downloaded (some recordings can't). */
  downloadable: number;
  downloaded: number;
  downloading: number;
  allDownloaded: boolean;
  trackIds: ReadonlySet<string>;
}

export function summarizePlaylist(groups: PlaylistRowGroup[]): PlaylistSummary {
  return summarizeTracks(
    groups.flatMap((group) =>
      group.entries.flatMap(({ entry, sourceTrack }) =>
        entry.trackId ? [{ trackId: entry.trackId, track: sourceTrack }] : []
      )
    )
  );
}

/** Totals over a playlist's track entries, in any order; text blocks are left out. */
function summarizeTracks(
  entries: Iterable<{ trackId: string; track: SourceTrack | null }>
): PlaylistSummary {
  let durationSeconds = 0;
  let downloadable = 0;
  let downloaded = 0;
  let downloading = 0;
  let unresolved = 0;
  const artistCounts = new Map<string, number>();
  const trackIds = new Set<string>();

  for (const { trackId, track } of entries) {
    trackIds.add(trackId);
    if (!track) {
      unresolved += 1;
      continue;
    }
    durationSeconds += track.duration ?? 0;
    artistCounts.set(track.artist.name, (artistCounts.get(track.artist.name) ?? 0) + 1);
    if (!track.supportsOfflineDownload()) {
      continue;
    }
    downloadable += 1;
    const status = track.offlineInfo?.status;
    // Same rule as the show screen: cached streaming audio isn't a download,
    // so Download stays available to keep it.
    if (
      track.offlineInfo?.isPlayableOffline() &&
      track.offlineInfo.type !== SourceTrackOfflineInfoType.StreamingCache
    ) {
      downloaded += 1;
    } else if (
      status === SourceTrackOfflineInfoStatus.Queued ||
      status === SourceTrackOfflineInfoStatus.Downloading
    ) {
      downloading += 1;
    }
  }

  return {
    durationSeconds,
    artistNames: [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    downloadable,
    downloaded,
    downloading,
    allDownloaded: downloadable > 0 && downloaded === downloadable && unresolved === 0,
    trackIds,
  };
}

/**
 * A list row's summary, updated as tracks load and downloads finish. Lists
 * mount one per playlist, so this reads only track entries and their catalog
 * tracks: no segments, grouping or guide text.
 */
export function usePlaylistSummary(playlist: Playlist): PlaylistSummary {
  const playlistId = playlist.playlistId;
  const entries = useQuery(
    {
      type: PlaylistEntry,
      query: (rows) =>
        rows.filtered('playlistId == $0 AND live == true AND trackId != null', playlistId),
      keyPaths: ['trackId'],
    },
    [playlistId]
  );
  const trackIds = useStableIds(entryTrackIds(entries));
  const { availability, tracks } = useCatalogTracks(trackIds);

  return useMemo(() => {
    const catalog = catalogViewOf(availability, tracks);
    return summarizeTracks(
      entryTrackIds(entries).map((trackId) => ({ trackId, track: catalog.trackFor(trackId) }))
    );
  }, [entries, availability, tracks]);
}

/**
 * The playlist's groups plus position lookups, built once per change so each
 * row's menu can find its place without scanning the whole playlist.
 */
export interface PlaylistLayout {
  groups: PlaylistRowGroup[];
  entryPositions: ReadonlyMap<string, { groupIndex: number; index: number }>;
  groupIndexes: ReadonlyMap<string, number>;
}

export function usePlaylistLayout(groups: PlaylistRowGroup[]): PlaylistLayout {
  return useMemo(() => {
    const entryPositions = new Map<string, { groupIndex: number; index: number }>();
    const groupIndexes = new Map<string, number>();
    groups.forEach((group, groupIndex) => {
      groupIndexes.set(group.segment.segmentId, groupIndex);
      group.entries.forEach((row, index) => {
        entryPositions.set(row.entry.entryId, { groupIndex, index });
      });
    });
    return { groups, entryPositions, groupIndexes };
  }, [groups]);
}

/**
 * Whether an account's playlists have all reached it: `unsaved` while creates
 * or edits wait to send, `needsAttention` when any is paused for a full
 * account, refused, or held for a deleted playlist.
 */
export function usePlaylistSaveState(
  libraryUserId: string | undefined
): 'saved' | 'unsaved' | 'needsAttention' {
  const userId = libraryUserId ?? '';
  const operations = useQuery(
    PlaylistOperation,
    (rows) => rows.filtered('libraryUserId == $0 AND state != $1', userId, 'acknowledged'),
    [userId]
  );
  const commands = useQuery(
    PlaylistCommand,
    (rows) => rows.filtered('libraryUserId == $0', userId),
    [userId]
  );

  const stuck = (state: string) =>
    state === 'needs_attention' || state === 'quota_paused' || state === 'archived_hold';
  if (operations.some((op) => stuck(op.state)) || commands.some((c) => stuck(c.state))) {
    return 'needsAttention';
  }
  return operations.length > 0 || commands.length > 0 ? 'unsaved' : 'saved';
}
