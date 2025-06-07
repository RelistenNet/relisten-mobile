import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useWindowDimensions, View, ViewProps } from 'react-native';
import colors from 'tailwindcss/colors';

import * as Progress from 'react-native-progress';

const SIZE = 18;

export function SourceTrackSucceededIndicator({
  size = 12,
  ...props
}: { size?: number } & ViewProps) {
  return <MaterialIcons name="check-circle" size={size} color={colors.blue['200']} {...props} />;
}

export function SourceTrackOfflineIndicator({
  offlineInfo,
}: {
  offlineInfo: SourceTrackOfflineInfo | undefined;
}) {
  const { fontScale } = useWindowDimensions();

  if (!offlineInfo) {
    return <></>;
  }

  let contents = <></>;

  const color = colors.gray['400'] as string;

  switch (offlineInfo.status) {
    case SourceTrackOfflineInfoStatus.UNKNOWN:
      contents = (
        <MaterialCommunityIcons name="download-off" size={SIZE * fontScale} color={color} />
      );
      break;
    case SourceTrackOfflineInfoStatus.Queued:
      contents = (
        <MaterialCommunityIcons name="progress-download" size={SIZE * fontScale} color={color} />
      );
      break;
    case SourceTrackOfflineInfoStatus.Downloading:
      contents = (
        <Progress.Pie size={SIZE * fontScale} color={color} progress={offlineInfo.percent} />
      );
      break;
    case SourceTrackOfflineInfoStatus.Failed:
      contents = (
        <MaterialCommunityIcons name="download-off" size={SIZE * fontScale} color={color} />
      );
      break;
    case SourceTrackOfflineInfoStatus.Succeeded:
      contents = <SourceTrackSucceededIndicator size={SIZE * fontScale} />;
      break;
  }

  return <View className="pl-2">{contents}</View>;
}
