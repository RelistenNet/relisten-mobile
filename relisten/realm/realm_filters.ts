import type Realm from 'realm';
import { useIsDownloadsTab } from '../util/routes';
import { SourceTrackOfflineInfoStatus } from './models/source_track_offline_info';
import { SourceTrack } from './models/source_track';

export const checkIfOfflineSourceTrackExists = (items: Realm.List<SourceTrack>) => {
  return (
    items.filtered('offlineInfo.status == $0 LIMIT(1)', SourceTrackOfflineInfoStatus.Succeeded)
      .length >= 1
  );
};

export const useRealmTabsFilter = (items: Realm.Results<T>) => {
  const isDownloadsTab = useIsDownloadsTab();

  if (isDownloadsTab) {
    return items.filtered(
      'SUBQUERY(sourceTracks, $item, $item.offlineInfo.status == $0).@count > 0',
      SourceTrackOfflineInfoStatus.Succeeded
    );
  }

  return items;
};

// TODO: type
export function prepareRealmItem(item: any, keyPrefix?: string) {
  return {
    ...item,
    hasOfflineTracks: item._hasOfflineTracks,
    keyPrefix,
  };
}
