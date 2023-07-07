/*import {Columns, Tables} from '../schema';
import {SetlistSongWithPlayCount as ApiSetlistSong} from '../../api/models/setlist_song';
import dayjs from 'dayjs';
import {FieldTypes} from "../../util/db/field_types";
import {CopyableFromApi, UpdatableFromApi} from "./relisten";
import {field, model} from "../../util/db/decorators";
import {Model} from "../../util/db/model";

const Column = Columns.setlistSongs;

@model(Tables.setlistSongs)
export default class SetlistSong
    extends Model
    implements CopyableFromApi<ApiSetlistSong>, UpdatableFromApi/*, Favoritable * {
    // @relation(Tables.artists, Column.artistId) artist!: Relation<Artist>;

    @field(Column.createdAt, FieldTypes.DateTime) createdAt!: dayjs.Dayjs;
    @field(Column.updatedAt, FieldTypes.DateTime) updatedAt!: dayjs.Dayjs;
    @field(Column.artistId) artistId!: string;
    @field(Column.name) name!: string;
    @field(Column.slug) slug!: string;
    @field(Column.upstreamIdentifier) upstreamIdentifier!: string;
    @field(Column.sortName) sortName!: string;
    @field(Column.showsPlayedAt, FieldTypes.Number) showsPlayedAt!: number;

    favoriteIdProperty = 'setlistSongId' as const;
    // @lazy onLists = onListsProperty(this);
    // @lazy isFavorite = isFavoriteProperty(this);
    //
    // setIsFavorite = defaultSetIsFavoriteBehavior(this);

    copyFromApi(relistenObj: ApiSetlistSong): void {
        this.id = relistenObj.uuid;
        this.createdAt = dayjs(relistenObj.created_at);
        this.updatedAt = dayjs(relistenObj.updated_at);
        this.artistId = relistenObj.artist_uuid;
        this.name = relistenObj.name;
        this.slug = relistenObj.slug;
        this.upstreamIdentifier = relistenObj.upstream_identifier;
        this.sortName = relistenObj.sortName;
        this.showsPlayedAt = relistenObj.shows_played_at;
    }
}
*/
