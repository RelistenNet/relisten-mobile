import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import Realm from 'realm';

export function listeningHistoryPreview(
  sortedHistory: Realm.Results<PlaybackHistoryEntry>,
  activeSourceTrackUuids: ReadonlySet<string>,
  limit: number
) {
  const excludedUuids = [...activeSourceTrackUuids];
  const candidates =
    excludedUuids.length > 0
      ? sortedHistory.filtered('NOT (sourceTrack.uuid IN $0)', excludedUuids)
      : sortedHistory;

  return Array.from(candidates.slice(0, limit));
}
