import { Alert, Platform, Share } from 'react-native';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { useRealm } from '@/relisten/realm/schema';
import { publicPlaylistUrl } from '@/relisten/playlists/sharing/sharing_wire';
import { useAccountPlaylistGate } from '@/relisten/playlists/ui/account_playlist_gate';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import {
  explainSharingFailure,
  TAKEN_DOWN_PLAYLIST,
} from '@/relisten/playlists/ui/sharing_messages';
import { usePlaylistSharingService } from '@/relisten/realm/root_services';

/** Opens the system share sheet for a public playlist's link. */
export function sharePlaylistLink(name: string, publicCode: string) {
  const url = publicPlaylistUrl(publicCode);
  // iOS shares the URL itself, so apps can preview it; Android shares text.
  void Share.share(Platform.OS === 'ios' ? { url, title: name } : { message: url, title: name });
}

/**
 * Share… and Make Private for a playlist the listener made. Both need the
 * playlist saved to the signed-in account and the internet, and are never
 * queued; the first share asks to make it public.
 *
 * They take the playlist's ID and read the row when pressed, so a screen's
 * menu doesn't change (and re-send itself to native) on every write to it.
 */
export function usePlaylistShareActions() {
  const realm = useRealm();
  const sharing = usePlaylistSharingService();
  const canReachAccount = useAccountPlaylistGate();

  /** Explains why the playlist can't be shared right now, or returns true. */
  const canShare = (playlist: Playlist) => {
    if (!canReachAccount(playlist, 'share')) {
      return false;
    }
    if (playlist.takenDown) {
      Alert.alert(...TAKEN_DOWN_PLAYLIST);
      return false;
    }
    if (playlist.serverState !== 'synced') {
      Alert.alert(
        'This playlist isn’t saved to your account yet.',
        'You can share it once it’s saved.'
      );
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
      explainSharingFailure(error, `Couldn’t share ${name}. Try again.`, OWNER_FAILURES);
    }
  };

  const share = (playlistId: string) => {
    const playlist = realm.objectForPrimaryKey(Playlist, playlistId);
    if (!playlist || !canShare(playlist)) {
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

  const makePrivate = (playlistId: string) => {
    const playlist = realm.objectForPrimaryKey(Playlist, playlistId);
    if (!playlist || !canReachAccount(playlist, 'make private')) {
      return;
    }
    const { name } = playlist;
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
              .catch((error) =>
                explainSharingFailure(
                  error,
                  `Couldn’t make ${name} private. Try again.`,
                  OWNER_FAILURES
                )
              ),
        },
      ]
    );
  };

  return { share, makePrivate };
}

/** The owner's own playlist, taken down, is still theirs: say so. */
const OWNER_FAILURES = { taken_down: TAKEN_DOWN_PLAYLIST };
