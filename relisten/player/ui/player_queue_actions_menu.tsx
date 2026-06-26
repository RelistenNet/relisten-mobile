import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { OverflowMenuTrigger } from '@/relisten/components/menus/overflow_menu_trigger';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { useCallback } from 'react';

const ACTION_IDS = {
  addToQueue: 'add-to-queue',
  playNext: 'play-next',
  playNow: 'play-now',
  remove: 'remove',
} as const;

type PlayerQueueActionId = (typeof ACTION_IDS)[keyof typeof ACTION_IDS];

const ACTIONS: MenuAction[] = [
  {
    id: ACTION_IDS.playNow,
    image: nativeMenuIcons.play,
    title: 'Play Now',
  },
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
    id: ACTION_IDS.remove,
    image: nativeMenuIcons.removeFromQueue,
    title: 'Remove from Queue',
    attributes: { destructive: true },
  },
];

type PlayerQueueActionsMenuProps = {
  index: number;
  queueTrack: PlayerQueueTrack;
};

export function PlayerQueueActionsMenu({ index, queueTrack }: PlayerQueueActionsMenuProps) {
  const player = useRelistenPlayer();

  const handleAction = useCallback(
    (actionId: PlayerQueueActionId) => {
      switch (actionId) {
        case ACTION_IDS.playNow:
          player.playTrackAtIndex(index);
          break;
        case ACTION_IDS.playNext:
          player.queue.queueNextTrack([queueTrack]);
          break;
        case ACTION_IDS.addToQueue:
          player.queue.addTrackToEndOfQueue([queueTrack]);
          break;
        case ACTION_IDS.remove:
          player.queue.removeTrackAtIndex(index);
          break;
      }
    },
    [index, player, queueTrack]
  );

  return (
    <MenuView
      actions={ACTIONS}
      onPressAction={({ nativeEvent }) => handleAction(nativeEvent.event as PlayerQueueActionId)}
    >
      <OverflowMenuTrigger
        accessibilityLabel={`Actions for ${queueTrack.sourceTrack.title}`}
        iconAlignment="trailing"
      />
    </MenuView>
  );
}
