import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SoundIndicator } from '@/relisten/components/sound_indicator';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { useRelistenPlayerPlaybackState } from '@/relisten/player/relisten_player_hooks';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import type { PlayShow } from '@/relisten/player/ui/source_track_actions_menu';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { type ReactNode } from 'react';
import { TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { tw } from '@/relisten/util/tw';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';

interface SourceTrackProps {
  actions?: ReactNode;
  sourceTrack: SourceTrack;
  isLastTrackInSet: boolean;
  onPress?: PlayShow;
  showTrackNumber?: boolean;
  disabled?: boolean;
}

export const SourceTrackComponent = ({
  actions,
  sourceTrack,
  isLastTrackInSet,
  onPress,
  showTrackNumber,
  disabled,
}: SourceTrackProps) => {
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const playbackState = useRelistenPlayerPlaybackState();
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);
  const leadingColumnWidth = 28 * Math.max(fontScale, 1);

  const isPlayingThisTrack = currentPlayerTrack?.sourceTrack.uuid === sourceTrack.uuid;
  const shouldShowTrackNumber = showTrackNumber ?? true;
  const PressableView = disabled ? View : TouchableOpacity;

  return (
    <View className={tw('pl-6 pr-4', { 'opacity-60': disabled })}>
      <View className="flex-row items-center">
        <PressableView
          className="min-w-0 flex-1 flex-row items-center self-stretch"
          onPress={() => onPress?.(sourceTrack)}
        >
          {shouldShowTrackNumber && !isPlayingThisTrack && (
            <View className="self-center" style={{ width: leadingColumnWidth }}>
              <RelistenText className="text-lg text-gray-400" selectable={false}>
                {sourceTrack.trackPosition}
              </RelistenText>
            </View>
          )}

          {isPlayingThisTrack && (
            <View style={{ width: leadingColumnWidth }}>
              <SoundIndicator
                size={18 * controlScale}
                playing={playbackState === RelistenPlaybackState.Playing}
              />
            </View>
          )}

          <View className="min-w-0 flex-1 flex-row items-center">
            <RelistenText className="shrink py-2 pr-2 text-lg" selectable={false}>
              {sourceTrack.title}
            </RelistenText>
            <View className="flex-1" />
            <View className="shrink-0 flex-row items-center">
              <SourceTrackOfflineIndicator offlineInfo={sourceTrack.offlineInfo} />
              <RelistenText className="ml-2 text-right text-base text-gray-400" selectable={false}>
                {sourceTrack.humanizedDuration}
              </RelistenText>
            </View>
          </View>
        </PressableView>
        {actions}
      </View>
      {!isLastTrackInSet && (
        <View
          style={
            shouldShowTrackNumber || isPlayingThisTrack ? { marginLeft: leadingColumnWidth } : null
          }
        >
          <ItemSeparator />
        </View>
      )}
    </View>
  );
};
