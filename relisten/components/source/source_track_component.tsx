import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SoundIndicator } from '@/relisten/components/sound_indicator';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { useRelistenPlayerPlaybackState } from '@/relisten/player/relisten_player_hooks';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { PlayShow } from '@/relisten/player/ui/track_context_menu';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TouchableOpacity, View } from 'react-native';
import Flex from '../flex';
import { tw } from '@/relisten/util/tw';

interface SourceTrackProps {
  sourceTrack: SourceTrack;
  isLastTrackInSet: boolean;
  onPress?: PlayShow;
  onDotsPress?: PlayShow;
  showTrackNumber?: boolean;
  disabled?: boolean;
}

export const SourceTrackComponent = ({
  sourceTrack,
  isLastTrackInSet,
  onPress,
  onDotsPress,
  showTrackNumber,
  disabled,
}: SourceTrackProps) => {
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const playbackState = useRelistenPlayerPlaybackState();

  const isPlayingThisTrack = currentPlayerTrack?.sourceTrack.uuid === sourceTrack.uuid;

  const PressableView = disabled ? View : TouchableOpacity;

  showTrackNumber = showTrackNumber !== undefined ? showTrackNumber : true;
  return (
    <PressableView
      className={tw('flex flex-row items-start pl-6 pr-4', { 'opacity-60': disabled })}
      onPress={() => onPress && onPress(sourceTrack)}
    >
      {showTrackNumber && !isPlayingThisTrack && (
        <View className="basis-7 self-center">
          <RelistenText className="text-lg leading-[1] text-gray-400" selectable={false}>
            {sourceTrack.trackPosition}
          </RelistenText>
        </View>
      )}

      {isPlayingThisTrack && (
        <View className="basis-7 pt-2">
          <SoundIndicator size={18} playing={playbackState === RelistenPlaybackState.Playing} />
        </View>
      )}

      <View className="shrink flex-col">
        <View className="w-full grow flex-row items-center justify-between">
          <RelistenText className="shrink pr-2 text-lg leading-[1]" selectable={false}>
            {sourceTrack.title}
          </RelistenText>
          <View className="grow"></View>
          <SourceTrackOfflineIndicator offlineInfo={sourceTrack.offlineInfo} />

          <TouchableOpacity
            className="shrink-0 grow-0 px-2 py-3"
            onPress={() => {
              if (onDotsPress) {
                onDotsPress(sourceTrack);
              }
            }}
          >
            <Flex cn="items-center gap-2">
              <RelistenText
                className="basis-12 text-right text-base text-gray-400"
                selectable={false}
              >
                {sourceTrack.humanizedDuration}
              </RelistenText>
              <View className="h-[16px] overflow-hidden">
                <View style={{ marginTop: -4 }}>
                  <MaterialCommunityIcons
                    name="dots-horizontal"
                    size={24}
                    color="rgb(156, 163, 175)"
                  />
                </View>
              </View>
            </Flex>
          </TouchableOpacity>
        </View>
        {!isLastTrackInSet && <ItemSeparator />}
      </View>
    </PressableView>
  );
};
