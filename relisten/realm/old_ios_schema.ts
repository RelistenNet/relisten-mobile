// JavaScript equivalent of OfflineSourceMetadata.swift for Realm
import { log } from '@/relisten/util/logging';
import { Directory, File, Paths } from 'expo-file-system';
import { LegacyApiClient } from '@/relisten/api/legacy_client';

const logger = log.extend('migration');

export interface FavoritedSource {
  uuid: string;
  created_at: Date;
  artist_uuid: string;
  show_uuid: string;
  show_date: Date;
}

// Define enum for OfflineTrackState
enum OfflineTrackState {
  UNKNOWN = 0,
  DOWNLOAD_QUEUED = 1,
  DOWNLOADING = 2,
  DOWNLOADED = 3,
  DELETING = 4,
}

export interface OfflineTrack {
  track_uuid: string;
  artist_uuid: string;
  show_uuid: string;
  source_uuid: string;
  created_at: Date;
  state: OfflineTrackState;
  file_size?: number;
}

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

const LEGACY_DB_PATH = new File(Paths.document, 'default.realm').uri;

let legacyDatabaseExistsPromise: Promise<boolean> | undefined = undefined;

export async function legacyDatabaseExists() {
  if (legacyDatabaseExistsPromise) {
    // only make the fs call one time
    return legacyDatabaseExistsPromise;
  }

  const p = Promise.resolve()
    .then(() => new File(LEGACY_DB_PATH).exists)
    .catch(() => false);

  legacyDatabaseExistsPromise = p;

  return p;
}

async function _loadLegacyDatabaseContents(): Promise<LegacyDatabaseContents> {
  try {
    if (!(await legacyDatabaseExists())) {
      logger.info('No legacy database file found');
      return getEmptyLegacyData();
    }

    // Upload the database file directly using expo-file-system
    const legacyClient = new LegacyApiClient();
    const apiResponse = await legacyClient.uploadRealmDatabase(LEGACY_DB_PATH);

    if (!apiResponse.success) {
      logger.error('Failed to upload legacy database to API');
      return getEmptyLegacyData();
    }

    // Get offline filenames from local directory (this is not handled by the API)
    const legacyDir = new Directory(Paths.document, 'offline-mp3s');
    const legacyDirInfo = Paths.info(legacyDir.uri);
    let offlineFilenames: string[] = [];

    if (legacyDirInfo.exists && legacyDirInfo.isDirectory) {
      offlineFilenames = legacyDir
        .list()
        .filter((entry): entry is File => entry instanceof File)
        .map((entry) => entry.uri)
        .sort();
    }

    // Convert API response to our expected format
    const sources: FavoritedSource[] = apiResponse.data.sources.map((s) => ({
      uuid: s.uuid,
      created_at: new Date(s.created_at),
      artist_uuid: s.artist_uuid,
      show_uuid: s.show_uuid,
      show_date: new Date(s.show_date),
    }));

    const offlineTracksBySource: Record<string, ReadonlyArray<OfflineTrack>> = {};
    for (const [sourceUuid, tracks] of Object.entries(apiResponse.data.offlineTracksBySource)) {
      offlineTracksBySource[sourceUuid] = tracks.map((t) => ({
        track_uuid: t.track_uuid,
        artist_uuid: t.artist_uuid,
        show_uuid: t.show_uuid,
        source_uuid: t.source_uuid,
        created_at: new Date(t.created_at),
        state: t.state as OfflineTrackState,
        file_size: t.file_size,
      }));
    }

    return {
      trackUuids: apiResponse.data.trackUuids,
      showUuids: apiResponse.data.showUuids,
      sources: sources,
      artistUuids: apiResponse.data.artistUuids,
      offlineTracksBySource: offlineTracksBySource,
      offlineFilenames: offlineFilenames,
    };
  } catch (e) {
    logger.error(`Error loading legacy database: ${e}`);
    return getEmptyLegacyData();
  }
}

let loadLegacyDatabaseContentsPromise: Promise<LegacyDatabaseContents> | undefined = undefined;
export async function loadLegacyDatabaseContents(): Promise<LegacyDatabaseContents> {
  if (loadLegacyDatabaseContentsPromise) {
    return loadLegacyDatabaseContentsPromise;
  }

  const p = _loadLegacyDatabaseContents();
  loadLegacyDatabaseContentsPromise = p;

  return p;
}

function getEmptyLegacyData(): LegacyDatabaseContents {
  return {
    trackUuids: [],
    showUuids: [],
    sources: [],
    artistUuids: [],
    offlineTracksBySource: {},
    offlineFilenames: [],
  };
}
