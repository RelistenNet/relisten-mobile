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
import { useFavorite } from '@/relisten/library/favorite_hooks';
import { hasPlayableLocalFile } from '@/relisten/library/catalog_audio_availability';

export type PlayShow = (sourceTrack?: SourceTrack) => void;

const ACTION_IDS = {
  addToQueue: 'add-to-queue',
  download: 'download',
  favorite: 'favorite',
  playNext: 'play-next',
  playNow: 'play-now',
  removeDownload: 'remove-download',
  share: 'share',
} as const;

type SourceTrackActionId = (typeof ACTION_IDS)[keyof typeof ACTION_IDS];

function downloadActionFor(sourceTrack: SourceTrack, networkPlaybackAllowed: boolean): MenuAction {
  const offlineInfo = sourceTrack.offlineInfo;
  const hasLocalFile = hasPlayableLocalFile(sourceTrack);

  if (!offlineInfo || offlineInfo.type === SourceTrackOfflineInfoType.StreamingCache) {
    const canKeepLocalCache = hasLocalFile && !!offlineInfo;
    const canDownload =
      sourceTrack.supportsOfflineDownload() && (networkPlaybackAllowed || canKeepLocalCache);
    return {
      id: ACTION_IDS.download,
      image: nativeMenuIcons.download,
      title: canDownload ? 'Download' : 'Download unavailable',
      attributes: canDownload ? undefined : { disabled: true },
    };
  }

  switch (offlineInfo.status) {
    case SourceTrackOfflineInfoStatus.Failed:
      return {
        id: ACTION_IDS.download,
        image: nativeMenuIcons.retry,
        title: networkPlaybackAllowed ? 'Retry Download' : 'Download unavailable',
        attributes: networkPlaybackAllowed ? undefined : { disabled: true },
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
  networkPlaybackAllowed: boolean;
  playShow: PlayShow;
  sourceTrack: SourceTrack;
};

export function SourceTrackActionsMenu({
  networkPlaybackAllowed,
  playShow,
  sourceTrack,
}: SourceTrackActionsMenuProps) {
  const player = useRelistenPlayer();
  const favorite = useFavorite('source_track', sourceTrack.uuid);
  const queueTrack = useMemo(() => PlayerQueueTrack.fromSourceTrack(sourceTrack), [sourceTrack]);
  const offlineStatus = sourceTrack.offlineInfo?.status;
  const offlineType = sourceTrack.offlineInfo?.type;
  const canPlay = networkPlaybackAllowed || hasPlayableLocalFile(sourceTrack);
  const actions = useMemo<MenuAction[]>(
    () => [
      {
        id: ACTION_IDS.playNow,
        image: nativeMenuIcons.play,
        title: 'Play Now',
        attributes: canPlay ? undefined : { disabled: true },
      },
      {
        id: ACTION_IDS.playNext,
        image: nativeMenuIcons.playNext,
        title: 'Play Next',
        attributes: canPlay ? undefined : { disabled: true },
      },
      {
        id: ACTION_IDS.addToQueue,
        image: nativeMenuIcons.addToQueue,
        title: 'Add to End of Queue',
        attributes: canPlay ? undefined : { disabled: true },
      },
      {
        id: ACTION_IDS.favorite,
        image: nativeMenuIcons.favorite,
        title: favorite.isFavorite ? 'Remove from My Library' : 'Add to My Library',
        state: favorite.isFavorite ? 'on' : 'off',
      },
      downloadActionFor(sourceTrack, networkPlaybackAllowed),
      {
        id: ACTION_IDS.share,
        image: nativeMenuIcons.share,
        title: 'Share Track',
      },
    ],
    [canPlay, favorite.isFavorite, networkPlaybackAllowed, offlineStatus, offlineType, sourceTrack]
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
        case ACTION_IDS.favorite:
          favorite.toggleFavorite();
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
    [favorite, playShow, player, queueTrack, sourceTrack]
  );

  return (
    <NativeMenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        void handleAction(nativeEvent.event as SourceTrackActionId);
      }}
    >
      <OverflowMenuTrigger accessibilityLabel={`Actions for ${sourceTrack.title}`} />
    </NativeMenuView>
  );
}
