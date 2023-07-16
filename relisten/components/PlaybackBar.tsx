import { MaterialIcons } from '@expo/vector-icons';
import { MotiText, MotiView, View } from 'moti';
import { useEffect, useReducer, useState } from 'react';
import { Text, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import Flex from './flex';
import { player } from '@/modules/relisten-audio-player';

export const usePlaybackState = () => {
  const [state, setState] = useState<any>({});

  const percent = state?.progress?.elapsed / state?.progress?.duration || undefined;

  useEffect(() => {
    const listener = player.addPlaybackProgressListener((progress) => {
      setState((obj) => ({ ...obj, progress }));
    });
    const download = player.addDownloadProgressListener((...args) =>
      console.log('download', ...args)
    );
    const playback = player.addPlaybackStateListener((playbackState) => {
      if (playbackState?.newPlaybackState) {
        setState((obj) => ({ ...obj, playback: playbackState?.newPlaybackState }));
      }
    });

    return () => {
      listener.remove();
      download.remove();
      playback.remove();
    };
  });

  return { ...state, percent };
};

export default function PlaybackBar() {
  const playbackState = usePlaybackState();
  const [isDetail, toggleDetail] = useReducer((state) => !state, false);

  const playpause = () => {
    if (playbackState.playback === 'Playing') return player.pause();
    else player.resume();
  };

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
            animate={{ width: (playbackState.percent ?? 0.05) * 250 }}
            className="absolute bottom-0 left-0 top-0 h-full w-full bg-blue-600"
          ></MotiView>
        </View>

        <Flex cn="h-full items-center gap-2">
          <TouchableOpacity onPress={playpause}>
            {playbackState.playback === 'Playing' ? (
              <MaterialIcons name="pause" size={32} color="black" />
            ) : (
              <MaterialIcons name="play-arrow" size={32} color="black" />
            )}
          </TouchableOpacity>
          <Flex column>
            <Text className="text-lg font-semibold">Tweezer</Text>
            <MotiText
              numberOfLines={1}
              // animate={{
              //   translateX: -100,
              // }}
              className="text-sm"
            >
              Phish &middot; 2023-07-16 &middot; Madison Square Garden, New York, NY
            </MotiText>
          </Flex>
        </Flex>
      </MotiView>
    </TouchableWithoutFeedback>
  );
}
