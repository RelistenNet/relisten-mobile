import { useQuery, useRealm } from '@/relisten/realm/schema';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';

export function useHistoryRecentlyPlayedShows(
  limit: number = 6
): ReadonlyArray<PlaybackHistoryEntry> {
  const recentlyPlayed = useQuery(
    {
      type: PlaybackHistoryEntry,
      query: (query) => query.sorted('playbackStartedAt', /* reverse= */ true),
    },
    []
  );

  const recentlyPlayedShows = useMemo(() => {
    const recentlyPlayedShowUuids: string[] = [];
    const entryByShowUuid: { [uuid: string]: PlaybackHistoryEntry } = {};

    for (const entry of recentlyPlayed) {
      if (recentlyPlayedShowUuids.indexOf(entry.show.uuid) === -1) {
        recentlyPlayedShowUuids.push(entry.show.uuid);
        entryByShowUuid[entry.show.uuid] = entry;
      }

      if (recentlyPlayedShowUuids.length >= limit) {
        break;
      }
    }

    return recentlyPlayedShowUuids.map((uuid) => entryByShowUuid[uuid]);
  }, [limit, recentlyPlayed]);

  return recentlyPlayedShows;
}

const EARLY_EXIT_TRACK_COUNT = 100;
const EARLY_EXIT_UNIQUE_ARTISTS = 3;
const EARLY_EXIT_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SCAN_CHUNK_SIZE = 200;

let cachedTopPlayedArtistUuids: ReadonlyArray<string> | null = null;

function rankTopPlayedArtistUuids(
  counts: Map<string, number>,
  sortNames: Map<string, string>,
  limit: number
): ReadonlyArray<string> {
  if (counts.size === 0) {
    return [];
  }

  return [...counts.entries()]
    .sort((a, b) => {
      const countDiff = b[1] - a[1];
      if (countDiff !== 0) {
        return countDiff;
      }
      return (sortNames.get(a[0]) ?? '').localeCompare(sortNames.get(b[0]) ?? '');
    })
    .slice(0, limit)
    .map(([uuid]) => uuid);
}

export function useTopPlayedArtistUuidsOnce(
  limit: number = 6,
  enabled: boolean = true
): ReadonlyArray<string> {
  const realm = useRealm();
  const [topPlayed, setTopPlayed] = useState<ReadonlyArray<string>>(
    cachedTopPlayedArtistUuids ?? []
  );
  const scheduledRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (cachedTopPlayedArtistUuids !== null) {
      setTopPlayed(cachedTopPlayedArtistUuids);
      return;
    }

    if (scheduledRef.current) {
      return;
    }

    scheduledRef.current = true;
    let cancelled = false;

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) {
        return;
      }

      if (cachedTopPlayedArtistUuids !== null) {
        setTopPlayed(cachedTopPlayedArtistUuids);
        return;
      }

      const entries = realm
        .objects(PlaybackHistoryEntry)
        .sorted('playbackStartedAt', /* reverse= */ true);
      const cutoffTime = Date.now() - EARLY_EXIT_DAYS_MS;
      const counts = new Map<string, number>();
      const sortNames = new Map<string, string>();
      let index = 0;
      let uniqueArtists = 0;
      const total = entries.length;

      const finish = () => {
        const computed = rankTopPlayedArtistUuids(counts, sortNames, limit);
        cachedTopPlayedArtistUuids = computed;
        if (!cancelled) {
          setTopPlayed(computed);
        }
      };

      const scanChunk = () => {
        if (cancelled) {
          return;
        }

        const end = Math.min(index + SCAN_CHUNK_SIZE, total);
        let shouldStop = false;

        for (; index < end; index += 1) {
          const entry = entries[index];
          const artist = entry.artist;
          const uuid = artist?.uuid;

          if (uuid) {
            const prev = counts.get(uuid) ?? 0;
            counts.set(uuid, prev + 1);
            if (prev === 0) {
              uniqueArtists += 1;
              if (!sortNames.has(uuid)) {
                sortNames.set(uuid, artist.sortName);
              }
            }
          }

          const processed = index + 1;
          if (uniqueArtists >= EARLY_EXIT_UNIQUE_ARTISTS) {
            if (processed >= EARLY_EXIT_TRACK_COUNT) {
              shouldStop = true;
              index += 1;
              break;
            }

            if (entry.playbackStartedAt.getTime() < cutoffTime) {
              shouldStop = true;
              index += 1;
              break;
            }
          }
        }

        if (shouldStop || index >= total) {
          finish();
          return;
        }

        setTimeout(scanChunk, 0);
      };

      scanChunk();
    });

    return () => {
      cancelled = true;
      if (typeof task?.cancel === 'function') {
        task.cancel();
      }
    };
  }, [enabled, limit, realm]);

  return topPlayed;
}
