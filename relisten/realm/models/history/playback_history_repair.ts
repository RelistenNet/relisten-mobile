import Realm from 'realm';

import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { log } from '@/relisten/util/logging';

const logger = log.extend('playback-history-repair');
const repairedRealmPaths = new Set<string>();

const ORPHANED_HISTORY_QUERY =
  'sourceTrack == nil OR artist == nil OR show == nil OR source == nil';
export const VALID_PLAYBACK_HISTORY_QUERY =
  'sourceTrack != nil AND artist != nil AND show != nil AND source != nil';

export function removeOrphanedPlaybackHistoryEntries(realm: Realm) {
  if (repairedRealmPaths.has(realm.path)) return;

  const orphanedEntries = realm.objects(PlaybackHistoryEntry).filtered(ORPHANED_HISTORY_QUERY);

  if (orphanedEntries.length > 0) {
    logger.warn(`Removing ${orphanedEntries.length} orphaned playback history entries`);
    realm.write(() => {
      realm.delete(orphanedEntries);
    });
  }

  repairedRealmPaths.add(realm.path);
}
