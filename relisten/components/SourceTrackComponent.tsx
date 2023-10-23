import React from 'react';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { TouchableOpacity, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';

export type PlayShow = (sourceTrack?: SourceTrack) => void;

export const SourceTrackComponent: React.FC<{
  sourceTrack: SourceTrack;
  isLastTrackInSet: boolean;
  onPress: PlayShow;
  onDotsPress?: PlayShow;
  showTrackNumber?: boolean;
}> = ({ sourceTrack, isLastTrackInSet, onPress, onDotsPress, showTrackNumber }) => {
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();

  const isPlayingThisTrack = currentPlayerTrack?.sourceTrack.uuid === sourceTrack.uuid;

  showTrackNumber = showTrackNumber !== undefined ? showTrackNumber : true;
  return (
    <TouchableOpacity
      className="flex flex-row items-start pl-6 pr-4"
      onPress={() => onPress(sourceTrack)}
    >
      {showTrackNumber && !isPlayingThisTrack && (
        <View className="basis-7 pt-3">
          <RelistenText className="pt-[1] text-lg text-gray-400">
            {sourceTrack.trackPosition}
          </RelistenText>
        </View>
      )}

      {isPlayingThisTrack && (
        <View className="basis-7 pt-3.5">
          <MaterialIcons name="bar-chart" size={18} color="white" />
        </View>
      )}

      <View className="shrink flex-col">
        <View className="w-full grow flex-row items-center justify-between">
          <RelistenText className="shrink py-3 pr-2 text-lg">{sourceTrack.title}</RelistenText>
          <View className="grow"></View>
          <RelistenText className="py-3 text-base text-gray-400">
            {sourceTrack.humanizedDuration}
          </RelistenText>
          <TouchableOpacity
            className="shrink-0 grow-0 py-3 pl-4"
            onPress={() => {
              if (onDotsPress) {
                onDotsPress(sourceTrack);
              }
            }}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={16} color="white" />
          </TouchableOpacity>
        </View>
        {!isLastTrackInSet && <ItemSeparator />}
      </View>
    </TouchableOpacity>
  );
};
