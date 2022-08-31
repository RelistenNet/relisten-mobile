import { appSchema, tableName, columnName, tableSchema, TableName } from '@nozbe/watermelondb';
import type Artist from './models/artist';
import type { UserList, UserListEntry } from './models/user_list';
import type Show from './models/show';
import Year from './models/year';

export const Tables = {
  artists: tableName<Artist>('artists'),
  userLists: tableName<UserList>('user_lists'),
  userListEntries: tableName<UserListEntry>('user_list_entries'),
  shows: tableName<Show>('shows'),
  years: tableName<Year>('years'),
};

export const Columns = {
  artists: {
    relistenCreatedAt: columnName('relisten_created_at'),
    relistenUpdatedAt: columnName('relisten_updated_at'),
    musicbrainzId: columnName('musicbrainz_id'),
    name: columnName('name'),
    featured: columnName('featured'),
    slug: columnName('slug'),
    sortName: columnName('sort_name'),
    features: columnName('features'),
    upstreamSources: columnName('upstream_sources'),
    showCount: columnName('show_count'),
    sourceCount: columnName('source_count'),
  },
  userLists: {
    specialType: columnName('special_type'),
    title: columnName('title'),
    description: columnName('description'),
    isPlaylist: columnName('is_playlist'),
    isPublic: columnName('is_public'),
    createdAt: columnName('created_at'),
  },
  userListEntries: {
    onUserListId: columnName('on_user_list_id'),
    artistId: columnName('artist_id'),
    yearId: columnName('year_id'),
    showId: columnName('show_id'),
    sourceId: columnName('source_id'),
    venueId: columnName('venue_id'),
    userListId: columnName('user_list_id'),
    createdAt: columnName('created_at'),
  },
  shows: {
    relistenCreatedAt: columnName('created_at'),
    relistenUpdatedAt: columnName('updated_at'),
    artistId: columnName('artist_id'),
    venueId: columnName('venue_id'),
    tourId: columnName('tour_id'),
    yearId: columnName('year_id'),
    date: columnName('date'),
    avgRating: columnName('avg_rating'),
    avgDuration: columnName('avg_duration'),
    displayDate: columnName('display_date'),
    mostRecentSourceUpdatedAt: columnName('most_recent_source_updated_at'),
    hasSoundboardSource: columnName('has_soundboard_source'),
    hasStreamableFlacSource: columnName('has_streamable_flac_source'),
    sourceCount: columnName('source_count'),
  },
  years: {
    relistenCreatedAt: columnName('created_at'),
    relistenUpdatedAt: columnName('updated_at'),
    showCount: columnName('show_count'),
    sourceCount: columnName('source_count'),
    duration: columnName('duration'),
    avgDuration: columnName('avg_duration'),
    avgRating: columnName('avg_rating'),
    year: columnName('year'),
    artistId: columnName('artist_id'),
  },
};

export const IdentityJsonSanitizer = (json: any) => json;

export const relistenDbSchema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: Tables.artists,
      columns: [
        { name: Columns.artists.relistenCreatedAt, type: 'number' },
        { name: Columns.artists.relistenUpdatedAt, type: 'number' },
        { name: Columns.artists.musicbrainzId, type: 'string' },
        { name: Columns.artists.name, type: 'string' },
        { name: Columns.artists.featured, type: 'number' },
        { name: Columns.artists.slug, type: 'string' },
        { name: Columns.artists.sortName, type: 'string' },
        { name: Columns.artists.features, type: 'string' },
        { name: Columns.artists.upstreamSources, type: 'string' },
        { name: Columns.artists.showCount, type: 'number' },
        { name: Columns.artists.sourceCount, type: 'number' },
      ],
    }),
    tableSchema({
      name: Tables.userLists,
      columns: [
        { name: Columns.userLists.specialType, type: 'string' },
        { name: Columns.userLists.title, type: 'string' },
        { name: Columns.userLists.description, type: 'string' },
        { name: Columns.userLists.isPlaylist, type: 'boolean' },
        { name: Columns.userLists.isPublic, type: 'boolean' },
        { name: Columns.userLists.createdAt, type: 'number' },
      ],
    }),
    tableSchema({
      name: Tables.userListEntries,
      columns: [
        { name: Columns.userListEntries.onUserListId, type: 'string' },
        { name: Columns.userListEntries.artistId, type: 'string' },
        { name: Columns.userListEntries.yearId, type: 'string' },
        { name: Columns.userListEntries.showId, type: 'string' },
        { name: Columns.userListEntries.sourceId, type: 'string' },
        { name: Columns.userListEntries.venueId, type: 'string' },
        { name: Columns.userListEntries.userListId, type: 'string' },
        { name: Columns.userListEntries.createdAt, type: 'number' },
      ],
    }),
    tableSchema({
      name: Tables.shows,
      columns: [
        { name: Columns.shows.relistenCreatedAt, type: 'number' },
        { name: Columns.shows.relistenUpdatedAt, type: 'number' },
        { name: Columns.shows.artistId, type: 'string', isIndexed: true },
        { name: Columns.shows.venueId, type: 'string', isIndexed: true, isOptional: true },
        { name: Columns.shows.tourId, type: 'string', isIndexed: true, isOptional: true },
        { name: Columns.shows.yearId, type: 'string', isIndexed: true, isOptional: true },
        { name: Columns.shows.date, type: 'number' },
        { name: Columns.shows.avgRating, type: 'number' },
        { name: Columns.shows.avgDuration, type: 'number' },
        { name: Columns.shows.displayDate, type: 'string' },
        { name: Columns.shows.mostRecentSourceUpdatedAt, type: 'number' },
        { name: Columns.shows.hasSoundboardSource, type: 'boolean' },
        { name: Columns.shows.hasStreamableFlacSource, type: 'boolean' },
        { name: Columns.shows.sourceCount, type: 'number' },
      ],
    }),
    tableSchema({
      name: Tables.years,
      columns: [
        { name: Columns.years.relistenCreatedAt, type: 'number' },
        { name: Columns.years.relistenUpdatedAt, type: 'number' },
        { name: Columns.years.showCount, type: 'number' },
        { name: Columns.years.sourceCount, type: 'number' },
        { name: Columns.years.duration, type: 'number', isOptional: true },
        { name: Columns.years.avgDuration, type: 'number', isOptional: true },
        { name: Columns.years.avgRating, type: 'number', isOptional: true },
        { name: Columns.years.year, type: 'string' },
        { name: Columns.years.artistId, isIndexed: true, type: 'string' },
      ],
    }),
  ],
});
