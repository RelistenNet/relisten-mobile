import { Columns, Tables } from '../schema';
import { Model, Relation } from '@nozbe/watermelondb';
import { CopyableFromApi, Favoritable, UpdatableFromApi } from '../database';
import { VenueWithShowCounts as ApiVenue } from '../../api/models/venue';
import { date, field, lazy, relation } from '@nozbe/watermelondb/decorators';
import { onListsProperty } from './user_list';
import dayjs from 'dayjs';
import Artist from './artist';
import { defaultSetIsFavoriteBehavior, isFavoriteProperty } from './favorites';

const Column = Columns.venues;

export default class Venue
  extends Model
  implements CopyableFromApi<ApiVenue>, UpdatableFromApi, Favoritable
{
  static table = Tables.venues;
  static associations = {
    shows: { type: 'has_many' as const, foreignKey: Columns.shows.venueId },
  };
  @relation(Tables.artists, Columns.shows.artistId) artist!: Relation<Artist>;

  @date(Column.relistenCreatedAt) relistenCreatedAt!: Date;
  @date(Column.relistenUpdatedAt) relistenUpdatedAt!: Date;
  @field(Column.artistId) artistId!: string;
  @field(Column.latitude) latitude!: number | null;
  @field(Column.longitude) longitude!: number | null;
  @field(Column.name) name!: string;
  @field(Column.location) location!: string;
  @field(Column.upstreamIdentifier) upstreamIdentifier!: string;
  @field(Column.slug) slug!: string;
  @field(Column.pastNames) pastNames!: string;
  @field(Column.sortName) sortName!: string;
  @field(Column.showsAtVenue) showsAtVenue!: number;

  favoriteIdProperty = 'venueId' as const;
  @lazy onLists = onListsProperty(this);
  @lazy isFavorite = isFavoriteProperty(this);

  setIsFavorite = defaultSetIsFavoriteBehavior(this);

  copyFromApi(relistenObj: ApiVenue): void {
    this.relistenCreatedAt = dayjs(relistenObj.created_at).toDate();
    this.relistenUpdatedAt = dayjs(relistenObj.updated_at).toDate();
    this.artist.id = relistenObj.artist_uuid;
    this.latitude = relistenObj.latitude;
    this.longitude = relistenObj.longitude;
    this.name = relistenObj.name;
    this.location = relistenObj.location;
    this.upstreamIdentifier = relistenObj.upstream_identifier;
    this.slug = relistenObj.slug;
  }
}
