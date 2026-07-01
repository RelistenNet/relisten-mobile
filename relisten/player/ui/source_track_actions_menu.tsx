import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { OverflowMenuTrigger } from '@/relisten/components/menus/overflow_menu_trigger';
import { DownloadManager } from '@/relisten/offline/download_manager';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { useCallback, useMemo } from 'react';
import { Platform, Share } from 'react-native';

export type PlayShow = (sourceTrack?: SourceTrack) => void;

const ACTION_IDS = {
  addToQueue: 'add-to-queue',
  download: 'download',
  playNext: 'play-next',
  playNow: 'play-now',
  removeDownload: 'remove-download',
  share: 'share',
} as const;

type SourceTrackActionId = (typeof ACTION_IDS)[keyof typeof ACTION_IDS];

function downloadActionFor(sourceTrack: SourceTrack): MenuAction {
  const offlineInfo = sourceTrack.offlineInfo;

  if (!offlineInfo || offlineInfo.type === SourceTrackOfflineInfoType.StreamingCache) {
    return {
      id: ACTION_IDS.download,
      image: nativeMenuIcons.download,
      title: 'Download',
    };
  }

  switch (offlineInfo.status) {
    case SourceTrackOfflineInfoStatus.Failed:
      return {
        id: ACTION_IDS.download,
        image: nativeMenuIcons.retry,
        title: 'Retry Download',
      };
    case SourceTrackOfflineInfoStatus.Queued:
    case SourceTrackOfflineInfoStatus.Downloading:
      return {
        id: ACTION_IDS.removeDownload,
        image: nativeMenuIcons.cancel,
        title: 'Cancel Download',
        attributes: { destructive: true },
      };
    case SourceTrackOfflineInfoStatus.UNKNOWN:
    case SourceTrackOfflineInfoStatus.Succeeded:
      return {
        id: ACTION_IDS.removeDownload,
        image: nativeMenuIcons.delete,
        title: 'Remove Download',
        attributes: { destructive: true },
      };
  }
}

type SourceTrackActionsMenuProps = {
  playShow: PlayShow;
  sourceTrack: SourceTrack;
};

export function SourceTrackActionsMenu({ playShow, sourceTrack }: SourceTrackActionsMenuProps) {
  const player = useRelistenPlayer();
  const queueTrack = useMemo(() => PlayerQueueTrack.fromSourceTrack(sourceTrack), [sourceTrack]);
  const offlineStatus = sourceTrack.offlineInfo?.status;
  const offlineType = sourceTrack.offlineInfo?.type;
  const actions = useMemo<MenuAction[]>(
    () => [
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
      downloadActionFor(sourceTrack),
      {
        id: ACTION_IDS.share,
        image: nativeMenuIcons.share,
        title: 'Share Track',
      },
    ],
    [offlineStatus, offlineType, sourceTrack]
  );

  const handleAction = useCallback(
    async (actionId: SourceTrackActionId) => {
      switch (actionId) {
        case ACTION_IDS.playNow:
          playShow(sourceTrack);
          break;
        case ACTION_IDS.playNext:
          player.queue.queueNextTrack([queueTrack]);
          break;
        case ACTION_IDS.addToQueue:
          player.queue.addTrackToEndOfQueue([queueTrack]);
          break;
        case ACTION_IDS.download:
          await DownloadManager.SHARED_INSTANCE.downloadTrack(sourceTrack);
          break;
        case ACTION_IDS.removeDownload:
          await DownloadManager.SHARED_INSTANCE.removeDownload(sourceTrack);
          break;
        case ACTION_IDS.share: {
          const [year, month, day] = sourceTrack.show.displayDate.split('-');
          const url = `https://relisten.net/${sourceTrack.artist.slug}/${year}/${month}/${day}/${sourceTrack.slug}?source=${sourceTrack.source.uuid}`;

          await Share.share({
            message: `Check out ${sourceTrack.title} (${sourceTrack.humanizedDuration}) from ${sourceTrack.show.displayDate} by ${sourceTrack.artist?.name} on @relistenapp${Platform.OS === 'ios' ? '' : `: ${url}`}`,
            url,
          });
          break;
        }
      }
    },
    [playShow, player, queueTrack, sourceTrack]
  );

  return (
    <NativeMenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        void handleAction(nativeEvent.event as SourceTrackActionId);
      }}
    >
      <OverflowMenuTrigger accessibilityLabel={`Actions for ${sourceTrack.title}`} tone="muted" />
    </NativeMenuView>
  );
}
