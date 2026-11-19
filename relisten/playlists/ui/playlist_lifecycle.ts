import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useAccountScope } from '@/relisten/accounts/account_context';
import { confirmDestructiveAction } from '@/relisten/components/menus/confirm_destructive_action';
import {
  deletePlaylistOnDevice,
  RECENTLY_DELETED_DAYS,
  restorePlaylistOnDevice,
} from '@/relisten/playlists/playlist_repository';
import { canAccessPlaylist, ownedDeletion } from '@/relisten/playlists/sync/playlist_sync_state';
import { useAccountPlaylistGate } from '@/relisten/playlists/ui/account_playlist_gate';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import type { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { usePlaylistSyncService } from '@/relisten/realm/root_services';
import { useRealm } from '@/relisten/realm/schema';

/**
 * Deleting and restoring a playlist. A device playlist, or an account playlist
 * the server never accepted, moves to Recently Deleted on the device. Any other
 * account playlist is archived on the account, which needs the internet and its
 * owner signed in; it is never queued.
 */
export function usePlaylistLifecycle() {
  const realm = useRealm();
  const router = useRouter();
  const account = useAccountScope();
  const service = usePlaylistSyncService();
  const canReachAccount = useAccountPlaylistGate();

  const setArchived = async (playlist: Playlist, archived: boolean) => {
    const name = playlist.name;
    try {
      await service.setArchived(playlist.playlistId, archived);
      return true;
    } catch {
      showPlaylistToast(`Couldn’t ${archived ? 'delete' : 'restore'} ${name}. Try again.`);
      return false;
    }
  };

  /**
   * How to delete right now: on the device, archived on the account, or not
   * yet (a create is on its way to the server). Explains a "not yet" or an
   * unreachable account and returns undefined.
   */
  const deletionNow = (playlist: Playlist): 'local' | 'archive' | undefined => {
    const deletion = playlist.libraryUserId ? ownedDeletion(realm, playlist) : 'local';
    if (deletion === 'pending') {
      Alert.alert('This playlist is still being saved.', 'Try again in a moment.');
      service.flush();
      return undefined;
    }
    if (deletion === 'archive' && !canReachAccount(playlist, 'delete')) {
      return undefined;
    }
    return deletion;
  };

  const remove = (playlist: Playlist) => {
    const { playlistId, name } = playlist;
    if (!deletionNow(playlist)) {
      return;
    }

    confirmDestructiveAction({
      title: `Delete ${name}?`,
      message: `You can restore it from Recently Deleted for ${RECENTLY_DELETED_DAYS} days.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        // The account or the playlist may have changed while the alert was up,
        // and a new playlist's create may have been sent meanwhile, so decide again.
        if (!playlist.isValid() || !canAccessPlaylist(realm, playlist)) {
          return;
        }
        const deletion = deletionNow(playlist);
        if (!deletion) {
          return;
        }
        const archive = deletion === 'archive';
        if (archive) {
          if (!(await setArchived(playlist, true))) {
            return;
          }
        } else {
          deletePlaylistOnDevice(realm, playlistId);
        }
        router.back();
        showPlaylistToast(`Deleted ${name}`, [
          {
            label: 'Undo',
            onPress: () =>
              archive
                ? void restore(playlist)
                : restorePlaylistOnDevice(realm, playlistId, signedIn()),
          },
        ]);
      },
    });
  };

  const restore = async (playlist: Playlist) => {
    if (playlist.deletedAt) {
      restorePlaylistOnDevice(realm, playlist.playlistId, signedIn());
      return;
    }
    if (canReachAccount(playlist, 'restore')) {
      await setArchived(playlist, false);
    }
  };

  /** The signed-in account, which a restored device playlist is saved to. */
  const signedIn = () => (account.isAuthenticated ? account.userId : undefined) ?? undefined;

  return { remove, restore };
}
