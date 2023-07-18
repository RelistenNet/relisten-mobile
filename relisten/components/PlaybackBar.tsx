import { MaterialIcons } from '@expo/vector-icons';
import { MotiText, MotiView, View } from 'moti';
import { useEffect, useReducer, useState } from 'react';
import { Text, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import Flex from './flex';
import { player } from '@/modules/relisten-audio-player';
import PlaybackMachine from '../machines/PlaybackMachine';
import { useActor } from '@xstate/react';
import { duration } from '../util/duration';

export const usePlaybackState = () => {
  const [state, setState] = useState<any>({});

  const percent = state?.progress?.elapsed / state?.progress?.duration || undefined;

  useEffect(() => {
    const listener = player.addPlaybackProgressListener((progress) => {
      setState((obj) => ({ ...obj, progress }));
    });

    const playback = player.addPlaybackStateListener((playbackState) => {
      if (playbackState?.newPlaybackState) {
        setState((obj) => ({ ...obj, playback: playbackState?.newPlaybackState }));
      }
    });

    return () => {
      listener.remove();
      playback.remove();
    };
  });

  return { ...state, percent };
};

export default function PlaybackBar() {
  const [machine] = useActor(PlaybackMachine);
  const playbackState = usePlaybackState();
  const [isDetail, toggleDetail] = useReducer((state) => !state, false);

  const playpause = () => {
    PlaybackMachine.send('PLAYPAUSE');
  };

  const activeTrack = machine.context.queue[machine.context.activeTrackIndex];

  return (
    <TouchableWithoutFeedback onPress={toggleDetail}>
      <MotiView
        from={{ opacity: 0, height: 0 }}
        animate={{
          opacity: 1,
          height: isDetail ? 400 : 64,
        }}
        transition={{ type: 'spring' }}
        className="bg-green-300"
      >
        <View className="relative h-1 w-full bg-orange-300">
          <MotiView
            // from={{ width: '100%' }}
            // animate={{ width: '25%' }}
            // from={{ width: 0, }}
            animate={{ width: (playbackState.percent ?? 0) * 250 }}
            className="absolute bottom-0 left-0 top-0 h-full w-full bg-blue-600"
          ></MotiView>
        </View>

        <Flex cn="h-full items-center gap-1">
          <TouchableOpacity onPress={() => PlaybackMachine.send('SKIP_BACK')}>
            <MaterialIcons name="skip-previous" size={32} color="black" />
          </TouchableOpacity>
          <TouchableOpacity onPress={playpause}>
            {machine.context.playbackState === 'Playing' ? (
              <MaterialIcons name="pause" size={32} color="black" />
            ) : (
              <MaterialIcons name="play-arrow" size={32} color="black" />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => PlaybackMachine.send('SKIP_FORWARD')}>
            <MaterialIcons name="skip-next" size={32} color="black" />
          </TouchableOpacity>
          <Flex column>
            <Text className="text-lg font-semibold">{activeTrack?.title}</Text>
            <Flex cn="flex-row">
              <Text
                numberOfLines={1}
                // animate={{
                //   translateX: -100,
                // }}
                className="text-sm"
              >
                {duration(playbackState.progress?.elapsed, playbackState.progress?.duration)}/
                {duration(playbackState.progress?.duration)}
              </Text>
              <TouchableOpacity onPress={() => player.seekTo(0.98)} className="pl-12">
                <Text className="text-sm">(Seek To 98%!)</Text>
              </TouchableOpacity>
            </Flex>
          </Flex>
        </Flex>
      </MotiView>
    </TouchableWithoutFeedback>
  );
}
