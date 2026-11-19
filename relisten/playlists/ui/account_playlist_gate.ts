import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useAccountScope } from '@/relisten/accounts/account_context';
import { openSignInSheet } from '@/relisten/accounts/ui/account_routes';
import type { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

/**
 * Checks that an action on one of the listener's own playlists can reach the
 * account now: online, signed in, and signed in to the account the playlist is
 * saved to. Explains the first thing missing and returns false. These actions
 * (share, make private, delete, restore) are never queued, so nothing resumes
 * after signing in; the listener tries again.
 *
 * `action` finishes "… to <action> this playlist", such as "share".
 */
export function useAccountPlaylistGate() {
  const router = useRouter();
  const account = useAccountScope();
  const online = useShouldMakeNetworkRequests();

  return (playlist: Playlist, action: string) => {
    if (!online) {
      Alert.alert(`Connect to the internet to ${action} this playlist.`);
      return false;
    }
    if (!account.isAuthenticated) {
      Alert.alert(
        `Sign in to ${action} this playlist.`,
        playlist.libraryUserId
          ? 'It’s saved to your account.'
          : 'This needs a Relisten account. Signing in saves your playlists to it.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Sign In', onPress: () => openSignInSheet(router) },
        ]
      );
      return false;
    }
    if (account.userId !== playlist.libraryUserId) {
      Alert.alert(
        'This playlist is saved to another account.',
        `Switch to that account to ${action} it.`
      );
      return false;
    }
    return true;
  };
}
