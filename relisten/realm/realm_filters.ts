import type Realm from 'realm';
import { useIsOfflineTab } from '../util/routes';
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
  isFavorite?: boolean | null;
  isPlayableOffline?: boolean | null;
  operator?: 'AND' | 'OR';
}

export function filterForUser<T extends RelistenObject>(
  query: Realm.Results<T>,
  { isFavorite = true, isPlayableOffline = true, operator = 'OR' }: UserFilters
): Realm.Results<T> {
  const filters: string[] = [];
  const args: unknown[] = [];

  if (isFavorite !== null) {
    filters.push(`isFavorite == $${args.length}`);
    args.push(isFavorite);
  }
  if (isPlayableOffline !== null) {
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
