import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import AnimatedProgressWheel from 'react-native-progress-wheel';

const SIZE = 18;

export function SourceTrackSucceededIndicator({ size = 12 }: { size?: number }) {
  return <MaterialCommunityIcons name="cloud-check" size={size} color={colors.blue['200']} />;
}

export function SourceTrackOfflineIndicator({
  offlineInfo,
}: {
  offlineInfo: SourceTrackOfflineInfo | undefined;
}) {
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
      // TODO: make indeterminate
      contents = (
        <AnimatedProgressWheel
          progress={0}
          rotation={'-90deg'}
          size={SIZE - 2}
          backgroundColor={'transparent'}
          color={color}
          width={SIZE / 3}
        />
      );
      break;
    case SourceTrackOfflineInfoStatus.Downloading:
      contents = (
        <AnimatedProgressWheel
          progress={offlineInfo.percent}
          rotation={'-90deg'}
          size={SIZE - 2}
          backgroundColor={'transparent'}
          color={color}
          width={SIZE / 3}
        />
      );
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
