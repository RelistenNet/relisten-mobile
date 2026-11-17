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
  const track = realm.objectForPrimaryKey(SourceTrack, uuid);
  // Playlist rows read the show, source and artist, so a track without them can't render yet.
  return track && track.deletedAt == null && track.show && track.source && track.artist
    ? track
    : null;
}

/**
 * The visible owner is the signed-in account, or the last one signed in on this
 * device. Lists show unowned playlists plus that owner's; another account's
 * playlists stay on the device, hidden until it signs in again.
 */
export function useVisibleOwnerId(): string | null {
  return useObject(PlaylistDeviceState, PLAYLIST_DEVICE_STATE_ID)?.lastSignedInUserId ?? null;
}

const VISIBLE = '(ownerUserId == null OR ownerUserId == $0)';

/** The playlists lists show, most recently edited first. Used by screens and CarPlay. */
export function visiblePlaylists(rows: Realm.Results<Playlist>, owner: string | null) {
  return rows
    .filtered(`${VISIBLE} AND deletedAt == null AND archived == false`, owner)
    .sorted('updatedAt', true);
}

export function usePlaylists() {
  const owner = useVisibleOwnerId();
  return useQuery(Playlist, (rows) => visiblePlaylists(rows, owner), [owner]);
}

/** Deleted device playlists (kept 30 days) and archived account playlists. */
export function useDeletedPlaylists() {
  const owner = useVisibleOwnerId();
  return useQuery(
    Playlist,
    (rows) =>
      rows.filtered(`${VISIBLE} AND (deletedAt != null OR archived == true)`, owner).sorted([
        ['deletedAt', true],
        ['updatedAt', true],
      ]),
    [owner]
  );
}

/** The playlist, unless it belongs to an account other than the current one. */
export function usePlaylist(playlistId: string) {
  const owner = useVisibleOwnerId();
  const playlist = useObject(Playlist, playlistId);
  return playlist && (!playlist.ownerUserId || playlist.ownerUserId === owner) ? playlist : null;
}

export type PlaylistTrackStatus = 'playable' | 'loading' | 'unavailable';

export interface PlaylistRowEntry {
  entry: EntryState;
  sourceTrack: SourceTrack | null;
  status: PlaylistTrackStatus;
}

export interface PlaylistRowGroup {
  segment: SegmentState;
  entries: PlaylistRowEntry[];
}

/** The playlist's groups in order, with each entry's catalog track and whether it can play. */
export function usePlaylistGroups(playlistId: string): PlaylistRowGroup[] {
  const realm = useRealm();
  const segments = useQuery(
    PlaylistSegment,
    (rows) => rows.filtered('playlistId == $0 AND live == true', playlistId),
    [playlistId]
  );
  const entries = useQuery(
    PlaylistEntry,
    (rows) => rows.filtered('playlistId == $0 AND live == true', playlistId),
    [playlistId]
  );
  const trackIds = useMemo(() => [...new Set(entries.map((e) => e.trackId))], [entries]);
  // Only this playlist's availability records, so a resolver write for another
  // playlist doesn't rebuild these rows.
  const availability = useQuery(
    PlaylistTrackAvailability,
    (rows) => rows.filtered('trackId IN $0', trackIds),
    [trackIds]
  );
  // Entries only hold IDs, so watch the catalog tracks rows actually render: the
  // redirect target when a recording moved, otherwise the entry's own track.
  const trackUuids = useMemo(
    () => playableTrackUuids(trackIds, availability),
    [trackIds, availability]
  );
  // Rows read download status, soft deletion, and the show, source, and artist
  // links; download progress ticks are left out so they don't re-render.
  const tracks = useQuery(
    {
      type: SourceTrack,
      query: (rows) => rows.filtered('uuid IN $0', trackUuids),
      keyPaths: [
        'uuid',
        'deletedAt',
        'offlineInfo.status',
        'offlineInfo.type',
        'show',
        'source',
        'artist',
      ],
    },
    [trackUuids]
  );

  return useMemo(
    () => buildRowGroups(realm, segments, entries, unavailableIds(availability)),
    [realm, segments, entries, availability, tracks]
  );
}

/** The same groups outside React, for CarPlay and other non-UI callers. */
export function readPlaylistRowGroups(realm: Realm, playlistId: string): PlaylistRowGroup[] {
  return buildRowGroups(
    realm,
    realm.objects(PlaylistSegment).filtered('playlistId == $0 AND live == true', playlistId),
    realm.objects(PlaylistEntry).filtered('playlistId == $0 AND live == true', playlistId),
    unavailableIds(realm.objects(PlaylistTrackAvailability))
  );
}

function playableTrackUuids(
  trackIds: string[],
  availability: Iterable<PlaylistTrackAvailability>
): string[] {
  const redirects = new Map(
    [...availability]
      .filter((row) => row.status === 'redirected' && row.redirectTrackId)
      .map((row) => [row.trackId, row.redirectTrackId!])
  );
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
  unavailableIds: ReadonlySet<string>
): PlaylistRowGroup[] {
  const groups: PlaylistGroup[] = orderedGroups({
    segments: new Map(
      [...segments].map((s) => [s.segmentId, { segmentId: s.segmentId, rank: s.rank }])
    ),
    entries: new Map(
      [...entries].map((e) => [
        e.entryId,
        { entryId: e.entryId, segmentId: e.segmentId, trackId: e.trackId, rank: e.rank },
      ])
    ),
  });

  return groups.map(({ segment, entries: groupEntries }) => ({
    segment,
    entries: groupEntries.map((entry) => {
      const sourceTrack = sourceTrackFor(realm, entry.trackId);
      const status: PlaylistTrackStatus = unavailableIds.has(entry.trackId)
        ? 'unavailable'
        : sourceTrack
          ? 'playable'
          : 'loading';
      return { entry, sourceTrack, status };
    }),
  }));
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
  let durationSeconds = 0;
  let downloadable = 0;
  let downloaded = 0;
  let downloading = 0;
  let unresolved = 0;
  const artistCounts = new Map<string, number>();
  const trackIds = new Set<string>();

  for (const group of groups) {
    for (const { entry, sourceTrack: track } of group.entries) {
      trackIds.add(entry.trackId);
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

/** A list row's summary, updated as tracks load and downloads finish. */
export function usePlaylistSummary(playlist: Playlist): PlaylistSummary {
  const groups = usePlaylistGroups(playlist.playlistId);
  return useMemo(() => summarizePlaylist(groups), [groups]);
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
  ownerUserId: string | undefined
): 'saved' | 'unsaved' | 'needsAttention' {
  const owner = ownerUserId ?? '';
  const operations = useQuery(
    PlaylistOperation,
    (rows) => rows.filtered('ownerUserId == $0 AND state != $1', owner, 'acknowledged'),
    [owner]
  );
  const commands = useQuery(PlaylistCommand, (rows) => rows.filtered('ownerUserId == $0', owner), [
    owner,
  ]);

  const stuck = (state: string) =>
    state === 'needs_attention' || state === 'quota_paused' || state === 'archived_hold';
  if (operations.some((op) => stuck(op.state)) || commands.some((c) => stuck(c.state))) {
    return 'needsAttention';
  }
  return operations.length > 0 || commands.length > 0 ? 'unsaved' : 'saved';
}
