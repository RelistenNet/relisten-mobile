import { SourceTrack } from '@/relisten/realm/models/source_track';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import colors from 'tailwindcss/colors';
import {
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';
import * as Progress from 'react-native-progress';
import { memo } from 'react';

function sourceTrackOfflineIndicator({ sourceTrack }: { sourceTrack: SourceTrack }) {
  const offlineInfo = sourceTrack.offlineInfo;

  if (!offlineInfo) {
    return <></>;
  }

  let contents = <></>;

  const size = 18;
  const color = colors.gray['400'] as string;

  switch (offlineInfo.status) {
    case SourceTrackOfflineInfoStatus.UNKNOWN:
      contents = <MaterialCommunityIcons name="cloud-alert" size={size} color={color} />;
      break;
    case SourceTrackOfflineInfoStatus.Queued:
      contents = <Progress.Circle size={size - 2} indeterminate={true} color={color} />;
      break;
    case SourceTrackOfflineInfoStatus.Downloading:
      contents = <Progress.Circle size={size - 2} progress={offlineInfo.percent} color={color} />;
      break;
    case SourceTrackOfflineInfoStatus.Failed:
      contents = <MaterialCommunityIcons name="cloud-alert" size={size} color={color} />;
      break;
    case SourceTrackOfflineInfoStatus.Succeeded:
      switch (offlineInfo.type) {
        case SourceTrackOfflineInfoType.UNKNOWN:
          contents = <MaterialCommunityIcons name="cloud-off-outline" size={size} color={color} />;
          break;
        case SourceTrackOfflineInfoType.UserInitiated:
          contents = <MaterialCommunityIcons name="cloud-check" size={size} color={color} />;
          break;
        case SourceTrackOfflineInfoType.StreamingCache:
          contents = <MaterialCommunityIcons name="cloud-outline" size={size} color={color} />;
          break;
      }
      break;
  }

  return <View className="pl-2">{contents}</View>;
}

export const SourceTrackOfflineIndicator = memo(sourceTrackOfflineIndicator);
