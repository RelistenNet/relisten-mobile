import { Columns, Tables } from '../schema';
import { Model, Q, Relation } from '@nozbe/watermelondb';
import { CopyableFromApi, Favoritable, UpdatableFromApi } from '../database';
import { Year as ApiYear } from '../../api/models/year';
import { date, field, lazy, relation, writer } from '@nozbe/watermelondb/decorators';
import type { UserListEntry } from './user_list';
import dayjs from 'dayjs';
import Artist from './artist';
import { UserList, UserListSpecialType } from './user_list';
import { distinctUntilChanged, map as map$ } from 'rxjs/operators';
import { findOrCreateFavoritesList } from './favorites';

const Column = Columns.years;

export default class Year
  extends Model
  implements CopyableFromApi<ApiYear>, UpdatableFromApi, Favoritable
{
  static table = 'years';
  static associations = {
    shows: { type: 'has_many' as const, foreignKey: Columns.shows.yearId },
  };
  @relation(Tables.artists, Columns.shows.artistId) artist!: Relation<Artist>;

  @date(Column.relistenCreatedAt) relistenCreatedAt!: Date;
  @date(Column.relistenUpdatedAt) relistenUpdatedAt!: Date;
  @field(Column.showCount) showCount!: number;
  @field(Column.sourceCount) sourceCount!: number;
  @field(Column.duration) duration!: number | null;
  @field(Column.avgDuration) avgDuration!: number | null;
  @field(Column.avgRating) avgRating!: number | null;
  @field(Column.year) year!: string;

  @lazy onLists = this.collections
    .get<UserList>(Tables.userLists)
    .query(Q.on(Tables.userListEntries, Columns.userListEntries.yearId, this.id));
  favoriteIdColumn = Columns.userListEntries.yearId;

  matchesEntry(entry: UserListEntry) {
    return entry.year.id === this.id;
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

  @writer async setIsFavorite(favorite: boolean): Promise<void> {
    const userList = await findOrCreateFavoritesList(this.database);

    const userListEntries = this.collections.get<UserListEntry>(Tables.userListEntries);

    const entries = await userListEntries
      .query(
        Q.and(
          Q.where(Columns.userListEntries.onUserListId, userList.id),
          Q.where(Columns.userListEntries.yearId, this.id)
        )
      )
      .fetch();

    const dbIsFavorited = entries.length > 0;

    if (favorite && !dbIsFavorited) {
      await userListEntries.create((entry) => {
        entry.year.id = this.id;
        entry.onUserList.id = userList.id;
      });
    } else if (!favorite && dbIsFavorited) {
      await entries[0].destroyPermanently();
    }
  }

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
