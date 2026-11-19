import { useRouter } from 'expo-router';
import { Alert, Platform, Share } from 'react-native';
import { useAccountScope } from '@/relisten/accounts/account_context';
import { accountPath } from '@/relisten/accounts/ui/account_routes';
import type { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { publicPlaylistUrl } from '@/relisten/playlists/sharing/sharing_wire';
import { SharingError } from '@/relisten/playlists/sharing/playlist_sharing_service';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import { usePlaylistSharingService } from '@/relisten/realm/root_services';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

/** Opens the system share sheet for a public playlist's link. */
export function sharePlaylistLink(name: string, publicCode: string) {
  const url = publicPlaylistUrl(publicCode);
  // iOS shares the URL itself, so apps can preview it; Android shares text.
  void Share.share(Platform.OS === 'ios' ? { url, title: name } : { message: url, title: name });
}

/**
 * Share… and Make Private for a playlist the listener made. Sharing needs the
 * playlist saved to the signed-in account; the first share asks to make it
 * public. Both need the internet and are never queued.
 */
export function usePlaylistShareActions() {
  const router = useRouter();
  const account = useAccountScope();
  const online = useShouldMakeNetworkRequests();
  const sharing = usePlaylistSharingService();

  /** Explains why the playlist can't be shared right now, or returns true. */
  const canShare = (playlist: Playlist) => {
    if (!playlist.libraryUserId || !account.isAuthenticated) {
      Alert.alert(
        'Sign in to share this playlist.',
        'Sharing needs a Relisten account. Signing in saves your playlists to it.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push(accountPath('(myLibrary)')) },
        ]
      );
      return false;
    }
    if (account.userId !== playlist.libraryUserId) {
      Alert.alert('Sign in to the account this playlist is saved to, to share it.');
      return false;
    }
    if (playlist.takenDown) {
      Alert.alert(
        'This playlist can’t be shared.',
        'It was removed from public view after a report. It’s still yours to play and edit.'
      );
      return false;
    }
    if (playlist.serverState !== 'synced') {
      Alert.alert(
        'This playlist isn’t saved to your account yet.',
        'You can share it once it’s saved.'
      );
      return false;
    }
    if (!online) {
      Alert.alert('Connect to the internet to share this playlist.');
      return false;
    }
    return true;
  };

  const publishAndShare = async (playlist: Playlist) => {
    const { playlistId, name } = playlist;
    try {
      const publicCode = await sharing.setPublished(playlistId, true);
      if (publicCode) {
        sharePlaylistLink(name, publicCode);
      }
    } catch (error) {
      explainFailure(error, `Couldn’t share ${name}. Try again.`);
    }
  };

  const share = (playlist: Playlist) => {
    if (!canShare(playlist)) {
      return;
    }
    if (playlist.published && playlist.publicCode) {
      sharePlaylistLink(playlist.name, playlist.publicCode);
      return;
    }
    Alert.alert(
      'Make this playlist public?',
      'Anyone with the link can see and play it, and see your username. You can make it private again at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Make Public', onPress: () => void publishAndShare(playlist) },
      ]
    );
  };

  const makePrivate = (playlist: Playlist) => {
    if (!online) {
      Alert.alert('Connect to the internet to make this playlist private.');
      return;
    }
    const { playlistId, name } = playlist;
    Alert.alert(
      'Make this playlist private?',
      'Its link stops working, and people who follow it see it as unavailable.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make Private',
          onPress: () =>
            void sharing
              .setPublished(playlistId, false)
              .then(() => showPlaylistToast(`${name} is private`))
              .catch((error) => explainFailure(error, `Couldn’t make ${name} private. Try again.`)),
        },
      ]
    );
  };

  return { share, makePrivate };
}

function explainFailure(error: unknown, fallback: string) {
  if (error instanceof SharingError && error.failure === 'taken_down') {
    Alert.alert(
      'This playlist can’t be shared.',
      'It was removed from public view after a report. It’s still yours to play and edit.'
    );
    return;
  }
  showPlaylistToast(fallback);
}
