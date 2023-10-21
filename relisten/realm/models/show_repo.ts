import { Repository } from '../repository';

import { Show } from './show';
import Realm from 'realm';
import { useMemo } from 'react';
import { RelistenApiClient, RelistenApiResponse, RelistenApiResponseType } from '../../api/client';
import { useObject, useQuery, useRealm } from '../schema';
import { ThrottledNetworkBackedBehavior } from '../network_backed_behavior';
import { ShowWithSources as ApiShowWithSources } from '../../api/models/source';
import { Source } from './source';
import * as R from 'remeda';
import { sourceTrackRepo } from './source_track_repo';
import { sourceSetRepo } from './source_set_repo';
import { sourceRepo } from './source_repo';
import { NetworkBackedResults } from '../network_backed_results';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { venueRepo } from './venue_repo';

export const showRepo = new Repository(Show);

export interface ShowWithSources {
  show: Show | undefined;
  sources: Realm.Results<Source>;
}

class ShowWithFullSourcesNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  ShowWithSources,
  ApiShowWithSources
> {
  constructor(public showUuid?: string, public sourceUuid?: string) {
    super();
  }

  fetchFromApi(
    api: RelistenApiClient
  ): Promise<RelistenApiResponse<ApiShowWithSources | undefined>> {
    if (!this.showUuid) {
      return Promise.resolve({ type: RelistenApiResponseType.Offline, data: undefined });
    }

    return api.showWithSources(this.showUuid);
  }

  fetchFromLocal(): ShowWithSources {
    const realm = useRealm();

    if (this.sourceUuid !== undefined && this.showUuid === undefined) {
      const source = realm.objectForPrimaryKey(Source, this.sourceUuid);

      if (source) {
        this.showUuid = source.showUuid;
      }
    }

    const showUuid = this.showUuid || '__no_show_sentintel__';

    const show = useObject(Show, showUuid) || undefined;
    const sources = useQuery(Source, (query) => query.filtered('showUuid == $0', showUuid), [
      showUuid,
    ]);

    const obj = useMemo(() => {
      return {
        show,
        sources,
      };
    }, [show, sources]);

    return obj;
  }

  isLocalDataShowable(localData: ShowWithSources): boolean {
    return localData.show !== null && localData.sources.length > 0;
  }

  upsert(realm: Realm, localData: ShowWithSources, apiData: ApiShowWithSources): void {
    const apiSourceSets = R.flatMap(apiData.sources, (s) => s.sets);
    const apiSourceTracks = R.flatMap(apiSourceSets, (s) => s.tracks);
    const apiSourceSetsBySource = R.groupBy(apiSourceSets, (s) => s.source_uuid);
    const apiSourceTracksBySet = R.groupBy(apiSourceTracks, (s) => s.source_set_uuid);

    realm.write(() => {
      // TODO: maybe should be inside if statement?
      // it broke doing that, but worth reivisiting
      const {
        createdModels: [createdShow],
        updatedModels: [updatedShow],
      } = showRepo.upsert(realm, apiData, localData.show);

      if (!localData.show) {
        localData.show = updatedShow || createdShow;
      }

      if (localData.show && apiData.venue) {
        const { createdModels: createdVenues, updatedModels: updatedVenues } = venueRepo.upsert(
          realm,
          apiData.venue,
          localData.show.venue,
          true
        );

        if (createdVenues.length > 0) {
          localData.show.venue = createdVenues[0];
        }

        if (updatedVenues.length > 0) {
          localData.show.venue = updatedVenues[0];
        }
      }

      sourceRepo.upsertMultiple(realm, apiData.sources, localData.sources);

      for (const source of localData.sources) {
        const { createdModels: createdSourceSets } = sourceSetRepo.upsertMultiple(
          realm,
          apiSourceSetsBySource[source.uuid] || [],
          source.sourceSets
        );

        source.sourceSets.push(...createdSourceSets);

        for (const sourceSet of source.sourceSets) {
          const { createdModels: createdSourceTracks } = sourceTrackRepo.upsertMultiple(
            realm,
            apiSourceTracksBySet[sourceSet.uuid],
            sourceSet.sourceTracks
          );

          sourceSet.sourceTracks.push(...createdSourceTracks);
        }
      }
    });
  }
}

export function useFullShow(
  showUuid: string | undefined
): NetworkBackedResults<ShowWithSources | undefined> {
  const behavior = useMemo(() => {
    return new ShowWithFullSourcesNetworkBackedBehavior(showUuid);
  }, [showUuid]);

  return useNetworkBackedBehavior(behavior);
}

export function useFullShowFromSource(
  sourceUuid: string | undefined
): NetworkBackedResults<ShowWithSources | undefined> {
  const behavior = useMemo(() => {
    return new ShowWithFullSourcesNetworkBackedBehavior(undefined, sourceUuid);
  }, [sourceUuid]);

  return useNetworkBackedBehavior(behavior);
}

export function useShow(showUuid?: string): ShowWithSources | undefined {
  const behavior = useMemo(() => {
    return new ShowWithFullSourcesNetworkBackedBehavior(showUuid);
  }, [showUuid]);

  return behavior.fetchFromLocal();
}
