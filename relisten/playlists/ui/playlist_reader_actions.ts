import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useAccountScope } from '@/relisten/accounts/account_context';
import { openSignInSheet } from '@/relisten/accounts/ui/account_routes';
import type { PublicPlaylistSnapshot } from '@/relisten/playlists/sharing/sharing_wire';
import { openPlaylist } from '@/relisten/playlists/ui/playlist_navigation';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import { explainSharingFailure } from '@/relisten/playlists/ui/sharing_messages';
import { usePlaylistSharingService } from '@/relisten/realm/root_services';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { useGroupSegment } from '@/relisten/util/routes';

/**
 * What a listener can do with someone else's public playlist: follow or
 * unfollow it, copy it into their own playlists, or report it. Each needs the
 * internet and a signed-in account. Signed out, an action opens the sign-in
 * sheet and runs once the listener signs in; closing the sheet drops it.
 *
 * One action runs at a time: `busy` is true while one is in flight, and a
 * second tap meanwhile is ignored, so a double tap can't follow twice.
 */
export function usePlaylistReaderActions() {
  const router = useRouter();
  const groupSegment = useGroupSegment();
  const account = useAccountScope();
  const online = useShouldMakeNetworkRequests();
  const sharing = usePlaylistSharingService();
  const signedIn = account.isAuthenticated && !!account.userId;
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  // The action waiting on the sign-in sheet. In memory only: it belongs to
  // this screen, and a relaunch shouldn't follow something by surprise.
  const waitingForSignIn = useRef<PendingAction | undefined>(undefined);

  const runOnce = useCallback((run: () => Promise<unknown>) => {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    void run().finally(() => {
      running.current = false;
      setBusy(false);
    });
  }, []);

  // The sheet has closed when this screen is focused again. The action runs
  // only then: following can redirect this screen, and navigating under an
  // open sheet races the sheet's own dismissal. Still signed out means the
  // listener closed the sheet, so the action is dropped.
  useFocusEffect(
    useCallback(() => {
      const pending = waitingForSignIn.current;
      waitingForSignIn.current = undefined;
      if (!pending || !signedIn) {
        return;
      }
      if (online) {
        runOnce(pending.run);
      } else {
        alertOffline(pending.action);
      }
    }, [signedIn, online, runOnce])
  );

  /**
   * Runs `run` now, or after signing in. `action` finishes "Sign in to …" and
   * "Connect to the internet to …". Offline comes first: signing in needs the
   * internet too.
   */
  const whenReady = (action: string, run: () => Promise<unknown>) => {
    if (!online) {
      alertOffline(action);
      return;
    }
    if (!signedIn) {
      waitingForSignIn.current = { action, run };
      openSignInSheet(router, action);
      return;
    }
    runOnce(run);
  };

  const follow = (snapshot: PublicPlaylistSnapshot) =>
    whenReady('follow this playlist', async () => {
      try {
        await sharing.follow(snapshot);
        showPlaylistToast(`Following ${snapshot.metadata.name}`);
      } catch (error) {
        explainSharingFailure(error, `Couldn’t follow ${snapshot.metadata.name}. Try again.`);
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
        explainSharingFailure(error, `Couldn’t unfollow ${name}. Try again.`);
      }
    });

  const copy = (publicCode: string, name: string) =>
    whenReady('copy this playlist', async () => {
      try {
        const playlistId = await sharing.copy(publicCode, name);
        openPlaylist(router, playlistId, groupSegment);
        showPlaylistToast(`Copied ${name} to your playlists`);
      } catch (error) {
        explainSharingFailure(error, `Couldn’t copy ${name}. Try again.`);
      }
    });

  const report = (publicCode: string, name: string) =>
    whenReady('report this playlist', async () => {
      router.push({ pathname: '/relisten/report-playlist', params: { publicCode, name } });
    });

  return { busy, follow, unfollow, copy, report };
}

interface PendingAction {
  action: string;
  run: () => Promise<unknown>;
}

function alertOffline(action: string) {
  Alert.alert(`Connect to the internet to ${action}.`);
}
