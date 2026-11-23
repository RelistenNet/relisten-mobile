import type Realm from 'realm';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { SourceTrackOfflineInfoStatus } from '@/relisten/realm/models/source_track_offline_info';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { visiblePlaylists } from '@/relisten/playlists/playlist_hooks';

const ARTIST_LIMIT = 8;
const SHOW_LIMIT = 12;
const TRACK_LIMIT = 40;
const PLAYLIST_LIMIT = 6;

const SUCCEEDED = SourceTrackOfflineInfoStatus.Succeeded;

// The Offline tab's test for "has a completed download", per artist or show
// (see `realm_filters.ts`). The status is inlined so query arguments stay free.
const HAS_DOWNLOADED_TRACK = `SUBQUERY(sourceTracks, $track, $track.offlineInfo.status == ${SUCCEEDED}).@count > 0`;

/** Narrows the list after an artist or show tap; tracks then show without a query. */
export interface LocalNarrowing {
  artistUuid?: string;
  showUuid?: string;
}

export interface LocalSearchResults {
  artists: Artist[];
  shows: Show[];
  tracks: SourceTrack[];
  /** Search only; Add Tracks leaves playlists out. */
  playlists: Playlist[];
}

export const EMPTY_LOCAL_RESULTS: LocalSearchResults = {
  artists: [],
  shows: [],
  tracks: [],
  playlists: [],
};

/**
 * "On this device": what is downloaded and matches the query, used when the
 * app is offline or the server can't search the catalog. Every group is
 * limited to completed downloads, so each row can play, and in Add Tracks be
 * added, without the network.
 */
export function searchLocal(
  realm: Realm,
  rawQuery: string,
  {
    narrowing = {},
    includePlaylists,
    libraryUserId,
  }: { narrowing?: LocalNarrowing; includePlaylists: boolean; libraryUserId: string | null }
): LocalSearchResults {
  const query = rawQuery.trim();
  const narrowed = Boolean(narrowing.artistUuid || narrowing.showUuid);

  if (!query && !narrowed) {
    return EMPTY_LOCAL_RESULTS;
  }

  return {
    artists: narrowed || !query ? [] : searchArtists(realm, query),
    shows: narrowing.showUuid || !query ? [] : searchShows(realm, query, narrowing.artistUuid),
    tracks: searchTracks(realm, query, narrowing),
    playlists:
      includePlaylists && query && !narrowed ? searchPlaylists(realm, query, libraryUserId) : [],
  };
}

function searchArtists(realm: Realm, query: string) {
  return realm
    .objects(Artist)
    .filtered(`deletedAt == nil AND name CONTAINS[c] $0 AND ${HAS_DOWNLOADED_TRACK}`, query)
    .sorted('sortName')
    .slice(0, ARTIST_LIMIT);
}

function searchShows(realm: Realm, query: string, artistUuid: string | undefined) {
  let shows = realm
    .objects(Show)
    .filtered(
      `deletedAt == nil AND (displayDate CONTAINS[c] $0 OR artist.name CONTAINS[c] $0 OR venue.name CONTAINS[c] $0) AND ${HAS_DOWNLOADED_TRACK}`,
      query
    );

  if (artistUuid) {
    shows = shows.filtered('artistUuid == $0', artistUuid);
  }

  return shows.sorted('date', true).slice(0, SHOW_LIMIT);
}

function searchTracks(realm: Realm, query: string, narrowing: LocalNarrowing) {
  let tracks = realm
    .objects(SourceTrack)
    .filtered('deletedAt == nil AND offlineInfo.status == $0', SUCCEEDED);

  if (query) {
    tracks = tracks.filtered('title CONTAINS[c] $0', query);
  }
  if (narrowing.artistUuid) {
    tracks = tracks.filtered('artistUuid == $0', narrowing.artistUuid);
  }
  if (narrowing.showUuid) {
    tracks = tracks.filtered('showUuid == $0', narrowing.showUuid);
  }

  // A narrowed show reads in setlist order; a text match reads newest show first.
  const sorted = narrowing.showUuid
    ? tracks.sorted([
        ['sourceUuid', false],
        ['trackPosition', false],
      ])
    : tracks.sorted([
        ['show.date', true],
        ['trackPosition', false],
      ]);

  return sorted.slice(0, TRACK_LIMIT);
}

function searchPlaylists(realm: Realm, query: string, libraryUserId: string | null) {
  return visiblePlaylists(realm.objects(Playlist), libraryUserId)
    .filtered('name CONTAINS[c] $0 OR description CONTAINS[c] $0', query)
    .slice(0, PLAYLIST_LIMIT);
}
