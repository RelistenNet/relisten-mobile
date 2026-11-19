import Realm from 'realm';

/** Schema 26 split who owns a playlist from whose library holds it on this device. */
const LIBRARY_USER_SCHEMA_VERSION = 26;
/** Schema 28 renamed the outbox's account field to match: `ownerUserId` to `libraryUserId`. */
const OUTBOX_LIBRARY_USER_SCHEMA_VERSION = 28;

interface LegacyPlaylist {
  ownerUserId?: string;
  libraryUserId?: string;
  access: string;
}

interface OutboxRow {
  ownerUserId?: string;
  libraryUserId: string;
}

/**
 * Moves playlists and their outbox to the library-user model:
 *
 * - Before schema 26, `ownerUserId` meant both who made a playlist and whose
 *   library it was in, and every stored playlist was made by that account, so
 *   the library user is the owner. Realm doesn't fill a new property's default
 *   into existing rows, so `access` is written too.
 * - Before schema 28, edits and creates named their account `ownerUserId`. It
 *   was always the library user, so the value carries over under the new name.
 */
export function migratePlaylistLibraryUsers(oldRealm: Realm, newRealm: Realm) {
  if (!oldRealm.schema.some((model) => model.name === 'Playlist')) {
    return;
  }

  if (oldRealm.schemaVersion < LIBRARY_USER_SCHEMA_VERSION) {
    for (const playlist of newRealm.objects<LegacyPlaylist>('Playlist')) {
      playlist.libraryUserId = playlist.ownerUserId;
      playlist.access = 'owner';
    }
  }

  if (oldRealm.schemaVersion < OUTBOX_LIBRARY_USER_SCHEMA_VERSION) {
    copyOutboxAccount(oldRealm, newRealm, 'PlaylistOperation', 'operationId');
    copyOutboxAccount(oldRealm, newRealm, 'PlaylistCommand', 'commandId');
  }
}

function copyOutboxAccount(oldRealm: Realm, newRealm: Realm, model: string, key: string) {
  for (const old of oldRealm.objects<OutboxRow & Record<string, string>>(model)) {
    const row = newRealm.objectForPrimaryKey<OutboxRow>(model, old[key]);
    if (row && old.ownerUserId) {
      row.libraryUserId = old.ownerUserId;
    }
  }
}
