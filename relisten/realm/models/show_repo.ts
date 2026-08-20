import { Repository } from '../repository';
import { useMemo } from 'react';
import Realm from 'realm';
import * as R from 'remeda';
import { sourceTrackRepo } from './source_track_repo';
import { sourceSetRepo } from './source_set_repo';
import { sourceRepo } from './source_repo';
import { NetworkBackedResults } from '../network_backed_results';
import { firstBy } from 'thenby';
import { RelistenApiClient, RelistenApiResponse, RelistenApiResponseType } from '../../api/client';
import { ShowWithSources as ApiShowWithSources } from '../../api/models/source';
import { NetworkBackedBehaviorOptions } from '../network_backed_behavior';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { Show } from './show';
import { Source } from './source';
import { SourceTrack } from './source_track';
import { venueRepo } from './venue_repo';
import { tourRepo } from './tour_repo';
import { Venue } from './venue';
import { Tour } from './tour';
import { Artist } from './artist';
import { Year } from './year';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import {
  ActiveCatalogObjectValueStream,
  CombinedValueStream,
  RealmQueryValueStream,
  ValueStream,
} from '@/relisten/realm/value_streams';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';
import { LibraryIndex } from '@/relisten/realm/library_index';
import { useOfflineAvailabilityIndex } from '@/relisten/realm/root_services';
import { attachShowArtists } from '@/relisten/realm/models/show_artist_relationships';
import {
  activeCatalogObjectForPrimaryKey,
  activeCatalogResults,
  restoreCatalogObject,
} from '@/relisten/realm/catalog_retirement';
import { reportCatalogMaintenance } from '@/relisten/realm/catalog_access_monitor';
import { ensureShowResponseCatalogIntegrity } from '@/relisten/realm/catalog_integrity';

export const showRepo = new Repository(Show);

export interface ShowWithSources {
  show: Show | undefined;
  sources: Realm.Results<Source>;
}

// const getEtreeId = (s = '') =>
//   Number(
//     s
//       .split('.')
//       .reverse()
//       .find((x) => /^[0-9]+$/.test(x))
//   );

// our magic live music sort, taken from relisten-web
// gives precedence to favorites -> soundboards -> charlie miller/peter costello -> etree ids -> avg weighted rating
// https://github.com/RelistenNet/relisten-web/blob/69e05607c0a0699b5ccb0b3711a3ec17faf3a855/src/redux/modules/tapes.js#L63
export const sortSources = (
  sources: Realm.Results<Source>,
  libraryIndex?: Pick<LibraryIndex, 'sourceHasOfflineTracks'>
) => {
  const sortedSources = sources
    ? Array.from(sources).sort(
        firstBy(
          // sort first if favorited or downloaded
          (t: Source) => t.isFavorite || t.hasOfflineTracks(libraryIndex),
          'desc'
        )
          .thenBy((t: Source) => t.isSoundboard, 'desc')
          // Charlie for GD, Pete for JRAD
          .thenBy(
            (t: Source) =>
              /(charlie miller)|(peter costello)/i.test(
                [t.taper, t.transferrer, t.source].join('')
              ),
            'desc'
          )
          // .thenBy(
          //   (t1: Source, t2: Source) =>
          //     getEtreeId(t1.upstreamIdentifier) - getEtreeId(t2.upstreamIdentifier),
          //   'desc'
          // )
          .thenBy((t) => t.avgRatingWeighted, 'desc')
      )
    : [];

  return sortedSources;
};

export class ShowWithFullSourcesNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  ShowWithSources,
  ApiShowWithSources
> {
  constructor(
    realm: Realm.Realm,
    public showUuid?: string,
    public sourceUuid?: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<ApiShowWithSources | undefined>> {
    if (!this.showUuid) {
      return Promise.resolve({ type: RelistenApiResponseType.Offline, data: undefined });
    }

    return api.showWithSources(this.showUuid, api.refreshOptions(forcedRefresh));
  }

  override createLocalUpdatingResults(): ValueStream<ShowWithSources> {
    if (this.sourceUuid !== undefined && this.showUuid === undefined) {
      const source = activeCatalogObjectForPrimaryKey(
        this.realm,
        Source,
        this.sourceUuid,
        'show-detail.source-route-resolution'
      );

      if (source) {
        this.showUuid = source.showUuid;
      }
    }

    const showUuid = this.showUuid || '__no_show_sentinel__';

    const showResults = new ActiveCatalogObjectValueStream(
      this.realm,
      Show,
      showUuid,
      'show-detail.root'
    );
    const sourcesResults = new RealmQueryValueStream<Source>(
      this.realm,
      activeCatalogResults(this.realm.objects(Source)).filtered('showUuid == $0', showUuid)
    );

    return new CombinedValueStream(showResults, sourcesResults, (show, sources) => {
      return { show: show || undefined, sources } as ShowWithSources;
    });
  }

  isLocalDataShowable(localData: ShowWithSources): boolean {
    return localData.show != null && localData.sources.length > 0;
  }

  override upsert(localData: ShowWithSources, apiData: ApiShowWithSources): void {
    const artist = this.realm.objectForPrimaryKey(Artist, apiData.artist_uuid);
    const year = this.realm.objectForPrimaryKey(Year, apiData.year_uuid);
    const apiSourceSets = R.flatMap(apiData.sources, (s) => s.sets);
    const apiSourceTracks = R.flatMap(apiSourceSets, (s) => s.tracks);
    const apiSourceSetsBySource = R.groupBy(apiSourceSets, (s) => s.source_uuid);
    const apiSourceTracksBySet = R.groupBy(apiSourceTracks, (s) => s.source_set_uuid);
    let restoredArtists = 0;
    let restoredYears = 0;
    const reconciledSources: Source[] = [];
    const reconciledSourceTracks: SourceTrack[] = [];

    this.realm.write(() => {
      if (artist && restoreCatalogObject(artist)) restoredArtists += 1;
      if (year && restoreCatalogObject(year)) restoredYears += 1;

      // TODO: maybe should be inside if statement?
      // it broke doing that, but worth reivisiting
      const { allModels: showModels } = showRepo.upsert(this.realm, apiData, localData.show);
      localData.show = showModels[0];

      if (localData.show) {
        if (artist) localData.show.artist = artist;
        attachShowArtists(this.realm, [localData.show]);
      }

      if (localData.show && localData.show.venueUuid && apiData.venue) {
        let venueToUpdate = localData.show.venue;

        if (venueToUpdate && venueToUpdate.uuid !== localData.show.venueUuid) {
          venueToUpdate = undefined;
        }

        const { allModels: venueModels } = venueRepo.upsert(
          this.realm,
          apiData.venue,
          venueToUpdate
        );
        localData.show.venue =
          venueModels[0]?.uuid === localData.show.venueUuid ? venueModels[0] : undefined;
      } else if (localData.show) {
        const venue = localData.show.venueUuid
          ? this.realm.objectForPrimaryKey(Venue, localData.show.venueUuid)
          : undefined;
        localData.show.venue = venue && venue.retiredAt == null ? venue : undefined;
      }

      if (localData.show && localData.show.tourUuid && apiData.tour) {
        let tourToUpdate = localData.show.tour;

        if (tourToUpdate && tourToUpdate.uuid !== localData.show.tourUuid) {
          tourToUpdate = undefined;
        }

        const { allModels: tourModels } = tourRepo.upsert(this.realm, apiData.tour, tourToUpdate);
        localData.show.tour =
          tourModels[0]?.uuid === localData.show.tourUuid ? tourModels[0] : undefined;
      } else if (localData.show) {
        const tour = localData.show.tourUuid
          ? this.realm.objectForPrimaryKey(Tour, localData.show.tourUuid)
          : undefined;
        localData.show.tour = tour && tour.retiredAt == null ? tour : undefined;
      }

      // These child objects have global primary keys, but the local lists here are only scoped to
      // the current parent. Enable global lookup so a missing parent link does not get mistaken
      // for a missing Realm object and trigger a duplicate-PK create.
      const { allModels: sourceModels } = sourceRepo.upsertMultiple(
        this.realm,
        apiData.sources,
        localData.sources
      );
      reconciledSources.push(...sourceModels);

      for (const source of sourceModels) {
        if (artist) source.artist = artist;

        const { allModels: sourceSets, retiredModels: retiredSourceSets } =
          sourceSetRepo.upsertMultiple(
            this.realm,
            apiSourceSetsBySource[source.uuid] || [],
            source.sourceSets
          );

        // Rebuild the parent list from allModels rather than only appending createdModels. When
        // queryForModel finds an existing row elsewhere in Realm, it must still be reattached to
        // this parent list and stale children must be removed.
        source.sourceSets.splice(
          0,
          source.sourceSets.length,
          ...sourceSets,
          ...retiredSourceSets.sort((a, b) => a.index - b.index)
        );

        for (const sourceSet of sourceSets) {
          const { allModels: sourceTracks, retiredModels: retiredSourceTracks } =
            sourceTrackRepo.upsertMultiple(
              this.realm,
              apiSourceTracksBySet[sourceSet.uuid] || [],
              sourceSet.sourceTracks
            );

          // Same reconciliation rule for tracks: the payload is authoritative for membership and
          // order, even when some rows were found by global lookup instead of being newly created.
          sourceSet.sourceTracks.splice(
            0,
            sourceSet.sourceTracks.length,
            ...sourceTracks,
            ...retiredSourceTracks.sort((a, b) => a.trackPosition - b.trackPosition)
          );

          sourceTracks.forEach((st) => {
            if (artist) st.artist = artist;
            if (year) st.year = year;
            if (localData.show) st.show = localData.show;
            st.source = source;
          });
          reconciledSourceTracks.push(...sourceTracks);
        }
      }

      ensureShowResponseCatalogIntegrity(
        this.realm,
        localData.show,
        reconciledSources,
        reconciledSourceTracks
      );
    });

    reportCatalogMaintenance('restored', 'Artist', restoredArtists, {
      reason: 'referenced-by-show-response',
    });
    reportCatalogMaintenance('restored', 'Year', restoredYears, {
      reason: 'referenced-by-show-response',
    });
  }
}

export function useFullShow(
  showUuid: string | undefined
): NetworkBackedResults<ShowWithSources | undefined> {
  const realm = useRealm();
  const behavior = useMemo(() => {
    return new ShowWithFullSourcesNetworkBackedBehavior(realm, showUuid);
  }, [realm, showUuid]);

  return useNetworkBackedBehavior(behavior);
}

export function useFullShowWithSelectedSource(showUuid: string, selectedSourceUuid: string) {
  const results = useFullShow(String(showUuid));
  const show = results.data?.show;
  const sources = results.data?.sources;
  const fallbackArtistUuid = show?.artistUuid ?? sources?.[0]?.artistUuid ?? '__missing__';
  const fallbackArtists = useQuery(
    Artist,
    (query) => query.filtered('uuid == $0 AND retiredAt == nil', fallbackArtistUuid),
    [fallbackArtistUuid]
  );
  const fallbackArtist = fallbackArtists[0];
  const libraryIndex = useOfflineAvailabilityIndex();

  const sortedSources = useMemo(() => {
    if (!sources) return [];

    return sortSources(sources, libraryIndex);
  }, [libraryIndex, sources]);

  const selectedSource =
    selectedSourceUuid === 'initial'
      ? (sortedSources.find((source) => source.isFavorite) ?? sortedSources[0])
      : sortedSources.find((source) => source.uuid === selectedSourceUuid);

  return {
    results,
    show: show!,
    sources: sortedSources,
    artist: show?.artist ?? selectedSource?.artist ?? sortedSources[0]?.artist ?? fallbackArtist,
    selectedSource,
  };
}

export function upsertShowWithSources(
  realm: Realm.Realm,
  apiData: ApiShowWithSources
): Show | undefined {
  const existingShow = realm.objectForPrimaryKey(Show, apiData.uuid) || undefined;
  const existingSources = activeCatalogResults(realm.objects(Source)).filtered(
    'showUuid == $0',
    apiData.uuid
  );
  const behavior = new ShowWithFullSourcesNetworkBackedBehavior(realm, apiData.uuid);

  behavior.upsert({ show: existingShow, sources: existingSources }, apiData);

  return activeCatalogObjectForPrimaryKey(
    realm,
    Show,
    apiData.uuid,
    'show-repository.imperative-upsert'
  );
}
