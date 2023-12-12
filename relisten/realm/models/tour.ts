import Realm from 'realm';
import { TourWithShowCount } from '../../api/models/tour';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import dayjs from 'dayjs';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface TourRequiredRelationships {}

export interface TourRequiredProperties extends RelistenObjectRequiredProperties {
  uuid: string;
  createdAt: Date;
  updatedAt: Date;
  artistUuid: string;
  startDate: Date;
  endDate: Date;
  name: string;
  slug: string;
  upstreamIdentifier: string;
  showsOnTour?: number;
}

export class Tour
  extends Realm.Object<Tour, keyof TourRequiredProperties & keyof TourRequiredRelationships>
  implements TourRequiredRelationships, TourRequiredProperties
{
  static schema: Realm.ObjectSchema = {
    name: 'Tour',
    primaryKey: 'uuid',
    properties: {
      createdAt: 'date',
      updatedAt: 'date',
      artistUuid: 'string',
      startDate: 'date',
      endDate: 'date',
      name: 'string',
      slug: 'string',
      upstreamIdentifier: 'string',
      uuid: 'string',
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  artistUuid!: string;
  startDate!: Date;
  endDate!: Date;
  name!: string;
  slug!: string;
  upstreamIdentifier!: string;
  showsOnTour?: number;

  isFavorite!: boolean;

  static propertiesFromApi(relistenObj: TourWithShowCount): TourRequiredProperties {
    return {
      uuid: relistenObj.uuid,
      createdAt: dayjs(relistenObj.created_at).toDate(),
      updatedAt: dayjs(relistenObj.updated_at).toDate(),
      startDate: dayjs(relistenObj.start_date).toDate(),
      endDate: dayjs(relistenObj.end_date).toDate(),
      artistUuid: relistenObj.artist_uuid,
      name: relistenObj.name,
      upstreamIdentifier: relistenObj.upstream_identifier,
      slug: relistenObj.slug,
      showsOnTour: relistenObj.shows_on_tour,
    };
  }
}
