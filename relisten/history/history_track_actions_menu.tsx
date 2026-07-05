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
import { type ReactNode, useCallback } from 'react';

const ACTION_IDS = {
  addToQueue: 'add-to-queue',
  playNext: 'play-next',
  viewShow: 'view-show',
} as const;

type HistoryTrackActionId = (typeof ACTION_IDS)[keyof typeof ACTION_IDS];

const ACTIONS: MenuAction[] = [
  {
    id: ACTION_IDS.playNext,
    image: nativeMenuIcons.playNext,
    title: 'Play Next',
  },
  {
    id: ACTION_IDS.addToQueue,
    image: nativeMenuIcons.addToQueue,
    title: 'Add to End of Queue',
  },
  {
    id: ACTION_IDS.viewShow,
    image: nativeMenuIcons.show,
    title: 'View Show',
  },
];

type HistoryTrackActionsMenuProps = {
  children: ReactNode;
  onViewShow: () => void;
  sourceTrack: SourceTrack;
};

export function HistoryTrackActionsMenu({
  children,
  onViewShow,
  sourceTrack,
}: HistoryTrackActionsMenuProps) {
  const player = useRelistenPlayer();

  const addToQueue = useCallback(
    (placement: 'next' | 'end') => {
      const queueTrack = PlayerQueueTrack.fromSourceTrack(sourceTrack);
      if (placement === 'next') {
        player.queue.queueNextTrack([queueTrack]);
      } else {
        player.queue.addTrackToEndOfQueue([queueTrack]);
      }

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showHistoryQueueConfirmation({
        message:
          placement === 'next' ? `Playing ${sourceTrack.title} next` : `Added ${sourceTrack.title}`,
        onUndo: (): HistoryQueueUndoResult => {
          if (player.queue.currentTrack?.identifier === queueTrack.identifier) {
            return 'already-playing';
          }
          return player.queue.removeTrackWithIdentifier(queueTrack.identifier)
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
        case ACTION_IDS.viewShow:
          onViewShow();
          break;
      }
    },
    [addToQueue, onViewShow]
  );

  return (
    <NativeMenuView
      actions={ACTIONS}
      onPressAction={({ nativeEvent }) => handleAction(nativeEvent.event as HistoryTrackActionId)}
      shouldOpenOnLongPress={false}
    >
      {children}
    </NativeMenuView>
  );
}
