import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import { useWindowDimensions, View } from 'react-native';
import colors from 'tailwindcss/colors';

import * as Progress from 'react-native-progress';
import { useObject } from '@/relisten/realm/schema';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';

const SIZE = 18;

export function SourceTrackSucceededIndicator({
  size = 12,
  ...props
}: Omit<ComponentProps<typeof MaterialIcons>, 'name' | 'color'>) {
  return <MaterialIcons name="check-circle" size={size} color={colors.blue['200']} {...props} />;
}

/**
 * A running download's pie, re-rendered on its own as `percent` changes. Only
 * this component wakes on each progress tick, not the list that holds it.
 */
function ObservedDownloadPie({
  offlineInfo,
  size,
  color,
}: {
  offlineInfo: SourceTrackOfflineInfo;
  size: number;
  color: string;
}) {
  const live = useObject(SourceTrackOfflineInfo, offlineInfo.sourceTrackUuid, ['percent']);
  return <Progress.Pie size={size} color={color} progress={(live ?? offlineInfo).percent} />;
}

export function SourceTrackOfflineIndicator({
  offlineInfo,
  observeProgress = false,
}: {
  offlineInfo: SourceTrackOfflineInfo | undefined;
  /**
   * Watch download progress here, for a caller whose query leaves `percent`
   * out so its rows don't re-render on every tick (playlists). Other callers
   * watch the whole track, so they already re-render as progress changes and
   * a second listener would add nothing.
   */
  observeProgress?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const controlSize = SIZE * accessibleControlScale(fontScale);

  if (!offlineInfo) {
    return <></>;
  }

  let contents = <></>;

  const color = colors.gray['400'] as string;

  switch (offlineInfo.status) {
    case SourceTrackOfflineInfoStatus.UNKNOWN:
      contents = <MaterialCommunityIcons name="download-off" size={controlSize} color={color} />;
      break;
    case SourceTrackOfflineInfoStatus.Queued:
      contents = (
        <MaterialCommunityIcons name="progress-download" size={controlSize} color={color} />
      );
      break;
    case SourceTrackOfflineInfoStatus.Downloading:
      contents = observeProgress ? (
        <ObservedDownloadPie offlineInfo={offlineInfo} size={controlSize} color={color} />
      ) : (
        <Progress.Pie size={controlSize} color={color} progress={offlineInfo.percent} />
      );
      break;
    case SourceTrackOfflineInfoStatus.Failed:
      contents = <MaterialCommunityIcons name="download-off" size={controlSize} color={color} />;
      break;
    case SourceTrackOfflineInfoStatus.Succeeded:
      contents = <SourceTrackSucceededIndicator size={controlSize} />;
      break;
  }

  return <View className="pl-2">{contents}</View>;
}
