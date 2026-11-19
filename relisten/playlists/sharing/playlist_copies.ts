import Realm from 'realm';
import { AccountsApiError } from '@/relisten/accounts/api/accounts_api_client';
import { Playlist, PlaylistCopyCommand } from '@/relisten/realm/models/playlists/playlist';
import { createUuidV7TypedId } from '@/relisten/util/typed_uuid_id';
import type { PlaylistCreatedResponse } from './sharing_wire';

/**
 * Make a Copy. The command is stored before it is sent and kept until the
 * server answers, so a retry after a network error, or the next sync after a
 * restart, sends the same command ID and gets back the copy already made.
 * Each function runs inside a Realm write owned by its caller.
 */

/** The listener's unfinished copy of this playlist, or a new one. */
export function copyCommandFor(realm: Realm, userId: string, publicCode: string) {
  return (
    realm
      .objects(PlaylistCopyCommand)
      .filtered('userId == $0 AND publicCode == $1', userId, publicCode)[0] ??
    realm.create(PlaylistCopyCommand, {
      commandId: createUuidV7TypedId('command'),
      publicCode,
      userId,
      createdAt: new Date(),
    })
  );
}

/**
 * Records a copy the server made: the command is done, and the copy is an
 * owned account playlist that the sync fetches by snapshot. The library feed
 * also announces it, which then finds the row already here.
 */
export function finishCopy(
  realm: Realm,
  userId: string,
  commandId: string,
  created: PlaylistCreatedResponse
) {
  const command = realm.objectForPrimaryKey(PlaylistCopyCommand, commandId);
  if (command) {
    realm.delete(command);
  }
  if (realm.objectForPrimaryKey(Playlist, created.playlist_id)) {
    return;
  }
  const now = new Date();
  realm.create(Playlist, {
    playlistId: created.playlist_id,
    name: '',
    createdAt: now,
    updatedAt: now,
    ownerUserId: userId,
    libraryUserId: userId,
    serverState: 'synced',
    summaryRevision: created.revision,
  });
}

/**
 * A refusal that resending can't change: the playlist isn't public (and was
 * never copied with this command), or the account is full. The command is
 * dropped; anything else keeps it for a retry.
 */
export function isFinalCopyRefusal(error: unknown) {
  return (
    error instanceof AccountsApiError &&
    error.status !== null &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

export function dropCopyCommand(realm: Realm, commandId: string) {
  const command = realm.objectForPrimaryKey(PlaylistCopyCommand, commandId);
  if (command) {
    realm.delete(command);
  }
}
