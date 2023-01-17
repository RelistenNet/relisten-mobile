import { Columns, Tables } from '../schema';
import { Model, Relation } from '@nozbe/watermelondb';
import { CopyableFromApi, Favoritable, UpdatableFromApi } from '../database';
import { TourWithShowCount } from '../../api/models/tour';
import { date, field, lazy, relation } from '@nozbe/watermelondb/decorators';
import { onListsProperty } from './user_list';
import dayjs from 'dayjs';
import Artist from './artist';
import { defaultSetIsFavoriteBehavior, isFavoriteProperty } from './favorites';

const Column = Columns.tours;

export default class Tour
  extends Model
  implements CopyableFromApi<TourWithShowCount>, UpdatableFromApi, Favoritable
{
  static table = Tables.tours;
  static associations = {
    shows: { type: 'has_many' as const, foreignKey: Columns.shows.tourId },
  };
  @relation(Tables.artists, Column.artistId) artist!: Relation<Artist>;

  @date(Column.relistenCreatedAt) relistenCreatedAt!: Date;
  @date(Column.relistenUpdatedAt) relistenUpdatedAt!: Date;
  @field(Column.artistId) artistId!: string;
  @date(Column.startDate) startDate!: Date;
  @date(Column.endDate) endDate!: Date;
  @field(Column.name) name!: string;
  @field(Column.slug) slug!: string;
  @field(Column.upstreamIdentifier) upstreamIdentifier!: string;

  favoriteIdProperty = 'tourId' as const;
  @lazy onLists = onListsProperty(this);
  @lazy isFavorite = isFavoriteProperty(this);

  setIsFavorite = defaultSetIsFavoriteBehavior(this);

  copyFromApi(relistenObj: TourWithShowCount): void {
    this.relistenCreatedAt = dayjs(relistenObj.created_at).toDate();
    this.relistenUpdatedAt = dayjs(relistenObj.updated_at).toDate();
    this.artistId = relistenObj.artist_uuid;
    this.startDate = dayjs(relistenObj.start_date).toDate();
    this.endDate = dayjs(relistenObj.end_date).toDate();
    this.name = relistenObj.name;
    this.slug = relistenObj.slug;
    this.upstreamIdentifier = relistenObj.upstream_identifier;
  }
}
