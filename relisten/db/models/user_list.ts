import { Model, Q, Query, Relation } from '@nozbe/watermelondb';
import { field, relation } from '@nozbe/watermelondb/decorators';
import { Columns, Tables } from '../schema';
import type Artist from './artist';
import type Year from './year';
import type Show from './show';
import type Source from './source';
import type Venue from './venue';
import { Favoritable } from '../database';
import type SetlistSong from './setlist_song';
import type SourceTrack from './source_track';
import type Tour from './tour';

export enum UserListSpecialType {
  Favorites = 'favorites',
}

export class UserList extends Model {
  static table = Tables.userLists;
  static associations = {
    user_list_entries: {
      type: 'has_many' as const,
      foreignKey: Columns.userListEntries.onUserListId,
    },
  };

  @field(Columns.userLists.specialType) specialType!: UserListSpecialType;
  @field(Columns.userLists.title) title!: string;
  @field(Columns.userLists.description) description!: string;
  @field(Columns.userLists.isPlaylist) isPlaylist!: boolean;
  @field(Columns.userLists.isPublic) isPublic!: boolean;
  @field(Columns.userLists.createdAt) createdAt!: Date;
}

export class UserListEntry extends Model {
  static table = Tables.userListEntries;

  @relation(Tables.userLists, Columns.userListEntries.onUserListId) onUserList!: Relation<UserList>;
  @relation(Tables.userLists, Columns.userListEntries.userListId) userList!: Relation<UserList>;
  @relation(Tables.artists, Columns.userListEntries.artistId) artist!: Relation<Artist>;
  @relation(Tables.years, Columns.userListEntries.yearId) year!: Relation<Year>;
  @relation(Tables.shows, Columns.userListEntries.showId) show!: Relation<Show>;
  @relation(Tables.sources, Columns.userListEntries.sourceId) source!: Relation<Source>;
  @relation(Tables.venues, Columns.userListEntries.venueId) venue!: Relation<Venue>;
  @relation(Tables.venues, Columns.userListEntries.tourId) tour!: Relation<Tour>;
  @relation(Tables.venues, Columns.userListEntries.setlistSongId)
  setlistSong!: Relation<SetlistSong>;
  @relation(Tables.venues, Columns.userListEntries.sourceTrackId)
  sourceTrack!: Relation<SourceTrack>;

  @field(Columns.userListEntries.sourceId) sourceId!: string;
  @field(Columns.userListEntries.showId) showId!: string;
  @field(Columns.userListEntries.yearId) yearId!: string;
  @field(Columns.userListEntries.artistId) artistId!: string;
  @field(Columns.userListEntries.venueId) venueId!: string;
  @field(Columns.userListEntries.tourId) tourId!: string;
  @field(Columns.userListEntries.userListId) userListId!: string;
  @field(Columns.userListEntries.setlistSongId) setlistSongId!: string;
  @field(Columns.userListEntries.sourceTrackId) sourceTrackId!: string;
  @field(Columns.userListEntries.onUserListId) onUserListId!: string;
  @field(Columns.userListEntries.createdAt) createdAt!: string;
}

export function onListsProperty(model: Favoritable): Query<UserList> {
  return model.database.collections
    .get<UserList>(Tables.userLists)
    .query(
      Q.on(Tables.userListEntries, Columns.userListEntries[model.favoriteIdProperty], model.id)
    );
}
