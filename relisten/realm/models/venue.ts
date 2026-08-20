import Realm from 'realm';
import { VenueWithShowCounts } from '../../api/models/venue';
import { FavoritableObject } from '../favoritable_object';

import { RelistenObjectRequiredProperties } from '../relisten_object';
import dayjs from 'dayjs';
import {
  CATALOG_RETIREMENT_SCHEMA_PROPERTIES,
  CatalogRetirementState,
} from '@/relisten/realm/catalog_retirement_schema';

export interface VenueRequiredProperties extends RelistenObjectRequiredProperties {
  createdAt: Date;
  artistUuid: string;
  latitude?: number;
  longitude?: number;
  name: string;
  location: string;
  upstreamIdentifier: string;
  slug: string;
  pastNames?: string;
  sortName: string;
  showsAtVenue: number;
}

export class Venue
  extends Realm.Object<Venue, keyof VenueRequiredProperties>
  implements VenueRequiredProperties, FavoritableObject, CatalogRetirementState
{
  static schema: Realm.ObjectSchema = {
    name: 'Venue',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      ...CATALOG_RETIREMENT_SCHEMA_PROPERTIES,
      artistUuid: 'string',
      latitude: 'double?',
      longitude: 'double?',
      name: 'string',
      location: 'string',
      upstreamIdentifier: 'string',
      slug: 'string',
      pastNames: 'string?',
      sortName: 'string',
      showsAtVenue: 'int',
      isFavorite: { type: 'bool', default: false },
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  retiredAt?: Date;
  retirementReason?: string;
  artistUuid!: string;
  latitude?: number;
  longitude?: number;
  name!: string;
  location!: string;
  upstreamIdentifier!: string;
  slug!: string;
  pastNames?: string;
  sortName!: string;
  showsAtVenue!: number;

  isFavorite!: boolean;

  static propertiesFromApi(relistenObj: VenueWithShowCounts): VenueRequiredProperties {
    return {
      uuid: relistenObj.uuid,
      createdAt: dayjs(relistenObj.created_at).toDate(),
      updatedAt: dayjs(relistenObj.updated_at).toDate(),
      artistUuid: relistenObj.artist_uuid,
      latitude: relistenObj.latitude || undefined,
      longitude: relistenObj.longitude || undefined,
      name: relistenObj.name,
      location: relistenObj.location,
      upstreamIdentifier: relistenObj.upstream_identifier,
      slug: relistenObj.slug,
      pastNames: relistenObj.past_names || undefined,
      sortName: relistenObj.sortName,
      showsAtVenue: relistenObj.shows_at_venue,
    };
  }
}
