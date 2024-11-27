import { useQuery } from '@/relisten/realm/schema';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { useMemo } from 'react';

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
