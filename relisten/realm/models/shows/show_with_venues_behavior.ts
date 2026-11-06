import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { ShowSummaryResource as ApiShow } from '@/relisten/api/catalog/resources';
import { Show } from '@/relisten/realm/models/show';
import {
  NetworkBackedBehavior,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { applyShowSummaries } from '@/relisten/realm/catalog_apply';
import Realm from 'realm';
import { ensureCatalogArtist } from '../artist_repo';

export abstract class ShowsWithVenueNetworkBackedBehavior extends NetworkBackedBehavior<
  Realm.Results<Show>,
  ApiShow[]
> {
  constructor(realm: Realm.Realm, options?: NetworkBackedBehaviorOptions) {
    super(realm, options);
  }

  abstract fetchShows(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<ApiShow[] | undefined>>;

  async fetchFromApi(api: RelistenApiClient, force: boolean) {
    const response = await this.fetchShows(api, force);
    if (response.data?.length) {
      const artists = new Set(response.data.map((show) => show.artist_id));
      await Promise.all(
        [...artists].map((id) =>
          ensureCatalogArtist(this.realm, api, decodeUuidCatalogId(id, 'artist'))
        )
      );
    }

    return response;
  }

  isLocalDataShowable(localData: Realm.Results<Show>): boolean {
    return localData.length > 0;
  }

  override upsert(localData: Realm.Results<Show>, apiData: ApiShow[]): void {
    applyShowSummaries(this.realm, apiData);
  }
}
