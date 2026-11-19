import Realm from 'realm';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';

/**
 * Turning history off discards every play that hasn't been reported, so
 * nothing recorded before the change is sent later. Reported plays stay in
 * the device's history.
 */
export function discardUnreportedPlays(realm: Realm) {
  const unreported = realm.objects(PlaybackHistoryEntry).filtered('publishedAt == null');
  if (unreported.length > 0) {
    realm.write(() => realm.delete(unreported));
  }
}

/**
 * The account was deleted: its plays not yet uploaded never will be. Runs in
 * a write owned by the caller. Plays already uploaded stay in the device's
 * history, which was never the account's.
 */
export function forgetAccountPlays(realm: Realm, userId: string) {
  realm.delete(
    realm
      .objects(PlaybackHistoryEntry)
      .filtered('publishedAt == null AND destinationUserId == $0', userId)
  );
}
