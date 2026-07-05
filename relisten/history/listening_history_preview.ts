import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import Realm from 'realm';

export function listeningHistoryPreview(
  sortedHistory: Realm.Results<PlaybackHistoryEntry>,
  activeSourceTrackUuids: ReadonlySet<string>,
  limit: number
) {
  const preview: PlaybackHistoryEntry[] = [];

  for (const entry of sortedHistory) {
    if (!activeSourceTrackUuids.has(entry.sourceTrack.uuid)) {
      preview.push(entry);
    }
    if (preview.length >= limit) {
      break;
    }
  }

  return preview;
}
