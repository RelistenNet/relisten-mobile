import type Realm from 'realm';
import { useIsOfflineTab } from '../util/routes';
import { SourceTrackOfflineInfoStatus } from './models/source_track_offline_info';
import { SourceTrack } from './models/source_track';
import { RelistenObject } from '../api/models/relisten';

export const checkIfOfflineSourceTrackExists = (items: Realm.List<SourceTrack>) => {
  return (
    items.filtered('offlineInfo.status == $0 LIMIT(1)', SourceTrackOfflineInfoStatus.Succeeded)
      .length >= 1
  );
};

export const useRealmTabsFilter = <T extends RelistenObject>(items: Realm.Results<T>) => {
  const isOfflineTab = useIsOfflineTab();

  if (isOfflineTab) {
    return items.filtered(
      'SUBQUERY(sourceTracks, $item, $item.offlineInfo.status == $0).@count > 0',
      SourceTrackOfflineInfoStatus.Succeeded
    );
  }

  return items;
};

export interface UserFilters {
  isPlayableOffline?: boolean | null;
}

export function filterForUser<T extends RelistenObject>(
  query: Realm.Results<T>,
  { isPlayableOffline = true }: UserFilters
): Realm.Results<T> {
  if (isPlayableOffline === null) {
    return query;
  }

  return query.filtered(
    `SUBQUERY(sourceTracks, $item, $item.offlineInfo.status == ${SourceTrackOfflineInfoStatus.Succeeded}).@count ${isPlayableOffline ? '>' : '='} 0`
  );
}
