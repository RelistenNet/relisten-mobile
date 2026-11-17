import { useMemo } from 'react';
import Realm from 'realm';
import { useObject, useQuery, useRealm } from '@/relisten/realm/schema';
import {
  Playlist,
  PlaylistEntry,
  PlaylistSegment,
  PlaylistTrackAvailability,
} from '@/relisten/realm/models/playlists/playlist';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import {
  orderedGroups,
  type EntryState,
  type PlaylistGroup,
  type SegmentState,
} from '@/relisten/playlists/playlist_operations';
import { formatUuidTypedId, parseUuidTypedId } from '@/relisten/util/typed_uuid_id';

export const trackIdForSourceTrack = (sourceTrack: Pick<SourceTrack, 'uuid'>) =>
  formatUuidTypedId('track', sourceTrack.uuid);

/** The catalog track for an entry, or null when it hasn't been loaded onto this device yet. */
export function sourceTrackFor(realm: Realm, trackId: string): SourceTrack | null {
  const uuid = parseUuidTypedId(trackId, 'track');
  if (!uuid) {
    return null;
  }
  const track = realm.objectForPrimaryKey(SourceTrack, uuid);
  // Playlist rows read the show, source and artist, so a track without them can't render yet.
  return track && track.deletedAt == null && track.show && track.source && track.artist
    ? track
    : null;
}

export function usePlaylists() {
  return useQuery(
    Playlist,
    (rows) => rows.filtered('deletedAt == null').sorted('updatedAt', true),
    []
  );
}

export function useDeletedPlaylists() {
  return useQuery(
    Playlist,
    (rows) => rows.filtered('deletedAt != null').sorted('deletedAt', true),
    []
  );
}

export function usePlaylist(playlistId: string) {
  return useObject(Playlist, playlistId);
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
    (rows) => rows.filtered('playlistId == $0', playlistId),
    [playlistId]
  );
  const entries = useQuery(PlaylistEntry, (rows) => rows.filtered('playlistId == $0', playlistId), [
    playlistId,
  ]);
  const unavailable = useQuery(PlaylistTrackAvailability);

  return useMemo(() => {
    const unavailableIds = new Set(unavailable.map((row) => row.trackId));
    const groups: PlaylistGroup[] = orderedGroups({
      segments: new Map(
        segments.map((s) => [s.segmentId, { segmentId: s.segmentId, rank: s.rank }])
      ),
      entries: new Map(
        entries.map((e) => [
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
  }, [realm, segments, entries, unavailable]);
}

export interface PlaylistSummary {
  durationSeconds: number;
  artistNames: string[];
  allDownloaded: boolean;
}

/** Duration, artists and download state for list rows. Reads only this playlist's entries. */
export function readPlaylistSummary(realm: Realm, playlistId: string): PlaylistSummary {
  let durationSeconds = 0;
  let allDownloaded = true;
  const artistCounts = new Map<string, number>();

  for (const entry of realm.objects(PlaylistEntry).filtered('playlistId == $0', playlistId)) {
    const track = sourceTrackFor(realm, entry.trackId);
    if (!track) {
      allDownloaded = false;
      continue;
    }
    durationSeconds += track.duration ?? 0;
    allDownloaded = allDownloaded && track.offlineInfo?.isPlayableOffline() === true;
    const name = track.artist.name;
    artistCounts.set(name, (artistCounts.get(name) ?? 0) + 1);
  }

  const artistNames = [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  return { durationSeconds, artistNames, allDownloaded: allDownloaded && artistCounts.size > 0 };
}

/**
 * Summary for a list row. Rows re-render rarely, and this is one pass over the
 * playlist's own entries, so it is simply recomputed on render.
 */
export function usePlaylistSummary(playlist: Playlist): PlaylistSummary {
  const realm = useRealm();
  return readPlaylistSummary(realm, playlist.playlistId);
}
