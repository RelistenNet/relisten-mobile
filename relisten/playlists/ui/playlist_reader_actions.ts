import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useAccountScope } from '@/relisten/accounts/account_context';
import { openSignInSheet } from '@/relisten/accounts/ui/account_routes';
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
 * What a listener can do with someone else's public playlist: follow or
 * unfollow it, copy it into their own playlists, or report it. Each needs the
 * internet and a signed-in account. Signed out, an action opens the sign-in
 * sheet and runs once the listener signs in; closing the sheet drops it.
 */
export function usePlaylistReaderActions() {
  const router = useRouter();
  const groupSegment = useGroupSegment();
  const account = useAccountScope();
  const online = useShouldMakeNetworkRequests();
  const sharing = usePlaylistSharingService();
  const signedIn = account.isAuthenticated && !!account.userId;
  // The action waiting on the sign-in sheet. In memory only: it belongs to
  // this screen, and a relaunch shouldn't follow something by surprise.
  const waitingForSignIn = useRef<(() => unknown) | undefined>(undefined);

  // The sheet has closed when this screen is focused again. The action runs
  // only then: following can redirect this screen, and navigating under an
  // open sheet races the sheet's own dismissal. Still signed out means the
  // listener closed the sheet, so the action is dropped.
  useFocusEffect(
    useCallback(() => {
      const run = waitingForSignIn.current;
      waitingForSignIn.current = undefined;
      if (run && signedIn) {
        void run();
      }
    }, [signedIn])
  );

  /**
   * Runs `run` now and returns what it returns, or runs it after signing in.
   * `action` finishes "Sign in to …" and "Connect to the internet to …".
   */
  const whenReady = async (action: string, run: () => unknown) => {
    if (!signedIn) {
      waitingForSignIn.current = run;
      openSignInSheet(router, action);
      return;
    }
    if (!online) {
      Alert.alert(`Connect to the internet to ${action}.`);
      return;
    }
    await run();
  };

  const follow = (snapshot: PublicPlaylistSnapshot) =>
    whenReady('follow this playlist', async () => {
      try {
        await sharing.follow(snapshot);
        showPlaylistToast(`Following ${snapshot.metadata.name}`);
      } catch (error) {
        explain(error, `Couldn’t follow ${snapshot.metadata.name}. Try again.`);
      }
    });

  /**
   * Like un-favoriting, this doesn't ask first. A playlist that is still
   * public reopens as its public page, so the listener stays where they were
   * and can follow it again with one tap; otherwise this goes back.
   */
  const unfollow = (playlistId: string, name: string, publicCode?: string) =>
    whenReady('unfollow this playlist', async () => {
      try {
        await sharing.unfollow(playlistId);
        if (publicCode) {
          router.replace({
            pathname: `/relisten/tabs/${groupSegment}/playlists/shared/[publicCode]`,
            params: { publicCode },
          });
        } else {
          router.back();
        }
        showPlaylistToast(`Unfollowed ${name}`);
      } catch (error) {
        explain(error, `Couldn’t unfollow ${name}. Try again.`);
      }
    });

  const copy = (publicCode: string, name: string) =>
    whenReady('copy this playlist', async () => {
      try {
        const playlistId = await sharing.copy(publicCode, name);
        openPlaylist(router, playlistId, groupSegment);
        showPlaylistToast(`Copied ${name} to your playlists`);
      } catch (error) {
        explain(error, `Couldn’t copy ${name}. Try again.`);
      }
    });

  const report = (publicCode: string, name: string) =>
    whenReady('report this playlist', () =>
      router.push({ pathname: '/relisten/report-playlist', params: { publicCode, name } })
    );

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
