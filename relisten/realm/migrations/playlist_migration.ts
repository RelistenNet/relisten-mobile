import Realm from 'realm';

/**
 * Schema 26 adds `live` to playlist rows. Realm gives a new property on
 * existing objects its type's zero value, not the schema default, so without
 * this every existing track would be hidden and later dropped by a rebuild.
 */
export function migratePlaylistRows(oldRealm: Realm, newRealm: Realm) {
  if (oldRealm.schemaVersion >= 26) {
    return;
  }
  for (const type of ['PlaylistSegment', 'PlaylistEntry']) {
    for (const row of newRealm.objects<{ live: boolean }>(type)) {
      row.live = true;
    }
  }
}
