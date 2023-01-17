import { Columns, Tables } from '../schema';
import { Model, Relation } from '@nozbe/watermelondb';
import { CopyableFromApi, Favoritable, UpdatableFromApi } from '../database';
import { Year as ApiYear } from '../../api/models/year';
import { date, field, lazy, relation } from '@nozbe/watermelondb/decorators';
import { onListsProperty } from './user_list';
import dayjs from 'dayjs';
import Artist from './artist';
import { defaultSetIsFavoriteBehavior, isFavoriteProperty } from './favorites';

const Column = Columns.years;

export default class Year
  extends Model
  implements CopyableFromApi<ApiYear>, UpdatableFromApi, Favoritable
{
  static table = Tables.years;
  static associations = {
    shows: { type: 'has_many' as const, foreignKey: Columns.shows.yearId },
  };
  @relation(Tables.artists, Column.artistId) artist!: Relation<Artist>;

  @date(Column.relistenCreatedAt) relistenCreatedAt!: Date;
  @date(Column.relistenUpdatedAt) relistenUpdatedAt!: Date;
  @field(Column.showCount) showCount!: number;
  @field(Column.sourceCount) sourceCount!: number;
  @field(Column.duration) duration!: number | null;
  @field(Column.avgDuration) avgDuration!: number | null;
  @field(Column.avgRating) avgRating!: number | null;
  @field(Column.year) year!: string;

  favoriteIdProperty = 'yearId' as const;
  @lazy onLists = onListsProperty(this);
  @lazy isFavorite = isFavoriteProperty(this);

  setIsFavorite = defaultSetIsFavoriteBehavior(this);

  copyFromApi(relistenObj: ApiYear): void {
    this.relistenCreatedAt = dayjs(relistenObj.created_at).toDate();
    this.relistenUpdatedAt = dayjs(relistenObj.updated_at).toDate();
    this.showCount = relistenObj.show_count;
    this.sourceCount = relistenObj.source_count;
    this.duration = relistenObj.duration;
    this.avgDuration = relistenObj.avg_duration;
    this.avgRating = relistenObj.avg_rating;
    this.year = relistenObj.year;
    this.artist.id = relistenObj.artist_uuid;
  }
}
