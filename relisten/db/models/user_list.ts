/*import {Columns, Tables} from '../schema';
import {field, model} from "../../util/db/decorators";
import {Model} from "../../util/db/model";
import dayjs from "dayjs";
import {FieldTypes} from "../../util/db/field_types";

export enum UserListSpecialType {
    Favorites = 'favorites',
}

@model(Tables.userLists)
export class UserList extends Model {
    // static associations = {
    //   user_list_entries: {
    //     type: 'has_many' as const,
    //     foreignKey: Columns.userListEntries.onUserListId,
    //   },
    // };

    @field(Columns.userLists.specialType) specialType!: UserListSpecialType;
    @field(Columns.userLists.title) title!: string;
    @field(Columns.userLists.description) description!: string;
    @field(Columns.userLists.isPlaylist, FieldTypes.Boolean) isPlaylist!: boolean;
    @field(Columns.userLists.isPublic, FieldTypes.Boolean) isPublic!: boolean;
    @field(Columns.userLists.createdAt) createdAt!: dayjs.Dayjs;
}

export type UserListEntryType =
      typeof Columns.userListEntries.sourceId
    | typeof Columns.userListEntries.showId
    | typeof Columns.userListEntries.yearId
    | typeof Columns.userListEntries.artistId
    | typeof Columns.userListEntries.venueId
    | typeof Columns.userListEntries.tourId
    | typeof Columns.userListEntries.userListId
    | typeof Columns.userListEntries.setlistSongId
    | typeof Columns.userListEntries.sourceTrackId
    | typeof Columns.userListEntries.onUserListId
    | typeof Columns.userListEntries.createdAt
;

@model(Tables.userListEntries)
export class UserListEntry extends Model {
    // @relation(Tables.userLists, Columns.userListEntries.onUserListId) onUserList!: Relation<UserList>;
    // @relation(Tables.userLists, Columns.userListEntries.userListId) userList!: Relation<UserList>;
    // @relation(Tables.artists, Columns.userListEntries.artistId) artist!: Relation<Artist>;
    // @relation(Tables.years, Columns.userListEntries.yearId) year!: Relation<Year>;
    // @relation(Tables.shows, Columns.userListEntries.showId) show!: Relation<Show>;
    // @relation(Tables.sources, Columns.userListEntries.sourceId) source!: Relation<Source>;
    // @relation(Tables.venues, Columns.userListEntries.venueId) venue!: Relation<Venue>;
    // @relation(Tables.venues, Columns.userListEntries.tourId) tour!: Relation<Tour>;
    // @relation(Tables.venues, Columns.userListEntries.setlistSongId)
    // setlistSong!: Relation<SetlistSong>;
    // @relation(Tables.venues, Columns.userListEntries.sourceTrackId)
    // sourceTrack!: Relation<SourceTrack>;

    @field(Columns.userListEntries.sourceId) sourceId?: string;
    @field(Columns.userListEntries.showId) showId?: string;
    @field(Columns.userListEntries.yearId) yearId?: string;
    @field(Columns.userListEntries.artistId) artistId?: string;
    @field(Columns.userListEntries.venueId) venueId?: string;
    @field(Columns.userListEntries.tourId) tourId?: string;
    @field(Columns.userListEntries.userListId) userListId?: string;
    @field(Columns.userListEntries.setlistSongId) setlistSongId?: string;
    @field(Columns.userListEntries.sourceTrackId) sourceTrackId?: string;
    @field(Columns.userListEntries.onUserListId) onUserListId!: string;
    @field(Columns.userListEntries.createdAt) createdAt!: string;

    public eventKey(): string {
        return this.sourceId
            || this.showId
            || this.yearId
            || this.artistId
            || this.venueId
            || this.tourId
            || this.userListId
            || this.setlistSongId
            || this.sourceTrackId
            || 'not used'
            ;
    }
}
 */
