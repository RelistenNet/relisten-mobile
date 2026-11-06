import { encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { FavoriteCatalogTarget } from '@/relisten/library/favorite_catalog_target';
import { ArtistVenue, NormalizedVenue } from './catalog';
import { Venue } from './venue';

/** Holds the venue or artist/place relationship; display fields are read on demand. */
export class VenueItem {
  constructor(readonly record: Venue | ArtistVenue | NormalizedVenue) {}

  private get venue() {
    if (this.record instanceof ArtistVenue) return this.record.venue;
    return this.record;
  }
  get uuid() {
    const venue = this.venue;
    if (venue instanceof Venue) return encodeUuidCatalogId(venue.uuid, 'imported_venue');
    return venue.id;
  }
  get artistUuid() {
    if (this.record instanceof NormalizedVenue) return undefined;
    return this.record.artistUuid;
  }
  get name() {
    return this.venue.name;
  }
  get location() {
    const venue = this.venue;
    if (venue instanceof Venue) return venue.location;
    return [venue.city, venue.region, venue.country].filter(Boolean).join(', ');
  }
  get aliases() {
    const venue = this.venue;
    if (venue instanceof Venue) return venue.pastNames ?? '';
    return Array.from(venue.names, (name) => name.name).join(' ');
  }
  get showCount() {
    if (this.record instanceof Venue) return this.record.showsAtVenue;
    if (this.record instanceof ArtistVenue) return this.record.artistShowCount;
    return this.record.globalShowCount;
  }
  get favorite(): FavoriteCatalogTarget {
    const venue = this.venue;
    if (venue instanceof Venue) return { targetKind: 'imported_venue', catalogId: venue.uuid };
    return { targetKind: 'venue', catalogId: venue.id };
  }
}
