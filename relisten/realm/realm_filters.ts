import type Realm from 'realm';
import { useIsDownloadedTab } from '../util/routes';
import { SourceTrackOfflineInfoStatus } from './models/source_track_offline_info';
import { SourceTrack } from './models/source_track';
import { RelistenObject } from '../api/models/relisten';
import { FavoritableObject } from '@/relisten/realm/favoritable_object';

export const checkIfOfflineSourceTrackExists = (items: Realm.List<SourceTrack>) => {
  return (
    items.filtered('offlineInfo.status == $0 LIMIT(1)', SourceTrackOfflineInfoStatus.Succeeded)
      .length >= 1
  );
};

export const useRealmTabsFilter = <T extends RelistenObject>(items: Realm.Results<T>) => {
  const isDownloadedTab = useIsDownloadedTab();

  if (isDownloadedTab) {
    return items.filtered(
      'SUBQUERY(sourceTracks, $item, $item.offlineInfo.status == $0).@count > 0',
      SourceTrackOfflineInfoStatus.Succeeded
    );
  }

  return items;
};

export function filterForUser<T extends RelistenObject & FavoritableObject>(
  query: Realm.Results<T>,
  {
    isFavorite = true,
    isPlayableOffline = true,
    operator = 'OR',
  }: { isFavorite?: boolean; isPlayableOffline?: boolean; operator?: 'AND' | 'OR' }
): Realm.Results<T> {
  const filters: string[] = [];
  const args: unknown[] = [];

  if (isFavorite !== undefined) {
    filters.push(`isFavorite == $${args.length}`);
    args.push(isFavorite);
  }
  if (isPlayableOffline !== undefined) {
    filters.push(
      `SUBQUERY(sourceTracks, $item, $item.offlineInfo.status == ${SourceTrackOfflineInfoStatus.Succeeded}).@count ${isPlayableOffline ? '>' : '='} 0`
    );
  }

  if (filters.length > 0) {
    const filter = '(' + filters.join(`) ${operator} (`) + ')';
    return query.filtered(filter, args);
  }

  return query;
}
