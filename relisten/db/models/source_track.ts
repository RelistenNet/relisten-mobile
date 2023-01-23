import { Columns, Tables } from '../schema';
import { Model, Relation } from '@nozbe/watermelondb';
import { CopyableFromApi, Favoritable, UpdatableFromApi } from '../database';
import { SourceTrack as ApiSourceTrack } from '../../api/models/source_tracks';
import { date, field, lazy, relation } from '@nozbe/watermelondb/decorators';
import { onListsProperty } from './user_list';
import dayjs from 'dayjs';
import Artist from './artist';
import { defaultSetIsFavoriteBehavior, isFavoriteProperty } from './favorites';
import type SourceSet from './source_set';

const Column = Columns.sourceTracks;

export default class SourceTrack
  extends Model
  implements CopyableFromApi<ApiSourceTrack>, UpdatableFromApi, Favoritable
{
  static table = Tables.sourceTracks;

  @relation(Tables.artists, Column.artistId) artist!: Relation<Artist>;
  @relation(Tables.sourceSets, Column.sourceSetId) sourceSet!: Relation<SourceSet>;

  @date(Column.relistenCreatedAt) relistenCreatedAt!: Date;
  @date(Column.relistenUpdatedAt) relistenUpdatedAt!: Date;
  @field(Column.sourceId) sourceId!: string;
  @field(Column.showId) showId!: string;
  @field(Column.sourceSetId) sourceSetId!: string;
  @field(Column.artistId) artistId!: string;
  @field(Column.trackPosition) trackPosition!: number;
  @field(Column.duration) duration!: number | null;
  @field(Column.title) title!: string;
  @field(Column.slug) slug!: string;
  @field(Column.mp3Url) mp3Url!: string | null;
  @field(Column.mp3Md5) mp3Md5!: string | null;
  @field(Column.flacUrl) flacUrl!: string | null;
  @field(Column.flacMd5) flacMd5!: string | null;

  favoriteIdProperty = 'sourceTrackId' as const;
  @lazy onLists = onListsProperty(this);
  @lazy isFavorite = isFavoriteProperty(this);

  setIsFavorite = defaultSetIsFavoriteBehavior(this);

  copyFromApi(relistenObj: ApiSourceTrack): void {
    this.showId = relistenObj.__injected_show_uuid;
    this.relistenCreatedAt = dayjs(relistenObj.created_at).toDate();
    this.relistenUpdatedAt = dayjs(relistenObj.updated_at).toDate();
    this.sourceId = relistenObj.source_uuid;
    this.sourceSetId = relistenObj.source_set_uuid;
    this.artistId = relistenObj.artist_uuid;
    this.trackPosition = relistenObj.track_position;
    this.duration = relistenObj.duration || null;
    this.title = relistenObj.title;
    this.slug = relistenObj.slug;
    this.mp3Url = relistenObj.mp3_url || null;
    this.mp3Md5 = relistenObj.mp3_md5 || null;
    this.flacUrl = relistenObj.flac_url || null;
    this.flacMd5 = relistenObj.flac_md5 || null;
  }
}
