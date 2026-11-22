import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import {
  showHistoryQueueConfirmation,
  type HistoryQueueUndoResult,
} from '@/relisten/history/history_queue_feedback';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { trackIdForSourceTrack } from '@/relisten/playlists/playlist_hooks';
import { openAddToPlaylist } from '@/relisten/playlists/ui/playlist_navigation';
import { useGoToSong } from '@/relisten/player/ui/go_to_song';
import { type ReactNode, useCallback, useMemo } from 'react';
import { type AccessibilityRole } from 'react-native';

const ACTION_IDS = {
  addToPlaylist: 'add-to-playlist',
  addToQueue: 'add-to-queue',
  playNext: 'play-next',
  select: 'select',
  viewShow: 'view-show',
} as const;

type HistoryTrackActionId = (typeof ACTION_IDS)[keyof typeof ACTION_IDS];

function historyActions(canSelect: boolean, songActions: MenuAction[]): MenuAction[] {
  return [
    {
      id: 'playback',
      title: '',
      displayInline: true,
      subactions: [
        { id: ACTION_IDS.playNext, image: nativeMenuIcons.playNext, title: 'Play Next' },
        {
          id: ACTION_IDS.addToQueue,
          image: nativeMenuIcons.addToQueue,
          title: 'Add to End of Queue',
        },
      ],
    },
    {
      id: 'playlists',
      title: '',
      displayInline: true,
      subactions: [
        {
          id: ACTION_IDS.addToPlaylist,
          image: nativeMenuIcons.addToPlaylist,
          title: 'Add to Playlist…',
        },
        ...(canSelect
          ? [{ id: ACTION_IDS.select, image: nativeMenuIcons.select, title: 'Select Tracks' }]
          : []),
      ],
    },
    {
      id: 'show',
      title: '',
      displayInline: true,
      subactions: [
        { id: ACTION_IDS.viewShow, image: nativeMenuIcons.show, title: 'View Show' },
        ...songActions,
      ],
    },
  ];
}

type HistoryTrackActionsMenuProps = {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  children: ReactNode;
  onViewShow: () => void;
  /** Starts selecting with this entry checked; offered only where selection exists. */
  onSelect?: () => void;
  sourceTrack: SourceTrack;
};

export function HistoryTrackActionsMenu({
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole,
  children,
  onViewShow,
  onSelect,
  sourceTrack,
}: HistoryTrackActionsMenuProps) {
  const player = useRelistenPlayer();
  const router = useRouter();
  const goToSong = useGoToSong(sourceTrack);
  const actions = useMemo(
    () => historyActions(onSelect !== undefined, goToSong.actions),
    [goToSong.actions, onSelect]
  );

  const addToQueue = useCallback(
    (placement: 'next' | 'end') => {
      const queueTrack = PlayerQueueTrack.fromSourceTrack(sourceTrack);
      const [queuedTrack] =
        placement === 'next'
          ? player.queue.queueNextTrack([queueTrack])
          : player.queue.addTrackToEndOfQueue([queueTrack]);

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showHistoryQueueConfirmation({
        message:
          placement === 'next' ? `Playing ${sourceTrack.title} next` : `Added ${sourceTrack.title}`,
        onUndo: (): HistoryQueueUndoResult => {
          if (player.queue.currentTrack?.identifier === queuedTrack.identifier) {
            return 'already-playing';
          }
          return player.queue.removeTrackWithIdentifier(queuedTrack.identifier)
            ? 'removed'
            : 'missing';
        },
      });
    },
    [player, sourceTrack]
  );

  const handleAction = useCallback(
    (actionId: HistoryTrackActionId) => {
      switch (actionId) {
        case ACTION_IDS.playNext:
          addToQueue('next');
          break;
        case ACTION_IDS.addToQueue:
          addToQueue('end');
          break;
        case ACTION_IDS.addToPlaylist:
          openAddToPlaylist(router, [trackIdForSourceTrack(sourceTrack)], { linkable: false });
          break;
        case ACTION_IDS.select:
          onSelect?.();
          break;
        case ACTION_IDS.viewShow:
          onViewShow();
          break;
      }
    },
    [addToQueue, onSelect, onViewShow, router, sourceTrack]
  );

  return (
    <NativeMenuView
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        if (!goToSong.handleAction(nativeEvent.event)) {
          handleAction(nativeEvent.event as HistoryTrackActionId);
        }
      }}
      shouldOpenOnLongPress={false}
    >
      {children}
    </NativeMenuView>
  );
}
