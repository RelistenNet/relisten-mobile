import type { OfflineModeSetting } from '@/relisten/realm/models/user_settings';
import type { Source } from '@/relisten/realm/models/source';

export function getQueueableSourceTracks(
  source: Source,
  isOfflineTab: boolean,
  offlineMode: OfflineModeSetting
) {
  const queueOfflineOnly = isOfflineTab || offlineMode === 'always_offline';

  return source.allSourceTracks().filter((track) => {
    return queueOfflineOnly ? track.playable(false) : true;
  });
}
