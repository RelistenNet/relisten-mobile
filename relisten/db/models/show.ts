import {Model, Q, Relation} from "@nozbe/watermelondb";
import {CopyableFromApi, Favoritable, UpdatableFromApi} from "../database";
import {Show as ApiShow} from '../../api/models/show';
import type {UserListEntry} from "./user_list";
import {Columns, Tables} from "../schema";
import {date, field, lazy, relation, writer} from "@nozbe/watermelondb/decorators";
import dayjs from "dayjs";
import type Year from "./year";
import type Artist from "./artist";
import {UserList, UserListSpecialType} from "./user_list";
import {distinctUntilChanged, map as map$} from "rxjs/operators";
import {findOrCreateFavoritesList} from "./favorites";

const Column = Columns.shows;

export default class Show extends Model implements CopyableFromApi<ApiShow>, UpdatableFromApi, Favoritable {
    static table = 'shows';

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

    @lazy onLists = this.collections.get<UserList>(Tables.userLists).query(
        Q.on(Tables.userListEntries, Columns.userListEntries.showId, this.id)
    )
    favoriteIdColumn = Columns.userListEntries.showId;

    matchesEntry(entry: UserListEntry) {
        return entry.show.id === this.id;
    }

    @lazy isFavorite = this.onLists.observe().pipe(
        map$(lists => {
            for (const list of lists) {
                if (list.specialType == UserListSpecialType.Favorites) {
                    return true;
                }
            }

            return false;
        }),
        distinctUntilChanged()
    )

    @writer async setIsFavorite(favorite: boolean): Promise<void> {
        const userList = await findOrCreateFavoritesList(this.database);

        const userListEntries = this.collections.get<UserListEntry>(Tables.userListEntries);

        const entries = await userListEntries
            .query(
                Q.and(
                    Q.where(Columns.userListEntries.onUserListId, userList.id),
                    Q.where(Columns.userListEntries.showId, this.id)
                )
            )
            .fetch();

        const dbIsFavorited = entries.length > 0;

        if (favorite && !dbIsFavorited) {
            await userListEntries.create(entry => {
                entry.show.id = this.id;
                entry.onUserList.id = userList.id;
            });
        } else if (!favorite && dbIsFavorited) {
            await entries[0].destroyPermanently();
        }
    }


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
