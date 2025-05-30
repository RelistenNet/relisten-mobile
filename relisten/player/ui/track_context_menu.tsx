import { useActionSheet } from '@expo/react-native-action-sheet';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { DownloadManager } from '@/relisten/offline/download_manager';
import {
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';
import { useCallback } from 'react';
import { Platform, Share } from 'react-native';

export type PlayShow = (sourceTrack?: SourceTrack) => void;

const offlineStatusToAction = {
  [SourceTrackOfflineInfoStatus.Succeeded]: 'Remove Download',
  [SourceTrackOfflineInfoStatus.Failed]: 'Retry Download',
  [SourceTrackOfflineInfoStatus.Queued]: 'Cancel Download',
  [SourceTrackOfflineInfoStatus.Downloading]: 'Cancel Download',
  [SourceTrackOfflineInfoStatus.UNKNOWN]: 'UNKNOWN',
};

export function useSourceTrackContextMenu() {
  const { showActionSheetWithOptions } = useActionSheet();
  const player = useRelistenPlayer();

  const showContextMenu = useCallback(
    (queueTrack: PlayerQueueTrack, playShow: PlayShow) => {
      const sourceTrack = queueTrack.sourceTrack;

      const options = [
        'Play Now',
        'Play Next',
        'Add to end of queue',
        sourceTrack.offlineInfo &&
        sourceTrack.offlineInfo.type != SourceTrackOfflineInfoType.StreamingCache
          ? offlineStatusToAction[sourceTrack.offlineInfo.status]
          : 'Download',
        'Share Track',
        'Cancel',
      ];

      const cancelButtonIndex = options.length - 1;

      showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          destructiveButtonIndex: sourceTrack.offlineInfo ? 3 : undefined,
        },
        async (selectedIndex?: number) => {
          switch (selectedIndex) {
            case 0:
              // Play now
              playShow(sourceTrack);
              break;
            case 1:
              // Play next
              player.queue.queueNextTrack([queueTrack]);
              break;
            case 2:
              // Add to end of queue
              player.queue.addTrackToEndOfQueue([queueTrack]);
              break;
            case 3:
              // Download/cancel download
              if (
                !sourceTrack.offlineInfo ||
                sourceTrack.offlineInfo.status === SourceTrackOfflineInfoStatus.Failed ||
                sourceTrack.offlineInfo.type === SourceTrackOfflineInfoType.StreamingCache
              ) {
                await DownloadManager.SHARED_INSTANCE.downloadTrack(sourceTrack);
              } else {
                await DownloadManager.SHARED_INSTANCE.removeDownload(sourceTrack);
              }
              break;

            case 4: {
              const [year, month, day] = sourceTrack.show.displayDate.split('-');
              const url = `https://relisten.net/${sourceTrack.artist.slug}/${year}/${month}/${day}/${sourceTrack.slug}?source=${sourceTrack.source.uuid}`;
              Share.share({
                message: `Check out ${sourceTrack.title} (${sourceTrack.humanizedDuration}) from ${sourceTrack.show.displayDate} by ${sourceTrack.artist?.name} on @relistenapp${Platform.OS === 'ios' ? '' : `: ${url}`}`,
                url: url,
              }).then(() => {});

              break;
            }
            case cancelButtonIndex:
              // Canceled
              break;
          }
        }
      );
    },
    [player, showActionSheetWithOptions]
  );

  return { showContextMenu };
}
