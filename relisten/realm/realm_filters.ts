import type Realm from 'realm';
import { useIsDownloadsTab } from '../util/routes';
import { SourceTrackOfflineInfoStatus } from './models/source_track_offline_info';

// export const filterRealmResultsForDownloads = (items: Realm.Results<T>) =>
//   items.filtered(
//     'SUBQUERY(sourceTracks, $item, $item.offlineInfo.status == $0).@count > 0',
//     SourceTrackOfflineInfoStatus.Succeeded
//   );

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
