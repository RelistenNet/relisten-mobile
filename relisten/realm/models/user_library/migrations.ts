import Realm from 'realm';

const USER_PLAYLIST_ENTRY_SCHEMA_NAME = 'UserPlaylistEntry';

export function migrateUserLibraryRealm(oldRealm: Realm, newRealm: Realm) {
  if (oldRealm.schemaVersion < 15) {
    migratePlaylistEntryPositionsToStrings(oldRealm, newRealm);
  }
}

function migratePlaylistEntryPositionsToStrings(oldRealm: Realm, newRealm: Realm) {
  if (!oldRealm.schema.some((schema) => schema.name === USER_PLAYLIST_ENTRY_SCHEMA_NAME)) {
    return;
  }

  const oldEntries = oldRealm.objects(USER_PLAYLIST_ENTRY_SCHEMA_NAME);
  const newEntries = newRealm.objects(USER_PLAYLIST_ENTRY_SCHEMA_NAME);

  for (let index = 0; index < oldEntries.length; index++) {
    const oldPosition = oldEntries[index].position;

    if (oldPosition == null) {
      continue;
    }

    newEntries[index].position = String(oldPosition);
  }
}
