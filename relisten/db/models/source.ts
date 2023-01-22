import { Model, Relation } from '@nozbe/watermelondb';
import { CopyableFromApi, Favoritable, UpdatableFromApi } from '../database';
import { FlacType, Link, SourceFull as ApiSourceFull } from '../../api/models/source';
import { onListsProperty } from './user_list';
import { Columns, IdentityJsonSanitizer, Tables } from '../schema';
import { date, field, json, lazy, relation } from '@nozbe/watermelondb/decorators';
import type Artist from './artist';
import Show from './show';
import Venue from './venue';
import { defaultSetIsFavoriteBehavior, isFavoriteProperty } from './favorites';
import { SourceSetWithTracks } from './source_set';

const Column = Columns.sources;

export default class Source
  extends Model
  implements CopyableFromApi<ApiSourceFull>, UpdatableFromApi, Favoritable
{
  static table = Tables.sources;

  @relation(Tables.years, Column.showId) show!: Relation<Show>;
  @relation(Tables.artists, Column.artistId) artist!: Relation<Artist>;
  @relation(Tables.venues, Column.venueId) venue!: Relation<Venue>;

  @date(Column.relistenCreatedAt) relistenCreatedAt!: Date;
  @date(Column.relistenUpdatedAt) relistenUpdatedAt!: Date;
  @field(Column.artistId) artistId!: string;
  @field(Column.venueId) venueId!: string;
  @date(Column.displayDate) displayDate!: string;
  @field(Column.isSoundboard) isSoundboard!: boolean;
  @field(Column.isRemaster) isRemaster!: boolean;
  @field(Column.hasJamcharts) hasJamcharts!: boolean;
  @field(Column.avgRating) avgRating!: number;
  @field(Column.numReviews) numReviews!: number;
  @field(Column.numRatings) numRatings!: number | undefined;
  @field(Column.avgRatingWeighted) avgRatingWeighted!: number;
  @field(Column.duration) duration!: number | undefined;
  @field(Column.upstreamIdentifier) upstreamIdentifier!: string;
  @field(Column.showId) showId!: string;
  @field(Column.description) description!: string;
  @field(Column.taperNotes) taperNotes!: string;
  @field(Column.source) source!: string;
  @field(Column.taper) taper!: string;
  @field(Column.transferrer) transferrer!: string;
  @field(Column.lineage) lineage!: string;
  @field(Column.flacType) flacType!: FlacType;
  @field(Column.reviewCount) reviewCount!: number;
  @json(Column.links, IdentityJsonSanitizer) links!: Link[];

  favoriteIdProperty = 'sourceId' as const;
  @lazy onLists = onListsProperty(this);
  @lazy isFavorite = isFavoriteProperty(this);

  setIsFavorite = defaultSetIsFavoriteBehavior(this);

  copyFromApi(relistenObj: ApiSourceFull): void {
    this.artistId = relistenObj.artist_uuid;
    this.venueId = relistenObj.venue_uuid;
    this.displayDate = relistenObj.display_date;
    this.isSoundboard = relistenObj.is_soundboard;
    this.isRemaster = relistenObj.is_remaster;
    this.hasJamcharts = relistenObj.has_jamcharts;
    this.avgRating = relistenObj.avg_rating;
    this.numReviews = relistenObj.num_reviews;
    this.numRatings = relistenObj.num_ratings;
    this.avgRatingWeighted = relistenObj.avg_rating_weighted;
    this.duration = relistenObj.duration;
    this.upstreamIdentifier = relistenObj.upstream_identifier;
    this.show.id = relistenObj.show_uuid;
    this.showId = relistenObj.show_uuid;
    this.description = relistenObj.description;
    this.taperNotes = relistenObj.taper_notes;
    this.source = relistenObj.source;
    this.taper = relistenObj.taper;
    this.transferrer = relistenObj.transferrer;
    this.lineage = relistenObj.lineage;
    this.flacType = relistenObj.flac_type;
    this.reviewCount = relistenObj.review_count;
    this.links = relistenObj.links;
  }
}

export interface SourceWithSets {
  source: Source;
  sourceSets: SourceSetWithTracks[];
}
