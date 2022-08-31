import { Model, Q } from '@nozbe/watermelondb';
import { date, field, json, lazy, writer } from '@nozbe/watermelondb/decorators';
import { Columns, IdentityJsonSanitizer, Tables } from '../schema';
import type { UserList } from './user_list';
import { UserListEntry, UserListSpecialType } from './user_list';
import { distinctUntilChanged, map as map$ } from 'rxjs/operators';
import { ArtistUpstreamSource, ArtistWithCounts, Features } from '../../api/models/artist';
import dayjs from 'dayjs';
import { CopyableFromApi, Favoritable, UpdatableFromApi } from '../database';
import { findOrCreateFavoritesList } from './favorites';

const Column = Columns.artists;

export default class Artist
  extends Model
  implements CopyableFromApi<ArtistWithCounts>, UpdatableFromApi, Favoritable
{
  static table = 'artists';
  static associations = {
    user_list_entries: {
      type: 'has_many' as const,
      foreignKey: Columns.userListEntries.artistId,
    },
    shows: { type: 'has_many' as const, foreignKey: Columns.shows.artistId },
    years: { type: 'has_many' as const, foreignKey: Columns.years.artistId },
  };

  @date(Column.relistenCreatedAt) relistenCreatedAt!: Date;
  @date(Column.relistenUpdatedAt) relistenUpdatedAt!: Date;
  @field(Column.musicbrainzId) musicbrainzId!: string;
  @field(Column.name) name!: string;
  @field(Column.featured) featured!: number;
  @field(Column.slug) slug!: string;
  @field(Column.sortName) sortName!: string;
  @json(Column.features, IdentityJsonSanitizer) features!: Features;
  @json(Column.upstreamSources, IdentityJsonSanitizer) upstreamSources!: ArtistUpstreamSource[];
  @field(Column.showCount) showCount!: number;
  @field(Column.sourceCount) sourceCount!: number;

  @lazy onLists = this.collections
    .get<UserList>(Tables.userLists)
    .query(Q.on(Tables.userListEntries, Columns.userListEntries.artistId, this.id));
  favoriteIdColumn = Columns.userListEntries.artistId;

  matchesEntry(entry: UserListEntry) {
    return entry.artist.id === this.id;
  }

  @lazy isFavorite = this.onLists.observe().pipe(
    map$((lists) => {
      for (const list of lists) {
        if (list.specialType == UserListSpecialType.Favorites) {
          return true;
        }
      }

      return false;
    }),
    distinctUntilChanged()
  );

  @writer
  async setIsFavorite(favorite: boolean) {
    const userList = await findOrCreateFavoritesList(this.database);

    const userListEntries = this.collections.get<UserListEntry>(Tables.userListEntries);

    const entries = await userListEntries
      .query(
        Q.and(
          Q.where(Columns.userListEntries.onUserListId, userList.id),
          Q.where(Columns.userListEntries.artistId, this.id)
        )
      )
      .fetch();

    const dbIsFavorited = entries.length > 0;

    if (favorite && !dbIsFavorited) {
      await userListEntries.create((entry) => {
        entry.artist.id = this.id;
        entry.onUserList.id = userList.id;
      });
    } else if (!favorite && dbIsFavorited) {
      await entries[0].destroyPermanently();
    }
  }

  copyFromApi(artistWithCounts: ArtistWithCounts) {
    this.relistenCreatedAt = dayjs(artistWithCounts.created_at).toDate();
    this.relistenUpdatedAt = dayjs(artistWithCounts.updated_at).toDate();
    this.musicbrainzId = artistWithCounts.musicbrainz_id;
    this.name = artistWithCounts.name;
    this.featured = artistWithCounts.featured;
    this.slug = artistWithCounts.slug;
    this.sortName = artistWithCounts.sort_name;
    this.features = artistWithCounts.features;
    this.upstreamSources = artistWithCounts.upstream_sources;
    this.showCount = artistWithCounts.show_count;
    this.sourceCount = artistWithCounts.source_count;
  }
}
