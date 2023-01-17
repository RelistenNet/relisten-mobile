import { Columns, Tables } from '../schema';
import { Model, Relation } from '@nozbe/watermelondb';
import { CopyableFromApi, Favoritable, UpdatableFromApi } from '../database';
import { SetlistSongWithPlayCount as ApiSetlistSong } from '../../api/models/setlist_song';
import { date, field, lazy, relation } from '@nozbe/watermelondb/decorators';
import { onListsProperty } from './user_list';
import dayjs from 'dayjs';
import Artist from './artist';
import { defaultSetIsFavoriteBehavior, isFavoriteProperty } from './favorites';

const Column = Columns.setlistSongs;

export default class SetlistSong
  extends Model
  implements CopyableFromApi<ApiSetlistSong>, UpdatableFromApi, Favoritable
{
  static table = Tables.setlistSongs;
  @relation(Tables.artists, Column.artistId) artist!: Relation<Artist>;

  @date(Column.relistenCreatedAt) relistenCreatedAt!: Date;
  @date(Column.relistenUpdatedAt) relistenUpdatedAt!: Date;
  @field(Column.artistId) artistId!: string;
  @field(Column.name) name!: string;
  @field(Column.slug) slug!: string;
  @field(Column.upstreamIdentifier) upstreamIdentifier!: string;
  @field(Column.sortName) sortName!: string;
  @field(Column.showsPlayedAt) showsPlayedAt!: number;

  favoriteIdProperty = 'setlistSongId' as const;
  @lazy onLists = onListsProperty(this);
  @lazy isFavorite = isFavoriteProperty(this);

  setIsFavorite = defaultSetIsFavoriteBehavior(this);

  copyFromApi(relistenObj: ApiSetlistSong): void {
    this.relistenCreatedAt = dayjs(relistenObj.created_at).toDate();
    this.relistenUpdatedAt = dayjs(relistenObj.updated_at).toDate();
    this.artist.id = relistenObj.artist_uuid;
    this.name = relistenObj.name;
    this.slug = relistenObj.slug;
    this.upstreamIdentifier = relistenObj.upstream_identifier;
    this.sortName = relistenObj.sortName;
    this.showsPlayedAt = relistenObj.shows_played_at;
  }
}
