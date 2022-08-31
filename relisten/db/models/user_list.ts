import {Model, Relation} from '@nozbe/watermelondb'
import {field, relation} from '@nozbe/watermelondb/decorators'
import {Columns, Tables} from "../schema";
import type Artist from "./artist";
import type Year from "./year";
import type Show from "./show";

export enum UserListSpecialType {
    Favorites = 'favorites'
}

export class UserList extends Model {
    static table = Tables.userLists;
    static associations = {
        user_list_entries: {type: 'has_many' as 'has_many', foreignKey: Columns.userListEntries.onUserListId}
    }

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
    @relation(Tables.years, Columns.userListEntries.showId) show!: Relation<Show>;

    @field(Columns.userListEntries.sourceId) sourceId!: string;
    @field(Columns.userListEntries.venueId) venueId!: string;
    @field(Columns.userListEntries.createdAt) createdAt!: string;
}

