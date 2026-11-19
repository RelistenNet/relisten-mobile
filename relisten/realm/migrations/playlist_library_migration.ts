import Realm from 'realm';

/** Schema 26 split who owns a playlist from whose library holds it on this device. */
const LIBRARY_USER_SCHEMA_VERSION = 26;

interface LegacyPlaylist {
  ownerUserId?: string;
  libraryUserId?: string;
  access: string;
}

/**
 * Before schema 26, `ownerUserId` meant both who made a playlist and whose
 * library it was in, and every stored playlist was made by that account. The
 * library user is therefore the owner. Realm doesn't fill a new property's
 * default into existing rows, so `access` is written too.
 */
export function migratePlaylistLibraryUsers(oldRealm: Realm, newRealm: Realm) {
  if (oldRealm.schemaVersion >= LIBRARY_USER_SCHEMA_VERSION) {
    return;
  }
  if (!oldRealm.schema.some((model) => model.name === 'Playlist')) {
    return;
  }

  for (const playlist of newRealm.objects<LegacyPlaylist>('Playlist')) {
    playlist.libraryUserId = playlist.ownerUserId;
    playlist.access = 'owner';
  }
}
