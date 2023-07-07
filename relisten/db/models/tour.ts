/*import {Columns, Tables} from '../schema';
import {TourWithShowCount} from '../../api/models/tour';
import dayjs from 'dayjs';
import {FieldTypes} from "../../util/db/field_types";
import {CopyableFromApi, UpdatableFromApi} from "./relisten";
import {field, model} from "../../util/db/decorators";
import {Model} from "../../util/db/model";

const Column = Columns.tours;

@model(Tables.tours)
export default class Tour
    extends Model
    implements CopyableFromApi<TourWithShowCount>, UpdatableFromApi/*, Favoritable * {
    static associations = {
        shows: {type: 'has_many' as const, foreignKey: Columns.shows.tourId},
    };
    // @relation(Tables.artists, Column.artistId) artist!: Relation<Artist>;

    @field(Column.createdAt, FieldTypes.DateTime) createdAt!: dayjs.Dayjs;
    @field(Column.updatedAt, FieldTypes.DateTime) updatedAt!: dayjs.Dayjs;
    @field(Column.artistId) artistId!: string;
    @field(Column.startDate, FieldTypes.DateTime) startDate!: dayjs.Dayjs;
    @field(Column.endDate, FieldTypes.DateTime) endDate!: dayjs.Dayjs;
    @field(Column.name) name!: string;
    @field(Column.slug) slug!: string;
    @field(Column.upstreamIdentifier) upstreamIdentifier!: string;

    favoriteIdProperty = 'tourId' as const;
    // @lazy onLists = onListsProperty(this);
    // @lazy isFavorite = isFavoriteProperty(this);
    //
    // setIsFavorite = defaultSetIsFavoriteBehavior(this);

    copyFromApi(relistenObj: TourWithShowCount): void {
        this.id = relistenObj.uuid;
        this.createdAt = dayjs(relistenObj.created_at);
        this.updatedAt = dayjs(relistenObj.updated_at);
        this.artistId = relistenObj.artist_uuid;
        this.startDate = dayjs(relistenObj.start_date);
        this.endDate = dayjs(relistenObj.end_date);
        this.name = relistenObj.name;
        this.slug = relistenObj.slug;
        this.upstreamIdentifier = relistenObj.upstream_identifier;
    }
}
*/
