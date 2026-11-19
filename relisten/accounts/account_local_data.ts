import Realm from 'realm';
import { AccountProfile, PendingUsernameCommand } from '@/relisten/realm/models/accounts';
import {
  AnonymousFavoriteImport,
  FavoriteMutation,
  FavoriteSyncState,
  UserFavorite,
} from '@/relisten/realm/models/library';
import {
  forgetAccountPlaylists,
  hideAccountPlaylists,
} from '@/relisten/playlists/sync/playlist_sync_state';

/**
 * Removes everything on the device that belongs to a deleted account:
 * favorites and their unsent changes, playlists and their unsent edits, the
 * cached profile, and a pending username. Downloads and listening history
 * belong to the device and stay.
 *
 * Call this only after the server accepted the deletion (`202`). Every table
 * that stores an account's data needs a line here.
 */
export function forgetDeletedAccount(realm: Realm, userId: string) {
  realm.write(() => {
    realm.delete(realm.objects(UserFavorite).filtered('scopeId == $0', userId));
    realm.delete(realm.objects(FavoriteMutation).filtered('scopeId == $0', userId));
    realm.delete(realm.objects(FavoriteSyncState).filtered('scopeId == $0', userId));
    realm.delete(
      realm.objects(AnonymousFavoriteImport).filtered('destinationScopeId == $0', userId)
    );

    forgetAccountPlaylists(realm, userId);

    deleteByPrimaryKey(realm, PendingUsernameCommand, userId);
    deleteByPrimaryKey(realm, AccountProfile, userId);
  });
}

/**
 * The session ended before deletion was confirmed, so the account may or may
 * not still exist. Nothing is deleted. The account's playlists are hidden, as
 * its favorites already are once signed out. Signing in again shows them.
 */
export function hideUnconfirmedAccount(realm: Realm, userId: string) {
  realm.write(() => hideAccountPlaylists(realm, userId));
}

function deleteByPrimaryKey(
  realm: Realm,
  type: typeof AccountProfile | typeof PendingUsernameCommand,
  key: string
) {
  const row = realm.objectForPrimaryKey<AccountProfile | PendingUsernameCommand>(type, key);
  if (row) {
    realm.delete(row);
  }
}
