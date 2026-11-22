import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { audioAdjustmentNative } from '@/relisten/player/audio_adjustments/audio_adjustment_native';
import {
  type CurrentTrackNavigationActionId,
  useCurrentTrackNavigation,
} from '@/relisten/player/ui/current_track_navigation_menu';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { trackIdForSourceTrack } from '@/relisten/playlists/playlist_hooks';
import { openAddToPlaylist } from '@/relisten/playlists/ui/playlist_navigation';
import { router } from 'expo-router';
import { useCallback, useMemo, type ReactNode } from 'react';

const AUDIO_ADJUSTMENTS_ACTION_ID = 'audio-adjustments';
const PLAYLIST_ACTION_IDS = {
  addTrack: 'add-track-to-playlist',
  addQueue: 'add-queue-to-playlist',
} as const;
const SUPPORTS_AUDIO_ADJUSTMENTS = audioAdjustmentNative.capabilities().supported;

type PlayerActionId =
  | CurrentTrackNavigationActionId
  | typeof AUDIO_ADJUSTMENTS_ACTION_ID
  | (typeof PLAYLIST_ACTION_IDS)[keyof typeof PLAYLIST_ACTION_IDS];

function usePlayerActions(onBeforeNavigate?: (navigate: () => void) => void) {
  const { actions: navigationActions, handleAction: handleNavigationAction } =
    useCurrentTrackNavigation(onBeforeNavigate);
  const player = useRelistenPlayer();
  const hasCurrentTrack = !!useRelistenPlayerCurrentTrack();
  const actions = useMemo<MenuAction[]>(
    () => [
      ...(hasCurrentTrack
        ? [
            {
              id: 'playlists',
              title: 'Playlists',
              displayInline: true,
              subactions: [
                {
                  id: PLAYLIST_ACTION_IDS.addTrack,
                  image: nativeMenuIcons.addToPlaylist,
                  title: 'Add Track to Playlist…',
                },
                {
                  id: PLAYLIST_ACTION_IDS.addQueue,
                  image: nativeMenuIcons.addToPlaylist,
                  title: 'Add Queue to Playlist…',
                },
              ],
            },
          ]
        : []),
      ...(navigationActions.length
        ? [
            {
              id: 'performance',
              title: 'Go To',
              displayInline: true,
              subactions: navigationActions,
            },
          ]
        : []),
      ...(SUPPORTS_AUDIO_ADJUSTMENTS
        ? [
            {
              id: 'listening',
              title: 'Listening',
              displayInline: true,
              subactions: [
                {
                  id: AUDIO_ADJUSTMENTS_ACTION_ID,
                  image: nativeMenuIcons.audioAdjustments,
                  title: 'Audio Equalizer',
                },
              ],
            },
          ]
        : []),
    ],
    [hasCurrentTrack, navigationActions]
  );

  const handleAction = useCallback(
    (actionId: PlayerActionId) => {
      if (actionId === AUDIO_ADJUSTMENTS_ACTION_ID) {
        router.push('/relisten/audio-adjustments');
        return;
      }
      // Both open the sheet over the player, like the equalizer.
      if (actionId === PLAYLIST_ACTION_IDS.addTrack) {
        const current = player.queue.currentTrack;
        if (current) {
          openAddToPlaylist(router, [trackIdForSourceTrack(current.sourceTrack)], {
            linkable: false,
          });
        }
        return;
      }
      if (actionId === PLAYLIST_ACTION_IDS.addQueue) {
        const trackIds = player.queue.orderedTracks.map((track) =>
          trackIdForSourceTrack(track.sourceTrack)
        );
        openAddToPlaylist(router, trackIds, { linkable: false });
        return;
      }

      handleNavigationAction(actionId);
    },
    [handleNavigationAction, player]
  );

  return { actions, handleAction };
}

type PlayerActionsMenuProps = {
  children: ReactNode;
  onBeforeNavigate?: (navigate: () => void) => void;
};

export function PlayerActionsMenu({ children, onBeforeNavigate }: PlayerActionsMenuProps) {
  const { actions, handleAction } = usePlayerActions(onBeforeNavigate);

  if (actions.length === 0) {
    return children;
  }

  return (
    <NativeMenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => handleAction(nativeEvent.event as PlayerActionId)}
    >
      {children}
    </NativeMenuView>
  );
}
