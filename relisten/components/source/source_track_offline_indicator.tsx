import { SourceTrack } from '@/relisten/realm/models/source_track';
import { SourceTrackOfflineInfoStatus } from '@/relisten/realm/models/source_track_offline_info';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import * as Progress from 'react-native-progress';
import colors from 'tailwindcss/colors';

const SIZE = 18;

export function SourceTrackSucceededIndicator({ size = 12 }: { size?: number }) {
  return <MaterialCommunityIcons name="cloud-check" size={size} color={colors.blue['200']} />;
}

export function SourceTrackOfflineIndicator({ sourceTrack }: { sourceTrack: SourceTrack }) {
  const offlineInfo = sourceTrack.offlineInfo;

  if (!offlineInfo) {
    return <></>;
  }

  let contents = <></>;

  const color = colors.gray['400'] as string;

  switch (offlineInfo.status) {
    case SourceTrackOfflineInfoStatus.UNKNOWN:
      contents = <MaterialCommunityIcons name="cloud-alert" size={SIZE} color={color} />;
      break;
    case SourceTrackOfflineInfoStatus.Queued:
      contents = <Progress.Circle size={SIZE - 2} indeterminate={true} color={color} />;
      break;
    case SourceTrackOfflineInfoStatus.Downloading:
      contents = <Progress.Circle size={SIZE - 2} progress={offlineInfo.percent} color={color} />;
      break;
    case SourceTrackOfflineInfoStatus.Failed:
      contents = <MaterialCommunityIcons name="cloud-alert" size={SIZE} color={color} />;
      break;
    case SourceTrackOfflineInfoStatus.Succeeded:
      contents = <SourceTrackSucceededIndicator size={SIZE} />;
      break;
  }

  return <View className="pl-2">{contents}</View>;
}
