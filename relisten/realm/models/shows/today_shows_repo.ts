import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { Show as ApiShow } from '@/relisten/api/models/show';
import { Show } from '@/relisten/realm/models/show';
import { ShowsWithVenueNetworkBackedBehavior } from '@/relisten/realm/models/shows/show_with_venues_behavior';
import * as R from 'remeda';

import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { useQuery } from '@/relisten/realm/schema';
import { useEffect, useMemo, useState } from 'react';
import Realm from 'realm';
import { showRepo } from '../show_repo';
import { venueRepo } from '../venue_repo';
import { Venue } from '../venue';
import EventEmitter from 'react-native/Libraries/vendor/emitter/EventEmitter';
import { upsertShowList } from '@/relisten/realm/models/repo_utils';

class TodayShowsNetworkBackedBehavior extends ShowsWithVenueNetworkBackedBehavior {
  private emitter = new EventEmitter();

  constructor(
    public artistUuids?: string[],
    options?: NetworkBackedBehaviorOptions
  ) {
    super(artistUuids, options);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<ApiShow[] | undefined>> {
    const refreshOptions = api.refreshOptions(forcedRefresh) || {};

    return api.todayShows({
      bypassRateLimit: true,
      bypassEtagCaching: true,
      ...refreshOptions,
    });
  }

  useFetchFromLocal(): Realm.Results<Show> {
    const [showUuids, setState] = useState<string[]>([]);

    useEffect(() => {
      const onChange = (data: string[]) => setState(data);
      const sub = this.emitter.addListener('onChange', onChange);
      return () => sub.remove();
    }, []);

    return useQuery(
      Show,
      (query) =>
        this.artistUuids
          ? query.filtered('uuid in $0', showUuids).filtered('artistUuid in $0', this.artistUuids)
          : query.filtered('uuid in $0', showUuids),
      [this.artistUuids, showUuids]
    );
  }

  override upsert(realm: Realm, localData: Realm.Results<Show>, apiData: ApiShow[]): void {
    this.emitter.emit(
      'onChange',
      apiData.map((x) => x.uuid)
    );

    realm.write(() => {
      upsertShowList(realm, apiData, localData, { performDeletes: false, queryForModel: true });
    });
  }
}

export const useTodayShows = (...artistUuids: string[]) => {
  const behavior = useMemo(() => {
    return new TodayShowsNetworkBackedBehavior(artistUuids, {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkAlwaysFirst,
    });
  }, [...artistUuids]);

  return useNetworkBackedBehavior(behavior);
};
