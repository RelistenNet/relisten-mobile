import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useAccountScope } from '@/relisten/accounts/account_context';
import { accountPath } from '@/relisten/accounts/ui/account_routes';
import {
  SharingError,
  type SharingFailure,
} from '@/relisten/playlists/sharing/playlist_sharing_service';
import type { PublicPlaylistSnapshot } from '@/relisten/playlists/sharing/sharing_wire';
import { openPlaylist } from '@/relisten/playlists/ui/playlist_navigation';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import { usePlaylistSharingService } from '@/relisten/realm/root_services';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { useGroupSegment } from '@/relisten/util/routes';

/**
 * What a listener can do with someone else's public playlist: follow it,
 * copy it into their own playlists, or report it. Each needs the internet and
 * a signed-in account, and explains itself when one is missing.
 */
export function usePlaylistReaderActions() {
  const router = useRouter();
  const groupSegment = useGroupSegment();
  const account = useAccountScope();
  const online = useShouldMakeNetworkRequests();
  const sharing = usePlaylistSharingService();
  const signedIn = account.isAuthenticated && !!account.userId;

  const ready = (action: string) => {
    if (!signedIn) {
      Alert.alert(`Sign in to ${action}.`, 'Following and copying playlists need an account.', [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.push(accountPath('(myLibrary)')) },
      ]);
      return false;
    }
    if (!online) {
      Alert.alert(`Connect to the internet to ${action}.`);
      return false;
    }
    return true;
  };

  const follow = async (snapshot: PublicPlaylistSnapshot) => {
    if (!ready('follow this playlist')) {
      return;
    }
    try {
      await sharing.follow(snapshot);
      showPlaylistToast(`Following ${snapshot.metadata.name}`);
    } catch (error) {
      explain(error, `Couldn’t follow ${snapshot.metadata.name}. Try again.`);
    }
  };

  const unfollow = async (playlistId: string, name: string) => {
    if (!ready('unfollow this playlist')) {
      return;
    }
    try {
      await sharing.unfollow(playlistId);
      router.back();
      showPlaylistToast(`Unfollowed ${name}`);
    } catch (error) {
      explain(error, `Couldn’t unfollow ${name}. Try again.`);
    }
  };

  const copy = async (publicCode: string, name: string) => {
    if (!ready('copy this playlist')) {
      return;
    }
    try {
      const playlistId = await sharing.copy(publicCode, name);
      openPlaylist(router, playlistId, groupSegment);
      showPlaylistToast(`Copied ${name} to your playlists`);
    } catch (error) {
      explain(error, `Couldn’t copy ${name}. Try again.`);
    }
  };

  const report = (publicCode: string, name: string) => {
    if (!ready('report this playlist')) {
      return;
    }
    router.push({ pathname: '/relisten/report-playlist', params: { publicCode, name } });
  };

  return { signedIn, follow, unfollow, copy, report };
}

const FAILURE_MESSAGES: Partial<Record<SharingFailure, [string, string?]>> = {
  unavailable: ['This playlist isn’t available.', 'Its owner may have made it private.'],
  full: [
    'Your account is full.',
    'An account can follow up to 500 playlists and hold up to 250. Remove some, then try again.',
  ],
  taken_down: ['This playlist isn’t available.', 'It was removed after a report.'],
};

function explain(error: unknown, fallback: string) {
  const message = error instanceof SharingError ? FAILURE_MESSAGES[error.failure] : undefined;
  if (message) {
    Alert.alert(...message);
  } else {
    showPlaylistToast(fallback);
  }
}
