// JavaScript equivalent of OfflineSourceMetadata.swift for Realm

import Realm from 'realm';

const FavoritedArtistSchema = {
  name: 'FavoritedArtist',
  primaryKey: 'uuid',
  properties: {
    uuid: 'string',
    created_at: 'date',
  },
};

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
const OfflineTrackState = {
  UNKNOWN: 0,
  DOWNLOAD_QUEUED: 1,
  DOWNLOADING: 2,
  DOWNLOADED: 3,
  DELETING: 4,
};

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
    path: './default.realm', // set to schema path
  });
}

// Example of using the schemas
export async function exampleUsage() {
  const realm = await openRealmDatabase();

  try {
    // Query for favorite tracks
    const favoriteTracks = realm.objects('FavoritedTrack');
    console.log(`You have ${favoriteTracks.length} favorite tracks`);

    // Get offline tracks that are downloaded
    const downloadedTracks = realm
      .objects('OfflineTrack')
      .filtered('state = $0', OfflineTrackState.DOWNLOADED);

    console.log(`You have ${downloadedTracks.length} offline tracks`, downloadedTracks);

    const offlineSources = realm.objects('OfflineSource');
    console.log(`You have ${offlineSources.length} offline sources`, offlineSources);
  } finally {
    realm.close();
  }
}

// exampleUsage();
