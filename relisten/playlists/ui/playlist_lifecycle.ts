import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useAccountScope } from '@/relisten/accounts/account_context';
import { confirmDestructiveAction } from '@/relisten/components/menus/confirm_destructive_action';
import {
  RECENTLY_DELETED_DAYS,
  setPlaylistDeleted,
} from '@/relisten/playlists/playlist_repository';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import type { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { usePlaylistSyncService } from '@/relisten/realm/root_services';
import { useRealm } from '@/relisten/realm/schema';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

/**
 * Deleting and restoring a playlist. A device playlist moves to Recently
 * Deleted locally. An account playlist is archived on the account, which needs
 * the internet and its owner signed in; it is never queued.
 */
export function usePlaylistLifecycle() {
  const realm = useRealm();
  const router = useRouter();
  const account = useAccountScope();
  const service = usePlaylistSyncService();
  const online = useShouldMakeNetworkRequests();

  /** Explains why an account playlist can't change right now, or returns true. */
  const canReachAccount = (playlist: Playlist, action: 'delete' | 'restore') => {
    if (account.userId !== playlist.ownerUserId || !account.isAuthenticated) {
      Alert.alert(`Sign in to ${action} this playlist.`, 'It’s saved to your account.');
      return false;
    }
    if (!online) {
      Alert.alert(`Connect to the internet to ${action} this playlist.`);
      return false;
    }
    return true;
  };

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

  const remove = (playlist: Playlist) => {
    const { playlistId, name } = playlist;
    const owned = !!playlist.ownerUserId;
    if (owned && !canReachAccount(playlist, 'delete')) {
      return;
    }

    confirmDestructiveAction({
      title: `Delete ${name}?`,
      message: `You can restore it from Recently Deleted for ${RECENTLY_DELETED_DAYS} days.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        if (owned) {
          if (!(await setArchived(playlist, true))) {
            return;
          }
        } else {
          setPlaylistDeleted(realm, playlistId, true);
        }
        router.back();
        showPlaylistToast(`Deleted ${name}`, [
          {
            label: 'Undo',
            onPress: () =>
              owned ? void restore(playlist) : setPlaylistDeleted(realm, playlistId, false),
          },
        ]);
      },
    });
  };

  const restore = async (playlist: Playlist) => {
    if (!playlist.ownerUserId) {
      setPlaylistDeleted(realm, playlist.playlistId, false);
      return;
    }
    if (canReachAccount(playlist, 'restore')) {
      await setArchived(playlist, false);
    }
  };

  return { remove, restore };
}
