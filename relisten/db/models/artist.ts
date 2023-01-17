import { Model } from '@nozbe/watermelondb';
import { date, field, json, lazy } from '@nozbe/watermelondb/decorators';
import { Columns, IdentityJsonSanitizer, Tables } from '../schema';
import { onListsProperty } from './user_list';
import { ArtistUpstreamSource, ArtistWithCounts, Features } from '../../api/models/artist';
import dayjs from 'dayjs';
import { CopyableFromApi, Favoritable, UpdatableFromApi } from '../database';
import { defaultSetIsFavoriteBehavior, isFavoriteProperty } from './favorites';

const Column = Columns.artists;

export default class Artist
  extends Model
  implements CopyableFromApi<ArtistWithCounts>, UpdatableFromApi, Favoritable
{
  static table = Tables.artists;

  static associations = {
    user_list_entries: {
      type: 'has_many' as const,
      foreignKey: Columns.userListEntries.artistId,
    },
    shows: { type: 'has_many' as const, foreignKey: Columns.shows.artistId },
    years: { type: 'has_many' as const, foreignKey: Columns.years.artistId },
    venues: { type: 'has_many' as const, foreignKey: Columns.venues.artistId },
    setlist_songs: { type: 'has_many' as const, foreignKey: Columns.setlistSongs.artistId },
    tours: { type: 'has_many' as const, foreignKey: Columns.tours.artistId },
    sources: { type: 'has_many' as const, foreignKey: Columns.sources.artistId },
    source_tracks: { type: 'has_many' as const, foreignKey: Columns.sourceTracks.artistId },
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

  favoriteIdProperty = 'artistId' as const;
  @lazy onLists = onListsProperty(this);
  @lazy isFavorite = isFavoriteProperty(this);

  setIsFavorite = defaultSetIsFavoriteBehavior(this);

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
