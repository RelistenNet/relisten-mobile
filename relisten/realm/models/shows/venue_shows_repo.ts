import type { RelistenApiClient } from '@/relisten/api/client';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type {
  ArtistVenueWithShowsResource,
  ImportedVenueWithShowsResource,
  VenueWithShowsResource,
} from '@/relisten/api/catalog/resources';
import { useMemo } from 'react';
import Realm from 'realm';
import {
  applyArtistVenueDetail,
  applyImportedVenueDetail,
  applyVenueDetail,
} from '../../catalog_apply';
import { CatalogIdentity, CatalogRedirect } from '../../catalog_identity';
import { NetworkBackedBehavior, NetworkBackedBehaviorOptions } from '../../network_backed_behavior';
import { useNetworkBackedBehavior } from '../../network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '../../network_backed_results';
import { useRealm } from '../../schema';
import {
  EmittableValueStream,
  RealmObjectValueStream,
  RealmProjectionValueStream,
  SwitchingValueStream,
  ValueStream,
} from '../../value_streams';
import { ensureCatalogArtist, useArtist } from '../artist_repo';
import { ArtistVenue, NormalizedVenue } from '../catalog';
import { Show, SHOW_LIST_KEY_PATHS } from '../show';
import { Venue } from '../venue';
import { VenueItem } from '../venue_view';

export interface VenueShows {
  venue: VenueItem | null;
  shows: Show[];
  isAvailable: boolean;
}
type VenueDetailResource =
  | ArtistVenueWithShowsResource
  | ImportedVenueWithShowsResource
  | VenueWithShowsResource;
type VenueOwner = Venue | ArtistVenue | NormalizedVenue;
function importedUuid(id: string) {
  if (id.startsWith('imported_venue_')) return decodeUuidCatalogId(id, 'imported_venue');
  return id;
}
function venueShows(realm: Realm, owner: VenueOwner | null) {
  const shows = realm.objects(Show).filtered('deletedAt == nil');
  if (owner instanceof Venue) return shows.filtered('venueUuid == $0', owner.uuid);
  if (owner instanceof ArtistVenue) return shows.filtered('artistVenue.id == $0', owner.id);
  return shows.filtered('artistVenue.venue.id == $0', owner?.id ?? '');
}
function venueResult(realm: Realm, owner: VenueOwner | null): VenueShows {
  return {
    venue: owner ? new VenueItem(owner) : null,
    shows: Array.from(venueShows(realm, owner)),
    isAvailable: owner !== null,
  };
}
/** Follow learned merges, observing only the selected venue's metadata. */
function normalizedVenueStream(realm: Realm, id: string) {
  const redirects = realm.objects(CatalogRedirect);
  const identity = new RealmProjectionValueStream([redirects], () =>
    new CatalogIdentity(redirects).resolve(id)
  );
  return new SwitchingValueStream<NormalizedVenue | Venue | null, string>(identity, (resolved) => {
    const rows = realm.objects(NormalizedVenue).filtered('id == $0', resolved);
    return new RealmProjectionValueStream<NormalizedVenue | Venue | null>(
      [rows],
      () => rows[0] ?? null
    );
  });
}

export class VenueShowsNetworkBackedBehavior extends NetworkBackedBehavior<
  VenueShows,
  VenueDetailResource
> {
  constructor(
    realm: Realm,
    private readonly artistUuid: string | undefined,
    private readonly venueId: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }
  createLocalUpdatingResults() {
    let root: ValueStream<NormalizedVenue | Venue | null>;
    if (this.venueId.startsWith('venue_')) {
      root = normalizedVenueStream(this.realm, this.venueId);
    } else {
      root = new RealmObjectValueStream<NormalizedVenue | Venue>(
        this.realm,
        Venue,
        importedUuid(this.venueId)
      );
    }
    const owner = new SwitchingValueStream<VenueOwner | null, NormalizedVenue | Venue | null>(
      root,
      (venue) => {
        if (!(venue instanceof NormalizedVenue) || !this.artistUuid)
          return new EmittableValueStream<VenueOwner | null>(venue);
        const rows = this.realm
          .objects(ArtistVenue)
          .filtered('artistUuid == $0 AND venueId == $1', this.artistUuid, venue.id);
        return new RealmProjectionValueStream<VenueOwner | null>([rows], () => rows[0] ?? null, [
          'id',
          'artistUuid',
          'venueId',
          'artistShowCount',
          'venue.name',
          'venue.city',
          'venue.region',
          'venue.country',
          'venue.names',
        ]);
      }
    );
    return new SwitchingValueStream(
      owner,
      (owner) =>
        new RealmProjectionValueStream(
          [venueShows(this.realm, owner)],
          () => venueResult(this.realm, owner),
          SHOW_LIST_KEY_PATHS
        )
    );
  }
  async fetchFromApi(api: RelistenApiClient, force: boolean) {
    if (this.artistUuid) await ensureCatalogArtist(this.realm, api, this.artistUuid);
    if (!this.venueId.startsWith('venue_'))
      return api.importedVenue(importedUuid(this.venueId), { force });
    if (this.artistUuid) return api.artistVenue(this.artistUuid, this.venueId, { force });
    const response = await api.venue(this.venueId, { force });
    const artists = new Set(response.data?.shows.map((show) => show.artist_id));
    await Promise.all(
      [...artists].map((id) =>
        ensureCatalogArtist(this.realm, api, decodeUuidCatalogId(id, 'artist'))
      )
    );
    return response;
  }
  isLocalDataShowable(data: VenueShows) {
    return data.isAvailable;
  }
  upsert(_data: VenueShows, resource: VenueDetailResource) {
    if (this.artistUuid && 'venue' in resource) {
      applyArtistVenueDetail(this.realm, this.artistUuid, resource, this.venueId);
      return;
    }
    if (
      this.artistUuid &&
      'upstream_identifier' in resource &&
      decodeUuidCatalogId(resource.id, 'imported_venue') === importedUuid(this.venueId)
    ) {
      applyImportedVenueDetail(this.realm, this.artistUuid, resource);
      return;
    }
    if (!this.artistUuid && 'global_show_count' in resource) {
      applyVenueDetail(this.realm, resource, this.venueId);
      return;
    }
    throw new Error('Unexpected venue detail identity or kind.');
  }
}
export function useVenueShows(artistUuid: string, venueId: string) {
  const realm = useRealm();
  const behavior = useMemo(
    () => new VenueShowsNetworkBackedBehavior(realm, artistUuid, venueId),
    [realm, artistUuid, venueId]
  );
  return useNetworkBackedBehavior(behavior);
}
export function useArtistVenueShows(artistUuid: string, venueId: string) {
  const venue = useVenueShows(artistUuid, venueId);
  const artist = useArtist(artistUuid);
  return useMemo(() => mergeNetworkBackedResults({ venue, artist }), [venue, artist]);
}
export function useGlobalVenueShows(venueId: string) {
  const realm = useRealm();
  const behavior = useMemo(
    () => new VenueShowsNetworkBackedBehavior(realm, undefined, venueId),
    [realm, venueId]
  );
  return useNetworkBackedBehavior(behavior);
}
