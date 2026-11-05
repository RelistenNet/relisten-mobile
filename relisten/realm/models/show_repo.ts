import { decodeUuidCatalogId, encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { ShowResource } from '@/relisten/api/catalog/resources';
import { LibraryIndex } from '@/relisten/realm/library_index';
import { NetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior';
import { useLibraryMembershipRevision, useRootLibraryIndex } from '@/relisten/realm/root_services';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import {
  CombinedValueStream,
  RealmObjectValueStream,
  RealmQueryValueStream,
  ValueStream,
} from '@/relisten/realm/value_streams';
import { useGroupSegment } from '@/relisten/util/routes';
import { useMemo } from 'react';
import Realm from 'realm';
import { firstBy } from 'thenby';
import { RelistenApiClient, RelistenApiResponse, RelistenApiResponseType } from '../../api/client';
import { NetworkBackedBehaviorOptions } from '../network_backed_behavior';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { NetworkBackedResults } from '../network_backed_results';
import { applyFullShow } from '../catalog_apply';
import { Artist } from './artist';
import { ensureCatalogArtist } from './artist_repo';
import { Show } from './show';
import { Source } from './source';

export interface ShowWithSources {
  show: Show | undefined;
  sources: Realm.Results<Source>;
}

// our magic live music sort, taken from relisten-web
// gives precedence to favorites -> soundboards -> charlie miller/peter costello -> etree ids -> avg weighted rating
// https://github.com/RelistenNet/relisten-web/blob/69e05607c0a0699b5ccb0b3711a3ec17faf3a855/src/redux/modules/tapes.js#L63
export const sortSources = (
  sources: Realm.Results<Source>,
  libraryIndex?: Pick<LibraryIndex, 'sourceHasOfflineTracks' | 'isFavorite'>
) => {
  const sortedSources = sources
    ? Array.from(sources).sort(
        firstBy(
          // sort first if favorited or downloaded
          (source: Source) =>
            !!libraryIndex?.isFavorite('source', source.uuid) ||
            source.hasOfflineTracks(libraryIndex),
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
          .thenBy((t) => t.avgRatingWeighted, 'desc')
      )
    : [];

  return sortedSources;
};

export class ShowWithFullSourcesNetworkBackedBehavior extends NetworkBackedBehavior<
  ShowWithSources,
  ShowResource
> {
  constructor(
    realm: Realm.Realm,
    public showUuid?: string,
    public sourceUuid?: string,
    private includeDeleted = false,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  get queryKey() {
    return this.showUuid ? `GET /shows/${encodeUuidCatalogId(this.showUuid, 'show')}` : undefined;
  }

  async fetchFromApi(
    api: RelistenApiClient,
    _force: boolean,
    etag?: string
  ): Promise<RelistenApiResponse<ShowResource>> {
    if (!this.showUuid) {
      return { type: RelistenApiResponseType.Offline };
    }
    const response = await api.showWithSources(this.showUuid, { etag });
    if (response.data) {
      await ensureCatalogArtist(
        this.realm,
        api,
        decodeUuidCatalogId(response.data.artist_id, 'artist')
      );
    }
    return response;
  }

  hasLocalData() {
    const show = this.showUuid ? this.realm.objectForPrimaryKey(Show, this.showUuid) : null;
    return show !== null && this.realm.objectForPrimaryKey(Artist, show.artistUuid) !== null;
  }

  override createLocalUpdatingResults(): ValueStream<ShowWithSources> {
    if (this.sourceUuid !== undefined && this.showUuid === undefined) {
      const source = this.realm.objectForPrimaryKey(Source, this.sourceUuid);

      if (source && (this.includeDeleted || source.deletedAt == null)) {
        this.showUuid = source.showUuid;
      }
    }

    const showUuid = this.showUuid || '__no_show_sentinel__';

    const showResults = new RealmObjectValueStream(this.realm, Show, showUuid);
    const sourcePredicate = this.includeDeleted
      ? 'showUuid == $0'
      : 'showUuid == $0 && deletedAt == nil';
    const sourcesResults = new RealmQueryValueStream<Source>(
      this.realm,
      this.realm.objects(Source).filtered(sourcePredicate, showUuid)
    );

    return new CombinedValueStream(showResults, sourcesResults, (show, sources) => {
      return {
        show: show && (this.includeDeleted || show.deletedAt == null) ? show : undefined,
        sources,
      };
    });
  }

  isLocalDataShowable(localData: ShowWithSources): boolean {
    return localData.show != null;
  }

  override upsert(_data: ShowWithSources, resource: ShowResource) {
    if (decodeUuidCatalogId(resource.id, 'show') !== this.showUuid) {
      throw new Error('Unexpected show identity.');
    }
    return applyFullShow(this.realm, resource);
  }
}

export function useFullShow(
  showUuid: string | undefined
): NetworkBackedResults<ShowWithSources | undefined> {
  const realm = useRealm();
  const includeDeleted = useGroupSegment() !== '(artists)';
  const behavior = useMemo(() => {
    return new ShowWithFullSourcesNetworkBackedBehavior(realm, showUuid, undefined, includeDeleted);
  }, [realm, showUuid, includeDeleted]);

  return useNetworkBackedBehavior(behavior);
}

export function useFullShowWithSelectedSource(showUuid: string, selectedSourceUuid: string) {
  const results = useFullShow(String(showUuid));
  const show = results.data?.show;
  const sources = results.data?.sources;
  const artistUuid = show?.artistUuid ?? sources?.[0]?.artistUuid ?? '__missing__';
  // Query the selected row without eagerly wrapping the artist's inverse track collection.
  const fallbackArtists = useQuery(Artist, (query) => query.filtered('uuid == $0', artistUuid), [
    artistUuid,
  ]);
  const fallbackArtist = fallbackArtists[0];
  const libraryIndex = useRootLibraryIndex();
  const libraryMembershipRevision = useLibraryMembershipRevision();

  const sortedSources = useMemo(() => {
    if (!sources) {
      return [];
    }

    return sortSources(sources, libraryIndex);
  }, [libraryIndex, libraryMembershipRevision, sources]);

  // default sourceUuid is initial which will just fall back to sortedSources[0]
  const selectedSource =
    sortedSources.find(
      (source) =>
        source.uuid === selectedSourceUuid ||
        // Prioritize favorited sources by default
        (selectedSourceUuid === 'initial' && libraryIndex.isFavorite('source', source.uuid))
    ) ?? sortedSources[0];

  return {
    results,
    show: show!,
    sources: sortedSources,
    artist: show?.artist ?? selectedSource?.artist ?? sortedSources[0]?.artist ?? fallbackArtist,
    selectedSource,
  };
}

/** Imperative callers (random/deep links/CarPlay) use the same repository mapping. */
export function upsertShowWithSources(realm: Realm, resource: ShowResource): Show {
  realm.write(() => applyFullShow(realm, resource));
  return realm.objectForPrimaryKey(Show, decodeUuidCatalogId(resource.id, 'show'))!;
}
