import { Model, Relation } from '@nozbe/watermelondb';
import { CopyableFromApi, Favoritable, UpdatableFromApi } from '../database';
import { Show as ApiShow } from '../../api/models/show';
import { onListsProperty } from './user_list';
import { Columns, Tables } from '../schema';
import { date, field, lazy, relation } from '@nozbe/watermelondb/decorators';
import dayjs from 'dayjs';
import type Year from './year';
import type Artist from './artist';
import { defaultSetIsFavoriteBehavior, isFavoriteProperty } from './favorites';

const Column = Columns.shows;

export default class Show
  extends Model
  implements CopyableFromApi<ApiShow>, UpdatableFromApi, Favoritable
{
  static table = Tables.shows;

  @relation(Tables.years, Columns.shows.yearId) year!: Relation<Year>;
  @relation(Tables.artists, Columns.shows.artistId) artist!: Relation<Artist>;
  @field(Column.venueId) venueId!: string | null;
  @field(Column.tourId) tourId!: string | null;

  @date(Column.relistenCreatedAt) relistenCreatedAt!: Date;
  @date(Column.relistenUpdatedAt) relistenUpdatedAt!: Date;
  @date(Column.date) date!: Date;
  @field(Column.avgRating) avgRating!: number;
  @field(Column.avgDuration) avgDuration!: number | null;
  @field(Column.displayDate) displayDate!: string;
  @date(Column.mostRecentSourceUpdatedAt) mostRecentSourceUpdatedAt!: string;
  @field(Column.hasSoundboardSource) hasSoundboardSource!: boolean;
  @field(Column.hasStreamableFlacSource) hasStreamableFlacSource!: boolean;
  @field(Column.sourceCount) sourceCount!: number;

  favoriteIdProperty = 'showId' as const;
  @lazy onLists = onListsProperty(this);
  @lazy isFavorite = isFavoriteProperty(this);

  setIsFavorite = defaultSetIsFavoriteBehavior(this);

  copyFromApi(relistenObj: ApiShow): void {
    this.relistenCreatedAt = dayjs(relistenObj.created_at).toDate();
    this.relistenUpdatedAt = dayjs(relistenObj.updated_at).toDate();
    this.artist.id = relistenObj.artist_uuid;
    this.venueId = relistenObj.venue_uuid;
    this.tourId = relistenObj.tour_uuid;
    this.year.id = relistenObj.year_uuid;
    this.date = dayjs(relistenObj.date).toDate();
    this.avgRating = relistenObj.avg_rating;
    this.avgDuration = relistenObj.avg_duration;
    this.displayDate = relistenObj.display_date;
    this.mostRecentSourceUpdatedAt = relistenObj.most_recent_source_updated_at;
    this.hasSoundboardSource = relistenObj.has_soundboard_source;
    this.hasStreamableFlacSource = relistenObj.has_streamable_flac_source;
    this.sourceCount = relistenObj.source_count;
  }
}
