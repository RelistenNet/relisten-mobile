// JavaScript equivalent of OfflineSourceMetadata.swift for Realm
import Realm from 'realm';
import { log } from '@/relisten/util/logging';
import * as fs from 'expo-file-system';
import { aggregateBy, groupBy } from '@/relisten/util/group_by';

const logger = log.extend('migration');

const FavoritedArtistSchema = {
  name: 'FavoritedArtist',
  primaryKey: 'uuid',
  properties: {
    uuid: 'string',
    created_at: 'date',
  },
};

interface FavoritedArtist {
  uuid: string;
  created_at: Date;
}

const FavoritedShowSchema = {
  name: 'FavoritedShow',
  primaryKey: 'uuid',
  properties: {
    uuid: 'string',
    created_at: 'date',
    show_date: 'date',
    artist_uuid: 'string',
  },
};

interface FavoritedShow {
  uuid: string;
  created_at: Date;
  show_date: Date;
  artist_uuid: string;
}

const FavoritedSourceSchema = {
  name: 'FavoritedSource',
  primaryKey: 'uuid',
  properties: {
    uuid: 'string',
    created_at: 'date',
    artist_uuid: 'string',
    show_uuid: 'string',
    show_date: 'date',
  },
};

export interface FavoritedSource {
  uuid: string;
  created_at: Date;
  artist_uuid: string;
  show_uuid: string;
  show_date: Date;
}

const FavoritedTrackSchema = {
  name: 'FavoritedTrack',
  primaryKey: 'uuid',
  properties: {
    uuid: 'string',
    created_at: 'date',
    artist_uuid: 'string',
    show_uuid: 'string',
    source_uuid: 'string',
  },
};

interface FavoritedTrack {
  uuid: string;
  created_at: Date;
  artist_uuid: string;
  show_uuid: string;
  source_uuid: string;
}

const RecentlyPlayedTrackSchema = {
  name: 'RecentlyPlayedTrack',
  primaryKey: 'uuid',
  properties: {
    uuid: 'string',
    created_at: 'date',
    artist_uuid: 'string',
    show_uuid: 'string',
    source_uuid: 'string',
    track_uuid: 'string',
    updated_at: 'date',
    past_halfway: 'bool',
  },
};

// Define enum for OfflineTrackState
enum OfflineTrackState {
  UNKNOWN = 0,
  DOWNLOAD_QUEUED = 1,
  DOWNLOADING = 2,
  DOWNLOADED = 3,
  DELETING = 4,
}

const OfflineTrackSchema = {
  name: 'OfflineTrack',
  primaryKey: 'track_uuid',
  properties: {
    track_uuid: 'string',
    artist_uuid: 'string',
    show_uuid: 'string',
    source_uuid: 'string',
    created_at: 'date',
    state: 'int',
    file_size: 'int?',
  },
};

export interface OfflineTrack {
  track_uuid: string;
  artist_uuid: string;
  show_uuid: string;
  source_uuid: string;
  created_at: Date;
  state: OfflineTrackState;
  file_size?: number;
}

const OfflineSourceSchema = {
  name: 'OfflineSource',
  primaryKey: 'source_uuid',
  properties: {
    source_uuid: 'string',
    artist_uuid: 'string',
    show_uuid: 'string',
    year_uuid: 'string',
    created_at: 'date',
  },
};

// // Helper functions equivalent to protocol extensions in Swift
// function getArtistFromCache(artistUuid) {
//   // Equivalent to RelistenCacher.artistFromCache implementation
//   return realm.objectForPrimaryKey('ArtistWithCounts', artistUuid);
// }

// function getShowFromCache(showUuid) {
//   // Equivalent to RelistenCacher.showFromCache implementation
//   return realm.objectForPrimaryKey('ShowWithSources', showUuid);
// }

// function getSource(obj) {
//   const show = getShowFromCache(obj.show_uuid);
//   if (!show) return null;

//   return show.sources.find((source) => source.uuid === obj.source_uuid);
// }

// function getCompleteShowInformation(obj) {
//   const show = getShowFromCache(obj.show_uuid);
//   const artist = getArtistFromCache(obj.artist_uuid);

//   if (!show || !artist) return null;

//   const source = show.sources.find((source) => source.uuid === obj.source_uuid);
//   if (!source) return null;

//   return {
//     source,
//     show,
//     artist,
//   };
// }

// function getTrack(obj) {
//   const showInfo = getCompleteShowInformation(obj);
//   if (!showInfo) return null;

//   const sourceTrack = showInfo.source.tracks.find((track) => track.uuid === obj.track_uuid);
//   if (!sourceTrack) return null;

//   return {
//     sourceTrack,
//     showInfo,
//   };
// }

// Export schema for Realm initialization
const schema = [
  FavoritedArtistSchema,
  FavoritedShowSchema,
  FavoritedSourceSchema,
  FavoritedTrackSchema,
  RecentlyPlayedTrackSchema,
  OfflineTrackSchema,
  OfflineSourceSchema,
];

// Example usage:
function openRealmDatabase() {
  return Realm.open({
    schema: schema,
    schemaVersion: 2,
    path: './default.realm',
  });
}

export interface LegacyDatabaseContents {
  trackUuids: string[];
  showUuids: string[];
  sources: FavoritedSource[];
  artistUuids: string[];
  offlineTracksBySource: Record<string, ReadonlyArray<OfflineTrack>>;
  offlineFilenames: string[];
}

export function isLegacyDatabaseEmpty(legacyData: LegacyDatabaseContents) {
  return !(
    legacyData.trackUuids.length > 0 ||
    legacyData.showUuids.length > 0 ||
    legacyData.sources.length > 0 ||
    legacyData.artistUuids.length > 0 ||
    Object.entries(legacyData.offlineTracksBySource).length > 0 ||
    legacyData.offlineFilenames.length > 0
  );
}

// Example of using the schemas
export async function loadLegacyDatabaseContents(): Promise<LegacyDatabaseContents> {
  let realm: Realm.Realm | undefined = undefined;

  try {
    realm = await openRealmDatabase();

    // Query for favorite tracks
    const favoriteTracks = realm
      .objects<FavoritedTrack>('FavoritedTrack')
      .map((o) => o.uuid.toLowerCase())
      .sort();
    const favoriteShows = realm
      .objects<FavoritedShow>('FavoritedShow')
      .map((o) => o.uuid.toLowerCase())
      .sort();
    const favoriteSources: FavoritedSource[] = realm
      .objects<FavoritedSource>('FavoritedSource')
      .map((o) => {
        return {
          uuid: o.uuid.toLowerCase(),
          created_at: o.created_at,
          artist_uuid: o.artist_uuid.toLowerCase(),
          show_uuid: o.show_uuid.toLowerCase(),
          show_date: o.show_date,
        };
      });
    const favoriteArtists = realm
      .objects<FavoritedArtist>('FavoritedArtist')
      .map((o) => o.uuid.toLowerCase())
      .sort();

    // Get offline tracks that are downloaded
    const offlineTracks: OfflineTrack[] = realm
      .objects<OfflineTrack>('OfflineTrack')
      .filtered('state = $0', OfflineTrackState.DOWNLOADED)
      .map((o) => {
        return {
          track_uuid: o.track_uuid.toLowerCase(),
          artist_uuid: o.artist_uuid.toLowerCase(),
          show_uuid: o.show_uuid.toLowerCase(),
          source_uuid: o.source_uuid.toLowerCase(),
          created_at: o.created_at,
          state: o.state,
          file_size: o.file_size,
        };
      });
    const legacyDir = fs.documentDirectory + 'offline-mp3s/';

    const legacyDirInfo = await fs.getInfoAsync(legacyDir);
    let offlineFilenames: string[] = [];

    if (legacyDirInfo.exists && legacyDirInfo.isDirectory) {
      offlineFilenames = (await fs.readDirectoryAsync(legacyDir)).sort().map((f) => legacyDir + f);
    }

    const offlineTracksBySourceUuid = aggregateBy(offlineTracks, (t) => t.source_uuid);

    return {
      trackUuids: favoriteTracks,
      showUuids: favoriteShows,
      sources: favoriteSources,
      artistUuids: favoriteArtists,
      offlineTracksBySource: offlineTracksBySourceUuid,
      offlineFilenames: offlineFilenames,
    };
  } catch (e) {
    logger.error(`Error loading legacy database: ${e}`);
    return {
      trackUuids: [],
      showUuids: [],
      sources: [],
      artistUuids: [],
      offlineTracksBySource: {},
      offlineFilenames: [],
    };
  } finally {
    realm?.close();
  }
}
